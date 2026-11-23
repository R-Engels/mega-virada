# -*- coding: utf-8 -*-
"""Serviço do Setor Bolão Potenza: gestão, validação, catálogo de nomes, importação XLSX e conferência."""

import json
from datetime import datetime

import openpyxl

from .config import MAX_DEZENAS_APOSTA, MIN_DEZENAS_APOSTA, WORKSPACE_DIR, get_bet_price
from .db import get_conn

NOMES_PREDEFINIDOS = [
    "ADEMIR MINUZZO FURLAN",
    "ADRIANI DE OLIVEIRA LIMA",
    "ADRIANO RODRIGO NEVES DE SOUZA",
    "AGATA DE ANDRADE RIBEIRO",
    "ALCIONE JOSE TORQUATO DE JESUS",
    "ALEXANDRE RIBEIRO DA SILVA",
    "ALEXSANDRO LIMA DA SILVA",
    "ALMIRO ALENCAR DE MEDEIROS JUNIOR",
    "ANNE AMABILE MOREIRA DA SILVA",
    "ANTHONY FELIPE DE SÁ RAMOS",
    "BRUNO HENRIQUE DE OLIVEIRA",
    "CAMILA BASTOS",
    "CARLA FERNANDA MADRUGA",
    "CARLOS IRAN COELHO DE LIZ",
    "CARMEM",
    "CHARLESTON RAMOS SOEIRA",
    "CLEBER DOS SANTOS LIMA",
    "CLERIS LOURENÇO RODRIGUES DA SILVA",
    "DACIO BRANDAO DA SILVA",
    "DANIELE ARRUDA DE PAULA",
    "DENILSON SOARES DOS SANTOS BARBOSA",
    "DIEGO ANTUNES RECH",
    "DIONE MARCOS ARMILIATO",
    "DIOGO PASETTI DE MORAES",
    "EMILIE EDUARDA SCHONARDIE TRINDADE",
    "FABIANO OLIVEIRA MORAES",
    "FERNANDO DA ROSA DELFES",
    "FRANCIELE WARMLING BRANCO",
    "GABRIEL BRANCO OLIVEIRA",
    "GABRIEL HENRIQUE PASSETI",
    "GILBERTO GOGACZ",
    "GUSTAVO RISOTTO GUSTAVO",
    "HENRIQUE HELAMÃ CUNHA GARCIA",
    "HERIK DE MELO FIGUEIREDO",
    "IGOR RODRIGO COSTA OLIVEIRA",
    "ISRAEL RANK",
    "JESSICA GOMES WACHSMANN",
    "JOÃO LUCAS ROSAR AZZI",
    "JOBSON PICKLER DORROITE",
    "JONATAN MORAES PEREIRA",
    "JOSE SOLI DA ROSA",
    "JULIA GODOI DE AZEVEDO",
    "JUSTINA INES DE OLIVEIRA",
    "KARINE ZAMBON ALMEIDA",
    "KAUAN RIBEIRO TORQUATO",
    "LAURI",
    "LAVÍNIA EMANUELLI BRANCO",
    "LEONARDO ARMILIATO DE LIMA",
    "LEONARDO PETRY GALVANI",
    "LINDOLFO DOS SANTOS SALDANHA",
    "LUCAS ADRIANO DO AMARAL",
    "LUCAS ANTUNES DA SILVA",
    "LUCAS SANTOS SAVI MONDO",
    "LUCIANO NAZARENO SILVA",
    "MARIA JULIA SOUZA DA SILVA",
    "MATEUS MARCOS ANTUNES",
    "MATHEUS ALMEIDA NUNES",
    "MAURO MARCELO DOS SANTOS DE LIZ",
    "MAYARA VARELA PEREIRA",
    "NICOLAS ANDERSON GUEDES",
    "PABLO HENRIQUE HENKEMAIER DA LUZ",
    "PAULO AUGUSTO SILVA DE LIZ",
    "PAULO SERGIO MACHADO BORGES",
    "POLIANA DE OLIVEIRA COELHO",
    "RAFAEL ENGELS",
    "RODRIGO CARROS DE ARRUDA",
    "RODRIGO CHAVES",
    "VERONICA",
    "WESLEI AMARAL MOTA",
]


