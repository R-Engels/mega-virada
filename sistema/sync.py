# -*- coding: utf-8 -*-
"""Sincronização automática de concursos da Mega-Sena e recálculo de estatísticas."""

import json
from datetime import datetime
from typing import Any

import requests

from .config import CAIXA_API_URL, FALLBACK_API_URL, MIRROR_API_URL
from .db import get_conn

HTTP_HEADERS = {"User-Agent": "MegaSenaPotenza/1.0", "Accept": "application/json"}


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _safe_float(val: Any) -> float:
    try:
        return float(val or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _build_record(
    concurso: int,
    data_str: str,
    dezenas_raw: list[Any],
    acumulada: bool,
    valor_acumulado: float,
    valor_estimado: float,
    data_proximo: str,
    premiacoes: list[dict],
) -> dict | None:
    try:
        nums = sorted(int(x) for x in dezenas_raw)
    except (TypeError, ValueError):
        return None
    if len(nums) != 6 or any(n < 1 or n > 60 for n in nums) or len(set(nums)) != 6:
        return None
    pares = sum(1 for n in nums if n % 2 == 0)
    baixas = sum(1 for n in nums if n <= 30)
    return {
        "concurso": int(concurso),
        "data_apuracao": str(data_str or ""),
        "d1": nums[0],
        "d2": nums[1],
        "d3": nums[2],
        "d4": nums[3],
        "d5": nums[4],
        "d6": nums[5],
        "dezenas_json": json.dumps(nums),
        "soma": sum(nums),
        "pares": pares,
        "impares": 6 - pares,
        "baixas": baixas,
        "altas": 6 - baixas,
        "acumulada": 1 if acumulada else 0,
        "valor_acumulado": _safe_float(valor_acumulado),
        "valor_estimado_proximo": _safe_float(valor_estimado),
        "data_proximo": str(data_proximo or ""),
        "premiacoes_json": json.dumps(premiacoes, ensure_ascii=False),
        "atualizado_em": _now_iso(),
    }


def normalize_caixa_payload(raw: dict) -> dict | None:
    """Normaliza resposta da API oficial da Caixa."""
    if not isinstance(raw, dict) or "numero" not in raw or not raw.get("listaDezenas"):
        return None
    prems = [
        {
            "faixa": p.get("faixa"),
            "descricao": p.get("descricaoFaixa", ""),
            "ganhadores": int(p.get("numeroDeGanhadores") or 0),
            "valorPremio": _safe_float(p.get("valorPremio")),
        }
        for p in (raw.get("listaRateioPremio") or [])
    ]
    return _build_record(
        concurso=int(raw["numero"]),
        data_str=raw.get("dataApuracao", ""),
        dezenas_raw=raw["listaDezenas"],
        acumulada=bool(raw.get("acumulado")),
        valor_acumulado=raw.get("valorAcumuladoProximoConcurso"),
        valor_estimado=raw.get("valorEstimadoProximoConcurso"),
        data_proximo=raw.get("dataProximoConcurso", ""),
        premiacoes=prems,
    )


def normalize_mirror_payload(raw: dict) -> dict | None:
    """Normaliza resposta do espelho loteriascaixa-api."""
    if not isinstance(raw, dict) or "concurso" not in raw or not raw.get("dezenas"):
        return None
    prems = [
        {
            "faixa": p.get("faixa"),
            "descricao": p.get("descricao", ""),
            "ganhadores": int(p.get("ganhadores") or 0),
            "valorPremio": _safe_float(p.get("valorPremio")),
        }
        for p in (raw.get("premiacoes") or [])
    ]
    return _build_record(
        concurso=int(raw["concurso"]),
        data_str=raw.get("data", ""),
        dezenas_raw=raw["dezenas"],
        acumulada=bool(raw.get("acumulou")),
        valor_acumulado=raw.get("valorAcumuladoProximoConcurso"),
        valor_estimado=raw.get("valorEstimadoProximoConcurso"),
        data_proximo=raw.get("dataProximoConcurso", ""),
        premiacoes=prems,
    )


def upsert_concursos(items: list[dict]) -> int:
    """Insere ou atualiza concursos no SQLite."""
    if not items:
        return 0
    sql = """
        INSERT INTO concursos (
            concurso, data_apuracao, d1, d2, d3, d4, d5, d6,
            dezenas_json, soma, pares, impares, baixas, altas,
            acumulada, valor_acumulado, valor_estimado_proximo,
            data_proximo, premiacoes_json, atualizado_em
        ) VALUES (
            :concurso, :data_apuracao, :d1, :d2, :d3, :d4, :d5, :d6,
            :dezenas_json, :soma, :pares, :impares, :baixas, :altas,
            :acumulada, :valor_acumulado, :valor_estimado_proximo,
            :data_proximo, :premiacoes_json, :atualizado_em
        )
        ON CONFLICT(concurso) DO UPDATE SET
            data_apuracao=excluded.data_apuracao,
            d1=excluded.d1, d2=excluded.d2, d3=excluded.d3,
            d4=excluded.d4, d5=excluded.d5, d6=excluded.d6,
            dezenas_json=excluded.dezenas_json,
            soma=excluded.soma, pares=excluded.pares, impares=excluded.impares,
            baixas=excluded.baixas, altas=excluded.altas,
            acumulada=excluded.acumulada,
            valor_acumulado=excluded.valor_acumulado,
            valor_estimado_proximo=excluded.valor_estimado_proximo,
            data_proximo=excluded.data_proximo,
            premiacoes_json=excluded.premiacoes_json,
            atualizado_em=excluded.atualizado_em
    """
    with get_conn() as conn:
        conn.executemany(sql, items)
    return len(items)


def recalculate_stats(window_recent: int = 100) -> dict:
    """Recalcula tabela stats_dezenas a partir de todos os concursos salvos."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT concurso, d1, d2, d3, d4, d5, d6 FROM concursos ORDER BY concurso ASC"
        ).fetchall()

        total = len(rows)
        if total == 0:
            return {"total_concursos": 0}

        max_conc = rows[-1]["concurso"]
        freq_total = {n: 0 for n in range(1, 61)}
        freq_50 = {n: 0 for n in range(1, 61)}
        freq_rec = {n: 0 for n in range(1, 61)}
        last_seen = {n: 0 for n in range(1, 61)}

        start_50 = max(0, total - 50)
        start_rec = max(0, total - window_recent)

        for idx, r in enumerate(rows):
            conc = r["concurso"]
            nums = (r["d1"], r["d2"], r["d3"], r["d4"], r["d5"], r["d6"])
            for n in nums:
                freq_total[n] += 1
                last_seen[n] = conc
                if idx >= start_50:
                    freq_50[n] += 1
                if idx >= start_rec:
                    freq_rec[n] += 1

        atrasos = {n: (max_conc - last_seen[n]) if last_seen[n] > 0 else total for n in range(1, 61)}
        max_ft = max(freq_total.values()) or 1
        max_fr = max(freq_rec.values()) or 1
        max_at = max(atrasos.values()) or 1

        records = []
        for n in range(1, 61):
            score = (
                0.4 * (freq_total[n] / max_ft)
                + 0.4 * (freq_rec[n] / max_fr)
                + 0.2 * (atrasos[n] / max_at)
            )
            records.append(
                (
                    n,
                    freq_total[n],
                    freq_50[n],
                    freq_rec[n],
                    last_seen[n],
                    atrasos[n],
                    round(score, 6),
                )
            )

        conn.executemany(
            """
            INSERT INTO stats_dezenas (
                dezena, freq_total, freq_recente_50, freq_recente_100,
                ultimo_concurso, atraso, score
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(dezena) DO UPDATE SET
                freq_total=excluded.freq_total,
                freq_recente_50=excluded.freq_recente_50,
                freq_recente_100=excluded.freq_recente_100,
                ultimo_concurso=excluded.ultimo_concurso,
                atraso=excluded.atraso,
                score=excluded.score
            """,
            records,
        )
        conn.execute(
            "INSERT OR REPLACE INTO metadata (chave, valor) VALUES ('ultimo_sync', ?)",
            (_now_iso(),),
        )
        return {"total_concursos": total, "ultimo_concurso": max_conc}


def _fetch_latest_caixa() -> dict | None:
    for url, norm in [
        (CAIXA_API_URL, normalize_caixa_payload),
        (f"{MIRROR_API_URL}/latest", normalize_mirror_payload),
        (FALLBACK_API_URL, normalize_caixa_payload),
    ]:
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=12)
            if resp.ok:
                rec = norm(resp.json())
                if rec:
                    return rec
        except Exception:
            continue
    return None


def _fetch_single_concurso(num: int) -> dict | None:
    for url, norm in [
        (f"{CAIXA_API_URL}/{num}", normalize_caixa_payload),
        (f"{MIRROR_API_URL}/{num}", normalize_mirror_payload),
    ]:
        try:
            resp = requests.get(url, headers=HTTP_HEADERS, timeout=10)
            if resp.ok:
                rec = norm(resp.json())
                if rec:
                    return rec
        except Exception:
            continue
    return None


def sync_concursos(force_full: bool = False) -> dict:
    """Sincroniza histórico completo (se vazio/forçado) ou apenas concursos novos."""
    with get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) AS cnt, COALESCE(MAX(concurso), 0) AS mx FROM concursos").fetchone()
        local_count = row["cnt"]
        local_max = row["mx"]

    latest = _fetch_latest_caixa()
    remote_max = latest["concurso"] if latest else local_max
    inserted = 0
    source = "local"

    if force_full or local_count == 0 or (remote_max - local_max) > 25:
        try:
            resp = requests.get(MIRROR_API_URL, headers=HTTP_HEADERS, timeout=45)
            if resp.ok:
                raw_list = resp.json()
                parsed = [r for r in (normalize_mirror_payload(item) for item in raw_list) if r is not None]
                if parsed:
                    inserted += upsert_concursos(parsed)
                    source = "mirror_full"
                    with get_conn() as conn:
                        local_max = conn.execute("SELECT COALESCE(MAX(concurso), 0) FROM concursos").fetchone()[0]
        except Exception:
            pass

    # Completa lacunas recentes pela API oficial da Caixa
    if latest and latest["concurso"] > local_max:
        batch = []
        start_c = local_max + 1 if local_max > 0 else max(1, latest["concurso"] - 10)
        for num in range(start_c, latest["concurso"]):
            rec = _fetch_single_concurso(num)
            if rec:
                batch.append(rec)
        batch.append(latest)
        inserted += upsert_concursos(batch)
        source = "caixa_incremental" if source == "local" else f"{source}+caixa"
    elif latest and latest["concurso"] == local_max:
        # Atualiza o último concurso caso tenha mudado estimativa/rateio
        upsert_concursos([latest])

    stats_info = recalculate_stats()
    return {
        "ok": True,
        "source": source,
        "sincronizados": inserted,
        "ultimo_remoto": remote_max,
        **stats_info,
    }


def get_sync_status() -> dict:
    """Retorna status atual da base local."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS total, COALESCE(MAX(concurso), 0) AS ultimo FROM concursos"
        ).fetchone()
        meta = conn.execute("SELECT valor FROM metadata WHERE chave='ultimo_sync'").fetchone()
        ultimo_row = None
        if row["ultimo"] > 0:
            ultimo_row = dict(
                conn.execute("SELECT * FROM concursos WHERE concurso = ?", (row["ultimo"],)).fetchone()
            )
            ultimo_row["dezenas"] = json.loads(ultimo_row["dezenas_json"])
            ultimo_row["premiacoes"] = json.loads(ultimo_row["premiacoes_json"])
    return {
        "total_concursos": row["total"],
        "ultimo_concurso": row["ultimo"],
        "ultimo_sync": meta["valor"] if meta else None,
        "ultimo_sorteio": ultimo_row,
    }
