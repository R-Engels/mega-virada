# -*- coding: utf-8 -*-
"""Motor estatístico, gerador filtrado, backtest e fechamentos combinatórios."""

import itertools
import json
import random
from collections import Counter

from .config import get_bet_price
from .db import get_conn


def _quadrant(n: int) -> int:
    """Retorna o quadrante (1..4) no volante 6x10 da Mega-Sena."""
    row = (n - 1) // 10  # 0..5
    col = (n - 1) % 10   # 0..9
    if row < 3 and col < 5:
        return 1
    if row < 3 and col >= 5:
        return 2
    if row >= 3 and col < 5:
        return 3
    return 4


def get_concursos(limit: int = 50, offset: int = 0, search: int | None = None) -> dict:
    """Lista concursos salvos em ordem decrescente."""
    with get_conn() as conn:
        if search is not None:
            rows = conn.execute(
                "SELECT * FROM concursos WHERE concurso = ? ORDER BY concurso DESC",
                (search,),
            ).fetchall()
            total = len(rows)
        else:
            total = conn.execute("SELECT COUNT(*) FROM concursos").fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM concursos ORDER BY concurso DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
    items = []
    for r in rows:
        d = dict(r)
        d["dezenas"] = json.loads(d["dezenas_json"])
        d["premiacoes"] = json.loads(d["premiacoes_json"])
        items.append(d)
    return {"total": total, "items": items}