def _now_iso() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def ensure_catalogo_nomes() -> None:
    """Popula a lista pré-definida de nomes caso ainda não exista."""
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO catalogo_nomes (nome, origem) VALUES (?, 'predefinido')",
            [(n,) for n in NOMES_PREDEFINIDOS],
        )


def list_catalogo_nomes() -> list[dict]:
    """Lista todos os nomes disponíveis na lista suspensa."""
    ensure_catalogo_nomes()
    with get_conn() as conn:
        rows = conn.execute("SELECT id, nome, origem FROM catalogo_nomes ORDER BY nome ASC").fetchall()
    return [dict(r) for r in rows]


def add_catalogo_nome(nome: str, origem: str = "manual") -> dict:
    """Adiciona um nome manualmente ao catálogo."""
    clean = " ".join((nome or "").strip().upper().split())
    if not clean:
        raise ValueError("Informe um nome válido.")
    ensure_catalogo_nomes()
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO catalogo_nomes (nome, origem) VALUES (?, ?)",
            (clean, origem),
        )
        row = conn.execute("SELECT id, nome, origem FROM catalogo_nomes WHERE nome = ?", (clean,)).fetchone()
    return dict(row)


def validate_and_normalize_game(dezenas: list[int], expected_size: int | None = None) -> tuple[list[int], str]:
    """Valida unicidade, intervalo 1..60, limite do bolão e ordena dezenas."""
    try:
        nums = [int(x) for x in dezenas]
    except (TypeError, ValueError) as exc:
        raise ValueError("Dezenas inválidas.") from exc

    if len(nums) != len(set(nums)):
        raise ValueError("O jogo possui dezenas repetidas.")
    if any(n < 1 or n > 60 for n in nums):
        raise ValueError("Todas as dezenas devem estar entre 01 e 60.")
    if len(nums) < MIN_DEZENAS_APOSTA or len(nums) > MAX_DEZENAS_APOSTA:
        raise ValueError(f"A aposta deve ter entre {MIN_DEZENAS_APOSTA} e {MAX_DEZENAS_APOSTA} dezenas.")
    if expected_size is not None and len(nums) != expected_size:
        raise ValueError(f"Este bolão exige exatamente {expected_size} dezenas por aposta (recebido: {len(nums)}).")

    nums.sort()
    sig = "-".join(f"{n:02d}" for n in nums)
    return nums, sig


def list_boloes() -> list[dict]:
    """Lista todos os bolões com contadores de participantes com jogos e apostas."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT b.*,
                   (SELECT COUNT(DISTINCT a.participante_id)
                    FROM apostas a WHERE a.bolao_id = b.id AND a.participante_id IS NOT NULL) AS total_participantes,
                   (SELECT COUNT(*) FROM participantes p
                    WHERE p.bolao_id = b.id AND p.pago = 1
                      AND EXISTS (SELECT 1 FROM apostas a WHERE a.participante_id = p.id)) AS participantes_pagos,
                   (SELECT COUNT(*) FROM apostas a WHERE a.bolao_id = b.id) AS total_apostas
            FROM boloes b
            ORDER BY b.id DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def create_bolao(
    nome: str,
    concurso_alvo: int | None = None,
    dezenas_por_jogo: int = 6,
    jogos_por_cota: int = 4,
    valor_cota: float | None = None,
    valor_jogo: float | None = None,
    observacoes: str = "",
) -> dict:
    """Cria novo bolão."""
    nome = (nome or "").strip()
    if not nome:
        raise ValueError("Informe o nome do bolão.")
    dezenas_por_jogo = max(MIN_DEZENAS_APOSTA, min(MAX_DEZENAS_APOSTA, int(dezenas_por_jogo)))
    jogos_por_cota = max(1, int(jogos_por_cota))
    vj = float(valor_jogo) if valor_jogo is not None else get_bet_price(dezenas_por_jogo)
    vc = float(valor_cota) if valor_cota is not None else round(vj * jogos_por_cota, 2)
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO boloes (nome, concurso_alvo, dezenas_por_jogo, jogos_por_cota, valor_cota, valor_jogo, observacoes, criado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (nome, concurso_alvo, dezenas_por_jogo, jogos_por_cota, vc, vj, observacoes or "", _now_iso()),
        )
        bid = cur.lastrowid
    return get_bolao_detail(bid)


def update_bolao(bolao_id: int, payload: dict) -> dict:
    """Atualiza parâmetros do bolão; bloqueia alterações estruturais após a 1ª aposta."""
    locked_cols = ("dezenas_por_jogo", "jogos_por_cota", "valor_jogo", "valor_cota")
    with get_conn() as conn:
        cnt = conn.execute("SELECT COUNT(*) FROM apostas WHERE bolao_id = ?", (bolao_id,)).fetchone()[0]
        if cnt > 0 and any(col in payload for col in locked_cols):
            raise ValueError("Bolão já iniciado (possui apostas). As configurações não podem mais ser alteradas.")

        fields = []
        values = []
        for col in ("nome", "concurso_alvo", "dezenas_por_jogo", "jogos_por_cota", "valor_cota", "valor_jogo", "observacoes"):
            if col in payload:
                val = payload[col]
                if col == "dezenas_por_jogo":
                    val = max(MIN_DEZENAS_APOSTA, min(MAX_DEZENAS_APOSTA, int(val)))
                elif col == "jogos_por_cota":
                    val = max(1, int(val))
                fields.append(f"{col} = ?")
                values.append(val)
        if fields:
            values.append(bolao_id)
            conn.execute(f"UPDATE boloes SET {', '.join(fields)} WHERE id = ?", values)
    return get_bolao_detail(bolao_id)


def delete_bolao(bolao_id: int) -> None:
    """Remove bolão e seus dados associados."""
    with get_conn() as conn:
        conn.execute("DELETE FROM apostas WHERE bolao_id = ?", (bolao_id,))
        conn.execute("DELETE FROM participantes WHERE bolao_id = ?", (bolao_id,))
        conn.execute("DELETE FROM boloes WHERE id = ?", (bolao_id,))


def get_bolao_detail(bolao_id: int) -> dict:
    """Retorna detalhes do bolão; pagamentos exibe apenas quem já tem jogo no bolão."""
    with get_conn() as conn:
        b = conn.execute("SELECT * FROM boloes WHERE id = ?", (bolao_id,)).fetchone()
        if not b:
            raise ValueError("Bolão não encontrado.")
        bolao = dict(b)

        parts = [
            dict(r)
            for r in conn.execute(
                """
                SELECT p.*,
                       (SELECT COUNT(*) FROM apostas a WHERE a.participante_id = p.id) AS total_jogos
                FROM participantes p
                WHERE p.bolao_id = ?
                  AND EXISTS (SELECT 1 FROM apostas a WHERE a.participante_id = p.id)
                ORDER BY p.nome ASC
                """,
                (bolao_id,),
            ).fetchall()
        ]
        jogos_cota = int(bolao.get("jogos_por_cota") or 4)
        for p in parts:
            p["meta_jogos"] = p["cotas"] * jogos_cota
            p["jogos_restantes"] = max(0, p["meta_jogos"] - p["total_jogos"])

        apostas_raw = conn.execute(
            """
            SELECT a.*, COALESCE(p.nome, 'Bolão Geral') AS participante_nome
            FROM apostas a
            LEFT JOIN participantes p ON p.id = a.participante_id
            WHERE a.bolao_id = ?
            ORDER BY a.id DESC
            """,
            (bolao_id,),
        ).fetchall()

    apostas = []
    sig_counts = {}
    for r in apostas_raw:
        item = dict(r)
        item["dezenas"] = json.loads(item["dezenas_json"])
        sig_counts[item["assinatura"]] = sig_counts.get(item["assinatura"], 0) + 1
        apostas.append(item)

    for item in apostas:
        item["duplicada_no_bolao"] = sig_counts[item["assinatura"]] > 1

    total_cotas = sum(p["cotas"] for p in parts)
    total_arrecadado = sum(p["valor_pago"] if p["pago"] else 0.0 for p in parts)
    custo_apostas = sum(
        bolao["valor_jogo"] if a["tipo_aposta"] == bolao["dezenas_por_jogo"] else get_bet_price(a["tipo_aposta"])
        for a in apostas
    )
    previsto_cotas = total_cotas * bolao["valor_cota"]

    bolao["participantes"] = parts
    bolao["apostas"] = apostas
    bolao["estatisticas"] = compute_bolao_stats(apostas)
    bolao["resumo"] = {
        "total_participantes": len(parts),
        "participantes_pagos": sum(1 for p in parts if p["pago"]),
        "total_cotas": total_cotas,
        "total_apostas": len(apostas),
        "jogos_duplicados": sum(1 for c in sig_counts.values() if c > 1),
        "custo_total_apostas": round(custo_apostas, 2),
        "previsto_cotas": round(previsto_cotas, 2),
        "total_arrecadado": round(total_arrecadado, 2),
        "saldo_faltante": round(max(0.0, max(custo_apostas, previsto_cotas) - total_arrecadado), 2),
    }
    return bolao


def compute_bolao_stats(apostas: list[dict]) -> dict:
    """Calcula estatísticas exclusivas dos jogos cadastrados no bolão atual."""
    freq = {n: 0 for n in range(1, 61)}
    soma_total = 0
    paridade = {}
    for a in apostas:
        nums = a["dezenas"]
        soma_total += sum(nums)
        pares = sum(1 for x in nums if x % 2 == 0)
        key = f"{pares}P/{len(nums) - pares}I"
        paridade[key] = paridade.get(key, 0) + 1
        for n in nums:
            if 1 <= n <= 60:
                freq[n] += 1

    total = len(apostas)
    dezenas_list = [{"dezena": n, "freq": freq[n]} for n in range(1, 61)]
    mais_jogadas = sorted(dezenas_list, key=lambda x: (-x["freq"], x["dezena"]))
    nao_jogadas = [d["dezena"] for d in dezenas_list if d["freq"] == 0]
    cobertura = round(((60 - len(nao_jogadas)) / 60.0) * 100, 1)

    return {
        "total_jogos": total,
        "media_soma": round(soma_total / total, 1) if total else 0.0,
        "cobertura_volante_pct": cobertura,
        "dezenas_nao_jogadas": nao_jogadas,
        "mais_jogadas": [d for d in mais_jogadas if d["freq"] > 0][:12],
        "dist_paridade": paridade,
        "dezenas": dezenas_list,
    }


def _get_or_create_participante(conn, bolao_id: int, nome: str, cotas: int = 1, pago: bool = False) -> int:
    clean = " ".join((nome or "").strip().upper().split())
    if not clean:
        raise ValueError("Informe o nome do participante.")
    existing = conn.execute(
        "SELECT id FROM participantes WHERE bolao_id = ? AND UPPER(nome) = ?",
        (bolao_id, clean),
    ).fetchone()
    if existing:
        return existing["id"]

    b = conn.execute("SELECT valor_cota FROM boloes WHERE id = ?", (bolao_id,)).fetchone()
    if not b:
        raise ValueError("Bolão não encontrado.")
    vp = round(b["valor_cota"] * max(1, int(cotas)), 2) if pago else 0.0
    cur = conn.execute(
        "INSERT INTO participantes (bolao_id, nome, cotas, pago, valor_pago) VALUES (?, ?, ?, ?, ?)",
        (bolao_id, clean, max(1, int(cotas)), 1 if pago else 0, vp),
    )
    return cur.lastrowid


def add_participante(
    bolao_id: int,
    nome: str,
    cotas: int = 1,
    pago: bool = False,
    valor_pago: float | None = None,
) -> dict:
    """Adiciona participante ao bolão (e ao catálogo de nomes)."""
    clean = " ".join((nome or "").strip().upper().split())
    if not clean:
        raise ValueError("Informe o nome do participante.")
    add_catalogo_nome(clean, origem="manual")
    with get_conn() as conn:
        b = conn.execute("SELECT valor_cota FROM boloes WHERE id = ?", (bolao_id,)).fetchone()
        if not b:
            raise ValueError("Bolão não encontrado.")
        vp = float(valor_pago) if valor_pago is not None else (b["valor_cota"] * cotas if pago else 0.0)
        cur = conn.execute(
            "INSERT INTO participantes (bolao_id, nome, cotas, pago, valor_pago) VALUES (?, ?, ?, ?, ?)",
            (bolao_id, clean, max(1, int(cotas)), 1 if pago else 0, vp),
        )
        pid = cur.lastrowid
        row = conn.execute("SELECT * FROM participantes WHERE id = ?", (pid,)).fetchone()
    return dict(row)


def update_participante(part_id: int, payload: dict) -> dict:
    """Atualiza participante (pagamento, cotas, nome)."""
    with get_conn() as conn:
        cur_row = conn.execute(
            """
            SELECT p.*, b.valor_cota FROM participantes p
            JOIN boloes b ON b.id = p.bolao_id
            WHERE p.id = ?
            """,
            (part_id,),
        ).fetchone()
        if not cur_row:
            raise ValueError("Participante não encontrado.")
        nome = " ".join(str(payload.get("nome", cur_row["nome"])).strip().upper().split())
        cotas = max(1, int(payload.get("cotas", cur_row["cotas"])))
        pago = 1 if payload.get("pago", bool(cur_row["pago"])) else 0
        if "valor_pago" in payload:
            valor_pago = float(payload["valor_pago"])
        elif "pago" in payload:
            valor_pago = round(cotas * cur_row["valor_cota"], 2) if pago else 0.0
        else:
            valor_pago = cur_row["valor_pago"]

        conn.execute(
            "UPDATE participantes SET nome=?, cotas=?, pago=?, valor_pago=? WHERE id=?",
            (nome, cotas, pago, valor_pago, part_id),
        )
        updated = conn.execute("SELECT * FROM participantes WHERE id = ?", (part_id,)).fetchone()
    return dict(updated)


def delete_participante(part_id: int) -> None:
    """Remove participante e suas apostas do bolão."""
    with get_conn() as conn:
        conn.execute("DELETE FROM apostas WHERE participante_id = ?", (part_id,))
        conn.execute("DELETE FROM participantes WHERE id = ?", (part_id,))


def copy_participantes(target_bolao_id: int, source_bolao_id: int) -> int:
    """Copia participantes de um bolão anterior com pagamento zerado."""
    with get_conn() as conn:
        existing = {
            r["nome"].upper()
            for r in conn.execute("SELECT nome FROM participantes WHERE bolao_id = ?", (target_bolao_id,)).fetchall()
        }
        src = conn.execute(
            "SELECT nome, cotas FROM participantes WHERE bolao_id = ? ORDER BY id ASC",
            (source_bolao_id,),
        ).fetchall()
        to_add = [
            (target_bolao_id, r["nome"], r["cotas"], 0, 0.0)
            for r in src
            if r["nome"].upper() not in existing
        ]
        if to_add:
            conn.executemany(
                "INSERT INTO participantes (bolao_id, nome, cotas, pago, valor_pago) VALUES (?, ?, ?, ?, ?)",
                to_add,
            )
    return len(to_add)


def add_aposta(
    bolao_id: int,
    participante_id: int | None,
    dezenas: list[int],
    origem: str = "manual",
    allow_duplicate: bool = False,
    participante_nome: str | None = None,
    enforce_size: bool = True,
) -> dict:
    """Cadastra aposta validada no bolão respeitando limite de dezenas e cota do participante."""
    with get_conn() as conn:
        b = conn.execute("SELECT dezenas_por_jogo, jogos_por_cota FROM boloes WHERE id = ?", (bolao_id,)).fetchone()
        if not b:
            raise ValueError("Bolão não encontrado.")
        expected = int(b["dezenas_por_jogo"]) if enforce_size else None
        jogos_por_cota = int(b["jogos_por_cota"]) if b["jogos_por_cota"] else 4
        nums, sig = validate_and_normalize_game(dezenas, expected_size=expected)

        if not allow_duplicate:
            dup = conn.execute(
                "SELECT id FROM apostas WHERE bolao_id = ? AND assinatura = ?",
                (bolao_id, sig),
            ).fetchone()
            if dup:
                raise ValueError(f"Jogo {sig} já cadastrado neste bolão. Não são permitidos jogos duplicados.")

        pid = participante_id
        if pid is None and participante_nome and str(participante_nome).strip():
            clean_name = " ".join(str(participante_nome).strip().upper().split())
            conn.execute("INSERT OR IGNORE INTO catalogo_nomes (nome, origem) VALUES (?, 'manual')", (clean_name,))
            pid = _get_or_create_participante(conn, bolao_id, clean_name)

        if pid is not None:
            p_row = conn.execute("SELECT nome, cotas FROM participantes WHERE id = ?", (pid,)).fetchone()
            if p_row:
                p_nome = p_row["nome"]
                p_cotas = max(1, int(p_row["cotas"]))
                limite_jogos = p_cotas * jogos_por_cota
                qtd_atual = conn.execute(
                    "SELECT COUNT(*) FROM apostas WHERE bolao_id = ? AND participante_id = ?",
                    (bolao_id, pid),
                ).fetchone()[0]
                if qtd_atual >= limite_jogos:
                    raise ValueError(
                        f"Limite atingido: {p_nome} já completou sua cota de {limite_jogos} jogos neste bolão ({qtd_atual}/{limite_jogos})."
                    )

        cur = conn.execute(
            """
            INSERT INTO apostas (bolao_id, participante_id, dezenas_json, assinatura, tipo_aposta, origem, criado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (bolao_id, pid, json.dumps(nums), sig, len(nums), origem, _now_iso()),
        )
        aid = cur.lastrowid
        row = conn.execute("SELECT * FROM apostas WHERE id = ?", (aid,)).fetchone()
    d = dict(row)
    d["dezenas"] = nums
    return d