def score_numbers(
    window_recent: int = 100,
    w_total: float = 0.4,
    w_recent: float = 0.4,
    w_delay: float = 0.2,
) -> list[dict]:
    """Calcula ranking estatístico das 60 dezenas com pesos customizáveis."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT concurso, d1, d2, d3, d4, d5, d6 FROM concursos ORDER BY concurso ASC"
        ).fetchall()

    total = len(rows)
    if total == 0:
        return [
            {
                "dezena": n,
                "freq_total": 0,
                "freq_recente": 0,
                "atraso": 0,
                "ultimo_concurso": 0,
                "score": 1.0,
            }
            for n in range(1, 61)
        ]

    max_conc = rows[-1]["concurso"]
    freq_total = Counter()
    freq_rec = Counter()
    last_seen = {n: 0 for n in range(1, 61)}
    start_rec = max(0, total - max(1, window_recent))

    for idx, r in enumerate(rows):
        conc = r["concurso"]
        for n in (r["d1"], r["d2"], r["d3"], r["d4"], r["d5"], r["d6"]):
            freq_total[n] += 1
            last_seen[n] = conc
            if idx >= start_rec:
                freq_rec[n] += 1

    atraso = {n: (max_conc - last_seen[n]) if last_seen[n] > 0 else total for n in range(1, 61)}
    max_ft = max(freq_total.values()) or 1
    max_fr = max(freq_rec.values()) or 1
    max_at = max(atraso.values()) or 1

    result = []
    for n in range(1, 61):
        sc = (
            w_total * (freq_total[n] / max_ft)
            + w_recent * (freq_rec[n] / max_fr)
            + w_delay * (atraso[n] / max_at)
        )
        result.append(
            {
                "dezena": n,
                "freq_total": freq_total[n],
                "freq_recente": freq_rec[n],
                "atraso": atraso[n],
                "ultimo_concurso": last_seen[n],
                "score": round(sc, 6),
            }
        )
    return result


def get_overview(window_recent: int = 100) -> dict:
    """Retorna visão geral estatística (quentes, frias, atrasadas, pares, médias)."""
    scored = score_numbers(window_recent=window_recent)
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT concurso, d1, d2, d3, d4, d5, d6, soma, pares, baixas FROM concursos ORDER BY concurso ASC"
        ).fetchall()

    total = len(rows)
    if total == 0:
        return {
            "total_concursos": 0,
            "dezenas": scored,
            "quentes": [],
            "frias": [],
            "atrasadas": [],
            "top_pares": [],
            "media_soma": 183.0,
            "dist_pares": {},
        }

    pair_counts = Counter()
    sum_total = 0
    parity_counts = Counter()
    for r in rows:
        nums = (r["d1"], r["d2"], r["d3"], r["d4"], r["d5"], r["d6"])
        sum_total += r["soma"]
        parity_counts[f"{r['pares']}P/{6 - r['pares']}I"] += 1
        for a, b in itertools.combinations(nums, 2):
            pair_counts[f"{a:02d}-{b:02d}"] += 1

    by_freq = sorted(scored, key=lambda x: (-x["freq_total"], x["dezena"]))
    by_delay = sorted(scored, key=lambda x: (-x["atraso"], x["dezena"]))
    by_score = sorted(scored, key=lambda x: (-x["score"], x["dezena"]))

    return {
        "total_concursos": total,
        "media_soma": round(sum_total / total, 2),
        "dist_pares": dict(parity_counts.most_common()),
        "dezenas": scored,
        "quentes": by_freq[:12],
        "frias": list(reversed(by_freq[-12:])),
        "atrasadas": by_delay[:12],
        "top_score": by_score[:12],
        "top_pares": [{"par": k, "ocorrencias": v} for k, v in pair_counts.most_common(15)],
    }


def check_filters(dezenas: list[int], last_draw: set[int], rules: dict) -> bool:
    """Valida um jogo contra os filtros estruturais das planilhas e PDFs."""
    k = len(dezenas)
    scale = k / 6.0

    # Paridade
    pares = sum(1 for n in dezenas if n % 2 == 0)
    parity_mode = rules.get("parity_mode", "balanced")
    if parity_mode == "3x3" and k == 6 and pares != 3:
        return False
    if parity_mode == "balanced":
        min_p = max(1, int(k * 0.33))
        max_p = min(k - 1, int(round(k * 0.67)))
        if pares < min_p or pares > max_p:
            return False

    # Soma proporcional ao tamanho da aposta (média 183 para 6 dezenas)
    soma = sum(dezenas)
    sum_min = int(rules.get("sum_min", 140) * scale)
    sum_max = int(rules.get("sum_max", 225) * scale)
    if soma < sum_min or soma > sum_max:
        return False

    # Máximo por linha (1..10, 11..20, ...) e por coluna (terminação 1..0)
    # Escala automaticamente quando k > 6 para evitar impossibilidade combinatória
    base_max_row = int(rules.get("max_per_row", 2))
    base_max_col = int(rules.get("max_per_col", 1))
    base_max_quad = int(rules.get("max_per_quadrant", 2))

    max_row = max(base_max_row, -(-k // 6) + (1 if k > 6 else 0))
    max_col = max(base_max_col, -(-k // 10) + (1 if k > 10 else 0))
    max_quad = max(base_max_quad, -(-k // 4) + (1 if k > 6 else 0))

    row_cnt = Counter((n - 1) // 10 for n in dezenas)
    if max(row_cnt.values()) > max_row:
        return False

    col_cnt = Counter((n - 1) % 10 for n in dezenas)
    if max(col_cnt.values()) > max_col:
        return False

    quad_cnt = Counter(_quadrant(n) for n in dezenas)
    if max(quad_cnt.values()) > max_quad:
        return False

    # Máximo repetidas do último concurso
    max_rep = int(rules.get("max_repeat_last", 2))
    if last_draw and len(set(dezenas) & last_draw) > max_rep:
        return False

    # Evitar apenas datas de aniversário (1..31): exige mínimo > 31
    min_above_31 = int(rules.get("min_above_31", max(1, k // 3)))
    if sum(1 for n in dezenas if n > 31) < min_above_31:
        return False

    # Máximo de números consecutivos (evitar sequências longas tipo 1,2,3,4)
    max_seq = int(rules.get("max_consecutive", 2))
    streak = 1
    for i in range(1, len(dezenas)):
        if dezenas[i] == dezenas[i - 1] + 1:
            streak += 1
            if streak > max_seq:
                return False
        else:
            streak = 1

    return True


def backtest_game(dezenas: list[int]) -> dict:
    """Simula quantas vezes a aposta teria acertado 3, 4, 5 ou 6 dezenas no histórico."""
    target = set(dezenas)
    with get_conn() as conn:
        rows = conn.execute("SELECT concurso, d1, d2, d3, d4, d5, d6 FROM concursos").fetchall()

    hits = {6: 0, 5: 0, 4: 0, 3: 0}
    melhores = []
    for r in rows:
        draw = {r["d1"], r["d2"], r["d3"], r["d4"], r["d5"], r["d6"]}
        acertos = len(target & draw)
        if acertos >= 3:
            hits[acertos] = hits.get(acertos, 0) + 1
        if acertos >= 4:
            melhores.append({"concurso": r["concurso"], "acertos": acertos})
    return {
        "total_analisado": len(rows),
        "sena": hits[6],
        "quina": hits[5],
        "quadra": hits[4],
        "terno": hits[3],
        "concursos_premiados": sorted(melhores, key=lambda x: (-x["acertos"], -x["concurso"]))[:15],
    }


def _weighted_sample(nums: list[int], weights: list[float], k: int) -> list[int]:
    """Amostragem ponderada sem reposição usando algoritmo Efraimidis-Spirakis."""
    scored = []
    for n, w in zip(nums, weights):
        u = max(random.random(), 1e-12)
        key = u ** (1.0 / max(w, 1e-6))
        scored.append((key, n))
    scored.sort(reverse=True)
    return sorted(n for _, n in scored[:k])


def generate_games(
    quantidade: int = 5,
    dezenas_por_jogo: int = 6,
    estrategia: str = "cobertura_bolao",
    rules: dict | None = None,
    exclude_signatures: set[str] | None = None,
    fixed_numbers: list[int] | None = None,
    excluded_numbers: list[int] | None = None,
    bolao_apostas: list[list[int]] | None = None,
) -> dict:
    """Gera jogos otimizando cobertura do bolão ou estatística, respeitando filtros."""
    rules = rules or {}
    exclude_signatures = exclude_signatures or set()
    fixed = sorted({int(n) for n in (fixed_numbers or []) if 1 <= int(n) <= 60})
    excluded = {int(n) for n in (excluded_numbers or []) if 1 <= int(n) <= 60} - set(fixed)

    if len(fixed) > dezenas_por_jogo:
        raise ValueError("Quantidade de dezenas fixas excede o tamanho da aposta.")

    if estrategia == "cobertura_bolao":
        return generate_optimal_bolao_games(
            bolao_apostas=bolao_apostas or [],
            quantidade=quantidade,
            dezenas_por_jogo=dezenas_por_jogo,
            rules=rules,
            exclude_signatures=exclude_signatures,
            fixed=fixed,
            excluded=excluded,
        )

    scored = score_numbers(
        window_recent=int(rules.get("window_recent", 100)),
        w_total=float(rules.get("w_total", 0.4)),
        w_recent=float(rules.get("w_recent", 0.4)),
        w_delay=float(rules.get("w_delay", 0.2)),
    )

    with get_conn() as conn:
        last_row = None
    last_draw = set()

    pool = [item for item in scored if item["dezena"] not in excluded and item["dezena"] not in fixed]
    pool_nums = [item["dezena"] for item in pool]

    if estrategia == "mais_frequentes":
        pool_weights = [max(item["freq_total"], 1) ** 2 for item in pool]
    elif estrategia == "mais_atrasadas":
        pool_weights = [(item["atraso"] + 1) ** 1.5 for item in pool]
    elif estrategia == "equilibrada_recente":
        pool_weights = [(item["freq_recente"] + 1) * (item["score"] + 0.1) for item in pool]
    elif estrategia == "aleatoria_filtrada":
        pool_weights = [1.0 for _ in pool]
    else:  # score_ponderado
        pool_weights = [max(item["score"], 0.05) ** 2 for item in pool]

    need = dezenas_por_jogo - len(fixed)
    if len(pool_nums) < need:
        raise ValueError("Pool insuficiente após exclusões para gerar aposta.")

    generated = []
    seen = set(exclude_signatures)
    use_filters = bool(rules.get("apply_filters", True))
    max_attempts = max(400, quantidade * 250)
    attempts = 0
    relaxed = False

    while len(generated) < quantidade and attempts < max_attempts:
        attempts += 1
        pick = _weighted_sample(pool_nums, pool_weights, need)
        candidate = sorted(fixed + pick)
        sig = "-".join(f"{n:02d}" for n in candidate)
        if sig in seen:
            continue
        if use_filters and not relaxed and not check_filters(candidate, last_draw, rules):
            if attempts > int(max_attempts * 0.8):
                relaxed = True
            else:
                continue
        seen.add(sig)
        bt = backtest_game(candidate)
        generated.append(
            {
                "dezenas": candidate,
                "assinatura": sig,
                "soma": sum(candidate),
                "pares": sum(1 for n in candidate if n % 2 == 0),
                "backtest": bt,
            }
        )

    return {
        "jogos": generated,
        "quantidade_gerada": len(generated),
        "dezenas_por_jogo": dezenas_por_jogo,
        "custo_unitario": get_bet_price(dezenas_por_jogo),
        "custo_total": round(get_bet_price(dezenas_por_jogo) * len(generated), 2),
        "filtros_relaxados": relaxed,
    }


def generate_optimal_bolao_games(
    bolao_apostas: list[list[int]],
    quantidade: int = 1,
    dezenas_por_jogo: int = 6,
    rules: dict | None = None,
    exclude_signatures: set[str] | None = None,
    fixed: list[int] | None = None,
    excluded: set[int] | None = None,
) -> dict:
    """Gera apostas maximizando cobertura de dezenas/pares inéditos e retorno anti-divisão."""
    rules = rules or {}
    fixed = fixed or []
    excluded = excluded or set()
    seen = set(exclude_signatures or set())

    num_freq = Counter({n: 0 for n in range(1, 61)})
    pair_freq = Counter()
    for jogo in bolao_apostas:
        for n in jogo:
            num_freq[n] += 1
        for a, b in itertools.combinations(sorted(jogo), 2):
            pair_freq[(a, b)] += 1

    with get_conn() as conn:
        last_row = None
    last_draw = set()

    pool_nums = [n for n in range(1, 61) if n not in excluded and n not in fixed]
    need = dezenas_por_jogo - len(fixed)
    if len(pool_nums) < need:
        raise ValueError("Pool insuficiente após exclusões para gerar aposta.")

    use_filters = bool(rules.get("apply_filters", True))
    generated = []
    relaxed = False

    for _ in range(quantidade):
        weights = [
            (1.0 / ((1 + num_freq[n]) ** 2.2)) * (1.25 if n > 31 else 1.0)
            for n in pool_nums
        ]

        best_candidate = None
        best_gain = -1.0
        best_meta = (0, 0)

        for attempt in range(250):
            pick = _weighted_sample(pool_nums, weights, need)
            cand = sorted(fixed + pick)
            sig = "-".join(f"{n:02d}" for n in cand)
            if sig in seen:
                continue
            if use_filters and attempt < 200 and not check_filters(cand, last_draw, rules):
                continue
            if attempt >= 200 and best_candidate is None:
                relaxed = True

            zeros_hit = sum(1 for n in cand if num_freq[n] == 0)
            new_pairs = sum(1 for a, b in itertools.combinations(cand, 2) if pair_freq[(a, b)] == 0)
            anti_crowd = sum(1 for n in cand if n > 31)
            gain = (
                zeros_hit * 10.0
                + sum(3.0 / (1 + num_freq[n]) for n in cand)
                + new_pairs * 1.5
                + anti_crowd * 0.5
            )
            if gain > best_gain:
                best_gain = gain
                best_candidate = cand
                best_meta = (zeros_hit, new_pairs)
            if attempt >= 45 and best_candidate is not None:
                break

        if not best_candidate:
            break

        sig = "-".join(f"{n:02d}" for n in best_candidate)
        seen.add(sig)
        for n in best_candidate:
            num_freq[n] += 1
        for a, b in itertools.combinations(best_candidate, 2):
            pair_freq[(a, b)] += 1

        generated.append(
            {
                "dezenas": best_candidate,
                "assinatura": sig,
                "soma": sum(best_candidate),
                "pares": sum(1 for n in best_candidate if n % 2 == 0),
                "dezenas_zeradas_cobertas": best_meta[0],
                "pares_ineditos": best_meta[1],
                "backtest": None,
            }
        )

    return {
        "jogos": generated,
        "quantidade_gerada": len(generated),
        "dezenas_por_jogo": dezenas_por_jogo,
        "custo_unitario": get_bet_price(dezenas_por_jogo),
        "custo_total": round(get_bet_price(dezenas_por_jogo) * len(generated), 2),
        "filtros_relaxados": relaxed,
    }


def generate_fechamento(
    dezenas_base: list[int],
    garantia: int = 4,
    condicao: int = 4,
    max_jogos: int = 120,
) -> dict:
    """Gera fechamento reduzido de 7..18 dezenas em cartões de 6 dezenas."""
    base = sorted({int(n) for n in dezenas_base if 1 <= int(n) <= 60})
    n = len(base)
    if n < 7 or n > 18:
        raise ValueError("Escolha entre 7 e 18 dezenas para o fechamento.")

    target_k = max(3, min(5, garantia))
    uncovered = set(itertools.combinations(base, target_k))
    total_targets = len(uncovered)

    all_6 = list(itertools.combinations(base, 6))
    selected = []

    if len(all_6) <= 3500:
        candidates = all_6
    else:
        candidates = random.sample(all_6, 2000)

    while uncovered and len(selected) < max_jogos:
        best_ticket = None
        best_cov = set()
        sample_pool = candidates if len(candidates) <= 600 else random.sample(candidates, 600)
        for ticket in sample_pool:
            subs = set(itertools.combinations(ticket, target_k))
            cov = subs & uncovered
            if len(cov) > len(best_cov):
                best_cov = cov
                best_ticket = ticket
                if len(cov) == (15 if target_k == 4 else 6):
                    break
        if not best_ticket or not best_cov:
            break
        selected.append(list(best_ticket))
        uncovered -= best_cov

    covered_pct = round(((total_targets - len(uncovered)) / total_targets) * 100, 2) if total_targets else 100.0
    jogos_info = [
        {
            "dezenas": t,
            "assinatura": "-".join(f"{x:02d}" for x in t),
            "soma": sum(t),
            "pares": sum(1 for x in t if x % 2 == 0),
        }
        for t in selected
    ]
    custo_fechamento = get_bet_price(6) * len(selected)
    custo_cheio = get_bet_price(n) if n <= 20 else 0.0
    economia = round(max(0.0, custo_cheio - custo_fechamento), 2) if custo_cheio else 0.0

    return {
        "dezenas_base": base,
        "garantia": target_k,
        "total_jogos": len(selected),
        "cobertura_percentual": covered_pct,
        "custo_fechamento": round(custo_fechamento, 2),
        "custo_aposta_multipla_cheia": custo_cheio,
        "economia_estimada": economia,
        "jogos": jogos_info,
    }