def add_apostas_batch(
    bolao_id: int,
    participante_id: int | None,
    jogos: list[list[int]],
    origem: str = "gerador",
    allow_duplicate: bool = False,
    participante_nome: str | None = None,
) -> dict:
    """Cadastra lote de apostas respeitando a cota do participante (calcula complemento)."""
    with get_conn() as conn:
        b = conn.execute("SELECT dezenas_por_jogo, jogos_por_cota FROM boloes WHERE id = ?", (bolao_id,)).fetchone()
        if not b:
            raise ValueError("Bolão não encontrado.")
        jogos_por_cota = int(b["jogos_por_cota"]) if b["jogos_por_cota"] else 4

        pid = participante_id
        if pid is None and participante_nome and str(participante_nome).strip():
            clean_name = " ".join(str(participante_nome).strip().upper().split())
            conn.execute("INSERT OR IGNORE INTO catalogo_nomes (nome, origem) VALUES (?, 'manual')", (clean_name,))
            pid = _get_or_create_participante(conn, bolao_id, clean_name)

        if pid is not None:
            p_row = conn.execute("SELECT nome, cotas FROM participantes WHERE id = ?", (pid,)).fetchone()
            if p_row:
                p_nome = p_row["nome"]
                p_cotas = max(1, int(p_row["cotas"]))
                limite_jogos = p_cotas * jogos_por_cota
                qtd_atual = conn.execute(
                    "SELECT COUNT(*) FROM apostas WHERE bolao_id = ? AND participante_id = ?",
                    (bolao_id, pid),
                ).fetchone()[0]
                vagas = max(0, limite_jogos - qtd_atual)
                if vagas <= 0:
                    raise ValueError(
                        f"Limite atingido: {p_nome} já completou a meta de {limite_jogos} jogos neste bolão ({qtd_atual}/{limite_jogos})."
                    )
                if len(jogos) > vagas:
                    jogos = jogos[:vagas]

    inserted = []
    skipped = []
    for jogo in jogos:
        try:
            inserted.append(
                add_aposta(
                    bolao_id,
                    pid,
                    jogo,
                    origem=origem,
                    allow_duplicate=allow_duplicate,
                    participante_nome=participante_nome,
                )
            )
        except ValueError as err:
            skipped.append({"jogo": jogo, "motivo": str(err)})
    return {"inseridas": len(inserted), "ignoradas": skipped, "itens": inserted}


def delete_aposta(aposta_id: int) -> None:
    """Exclui aposta e remove participante sem jogos que ainda esteja pendente."""
    with get_conn() as conn:
        row = conn.execute("SELECT participante_id FROM apostas WHERE id = ?", (aposta_id,)).fetchone()
        conn.execute("DELETE FROM apostas WHERE id = ?", (aposta_id,))
        if row and row["participante_id"]:
            pid = row["participante_id"]
            rem = conn.execute("SELECT COUNT(*) FROM apostas WHERE participante_id = ?", (pid,)).fetchone()[0]
            if rem == 0:
                conn.execute("DELETE FROM participantes WHERE id = ? AND pago = 0", (pid,))


def conferir_bolao(
    bolao_id: int,
    concurso_num: int | None = None,
    dezenas_manuais: list[int] | None = None,
) -> dict:
    """Confere todas as apostas do bolão contra dezenas informadas ou concurso da Caixa."""
    detail = get_bolao_detail(bolao_id)
    premio_por_faixa = {6: 0.0, 5: 0.0, 4: 0.0}
    conc_label = "Manual"
    data_apuracao = datetime.now().strftime("%d/%m/%Y")

    if dezenas_manuais:
        sorteadas_list, _ = validate_and_normalize_game(dezenas_manuais, expected_size=6)
        sorteadas = set(sorteadas_list)
    else:
        with get_conn() as conn:
            if concurso_num:
                row = conn.execute("SELECT * FROM concursos WHERE concurso = ?", (concurso_num,)).fetchone()
            else:
                row = conn.execute("SELECT * FROM concursos ORDER BY concurso DESC LIMIT 1").fetchone()
            if not row:
                raise ValueError("Concurso não encontrado. Clique em 'Atualizar Resultado Caixa' ou digite as 6 dezenas.")
        conc = dict(row)
        conc_label = conc["concurso"]
        data_apuracao = conc["data_apuracao"]
        sorteadas = set(json.loads(conc["dezenas_json"]))
        for p in json.loads(conc["premiacoes_json"]):
            faixa = p.get("faixa")
            if faixa == 1:
                premio_por_faixa[6] = float(p.get("valorPremio") or 0.0)
            elif faixa == 2:
                premio_por_faixa[5] = float(p.get("valorPremio") or 0.0)
            elif faixa == 3:
                premio_por_faixa[4] = float(p.get("valorPremio") or 0.0)

    resultados = []
    contagem = {6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0}
    premio_total = 0.0
    ranking_part = {}

    for a in detail["apostas"]:
        hits = sorted(set(a["dezenas"]) & sorteadas)
        qtd = len(hits)
        contagem[qtd] = contagem.get(qtd, 0) + 1
        premio = premio_por_faixa.get(qtd, 0.0)
        premio_total += premio

        pname = a["participante_nome"]
        if pname not in ranking_part:
            ranking_part[pname] = {"participante": pname, "melhor_acerto": 0, "total_acertos": 0, "jogos": 0}
        ranking_part[pname]["jogos"] += 1
        ranking_part[pname]["total_acertos"] += qtd
        ranking_part[pname]["melhor_acerto"] = max(ranking_part[pname]["melhor_acerto"], qtd)

        resultados.append(
            {
                "aposta_id": a["id"],
                "participante": pname,
                "dezenas": a["dezenas"],
                "acertos": hits,
                "qtd_acertos": qtd,
                "faixa": "SENA" if qtd == 6 else ("QUINA" if qtd == 5 else ("QUADRA" if qtd == 4 else "")),
                "premio_estimado": premio,
            }
        )

    resultados.sort(key=lambda x: (-x["qtd_acertos"], x["participante"]))
    total_cotas = max(1, detail["resumo"]["total_cotas"])
    ranking = sorted(ranking_part.values(), key=lambda x: (-x["melhor_acerto"], -x["total_acertos"]))

    return {
        "bolao_id": bolao_id,
        "concurso": conc_label,
        "data_apuracao": data_apuracao,
        "dezenas_sorteadas": sorted(sorteadas),
        "contagem_acertos": contagem,
        "premio_total_estimado": round(premio_total, 2),
        "premio_por_cota": round(premio_total / total_cotas, 2),
        "ranking_participantes": ranking,
        "resultados": resultados,
    }


def list_workspace_xlsx() -> list[str]:
    """Lista planilhas Potenza disponíveis no workspace para importação."""
    files = sorted(WORKSPACE_DIR.glob("mega da virada*.xlsx"))
    return [f.name for f in files]


def import_potenza_xlsx(filename: str, bolao_nome: str | None = None, valor_jogo: float = 6.25) -> dict:
    """Importa participantes e jogos de uma planilha Potenza (2023/2024/2025)."""
    path = (WORKSPACE_DIR / filename).resolve()
    if not path.exists() or path.parent != WORKSPACE_DIR.resolve():
        raise ValueError("Planilha não encontrada na pasta do projeto.")

    wb = openpyxl.load_workbook(path, data_only=True)
    sheet_name = next((s for s in ("PREENCHIMENTO", "ANÁLISE", "ANALISE") if s in wb.sheetnames), None)
    if not sheet_name:
        wb.close()
        raise ValueError("Aba de preenchimento/análise não encontrada na planilha.")

    ws = wb[sheet_name]
    header_row = 8 if sheet_name == "PREENCHIMENTO" else 5
    has_pgto = str(ws.cell(header_row, 1).value or "").strip().lower() == "pgto"
    col_name = 2
    col_nums_start = 3

    titulo = bolao_nome or path.stem
    bolao = create_bolao(nome=titulo, dezenas_por_jogo=6, valor_cota=valor_jogo * 4, valor_jogo=valor_jogo)
    bid = bolao["id"]

    current_part_id = None
    participantes_criados = 0
    jogos_importados = 0
    alertas = []

    for r in range(header_row + 1, ws.max_row + 1):
        raw_name = ws.cell(r, col_name).value
        vals = [ws.cell(r, col_nums_start + i).value for i in range(6)]
        if raw_name is None and all(v is None for v in vals):
            continue

        if raw_name is not None and str(raw_name).strip():
            pgto_val = str(ws.cell(r, 1).value or "").strip().lower() if has_pgto else ""
            pago = pgto_val in ("ok", "sim", "pago", "x", "1", "true", "s")
            part = add_participante(bid, str(raw_name), cotas=1, pago=pago)
            current_part_id = part["id"]
            participantes_criados += 1

        if all(v is not None for v in vals):
            try:
                nums = [int(v) for v in vals]
                if len(nums) != len(set(nums)):
                    alertas.append(f"Linha {r} ({raw_name or 'continuação'}): dezenas repetidas na planilha {nums} — ignorada.")
                    continue
                add_aposta(bid, current_part_id, nums, origem=f"xlsx:{filename}", allow_duplicate=True)
                jogos_importados += 1
            except Exception as err:
                alertas.append(f"Linha {r}: {err}")

    wb.close()
    return {
        "bolao": get_bolao_detail(bid),
        "participantes_importados": participantes_criados,
        "jogos_importados": jogos_importados,
        "alertas": alertas,
    }
