# -*- coding: utf-8 -*-
"""Serviço de perfis de impressão e agrupamento de volantes para leitor óptico da Caixa."""

import json

from .db import get_conn

DEFAULT_PROFILES = [
    {
        "nome": "Volante Oficial Caixa (3 Jogos / 83x185mm)",
        "modo": "volante_caixa",
        "papel_w_mm": 83.0,
        "papel_h_mm": 185.0,
        "volante_w_mm": 83.0,
        "volante_h_mm": 185.0,
        "offset_x_mm": 6.5,
        "offset_y_mm": 28.0,
        "col_step_mm": 7.1,
        "row_step_mm": 5.3,
        "mark_w_mm": 4.4,
        "mark_h_mm": 2.9,
        "game_offsets_json": json.dumps([0.0, 41.5, 83.0]),
        "qty_offset_y_mm": 157.5,
        "qty_step_x_mm": 4.9,
        "qty_start_x_mm": 6.5,
        "teimosinha_pos_json": json.dumps({"x": 6.5, "y": 168.0}),
    },
    {
        "nome": "Folha A4 Recortável (2 Volantes por Página)",
        "modo": "a4_recortavel",
        "papel_w_mm": 210.0,
        "papel_h_mm": 297.0,
        "volante_w_mm": 83.0,
        "volante_h_mm": 185.0,
        "offset_x_mm": 6.5,
        "offset_y_mm": 28.0,
        "col_step_mm": 7.1,
        "row_step_mm": 5.3,
        "mark_w_mm": 4.4,
        "mark_h_mm": 2.9,
        "game_offsets_json": json.dumps([0.0, 41.5, 83.0]),
        "qty_offset_y_mm": 157.5,
        "qty_step_x_mm": 4.9,
        "qty_start_x_mm": 6.5,
        "teimosinha_pos_json": json.dumps({"x": 6.5, "y": 168.0}),
    },
]


def ensure_default_profiles() -> None:
    """Garante existência dos perfis padrão de impressora."""
    with get_conn() as conn:
        cnt = conn.execute("SELECT COUNT(*) FROM printer_profiles").fetchone()[0]
        if cnt > 0:
            return
        for p in DEFAULT_PROFILES:
            conn.execute(
                """
                INSERT INTO printer_profiles (
                    nome, modo, papel_w_mm, papel_h_mm, volante_w_mm, volante_h_mm,
                    offset_x_mm, offset_y_mm, col_step_mm, row_step_mm,
                    mark_w_mm, mark_h_mm, game_offsets_json,
                    qty_offset_y_mm, qty_step_x_mm, qty_start_x_mm, teimosinha_pos_json
                ) VALUES (
                    :nome, :modo, :papel_w_mm, :papel_h_mm, :volante_w_mm, :volante_h_mm,
                    :offset_x_mm, :offset_y_mm, :col_step_mm, :row_step_mm,
                    :mark_w_mm, :mark_h_mm, :game_offsets_json,
                    :qty_offset_y_mm, :qty_step_x_mm, :qty_start_x_mm, :teimosinha_pos_json
                )
                """,
                p,
            )


def _hydrate_profile(row) -> dict:
    d = dict(row)
    d["game_offsets"] = json.loads(d.pop("game_offsets_json"))
    d["teimosinha_pos"] = json.loads(d.pop("teimosinha_pos_json"))
    return d


def list_profiles() -> list[dict]:
    """Lista perfis de calibração salvos."""
    ensure_default_profiles()
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM printer_profiles ORDER BY id ASC").fetchall()
    return [_hydrate_profile(r) for r in rows]


def save_profile(payload: dict) -> dict:
    """Cria ou atualiza perfil de calibração."""
    ensure_default_profiles()
    pid = payload.get("id")
    game_offsets_json = json.dumps(payload.get("game_offsets", [0.0, 41.5, 83.0]))
    teimosinha_pos_json = json.dumps(payload.get("teimosinha_pos", {"x": 6.5, "y": 168.0}))

    params = {
        "nome": str(payload["nome"]).strip(),
        "modo": str(payload.get("modo", "volante_caixa")),
        "papel_w_mm": float(payload.get("papel_w_mm", 83.0)),
        "papel_h_mm": float(payload.get("papel_h_mm", 185.0)),
        "volante_w_mm": float(payload.get("volante_w_mm", 83.0)),
        "volante_h_mm": float(payload.get("volante_h_mm", 185.0)),
        "offset_x_mm": float(payload.get("offset_x_mm", 6.5)),
        "offset_y_mm": float(payload.get("offset_y_mm", 28.0)),
        "col_step_mm": float(payload.get("col_step_mm", 7.1)),
        "row_step_mm": float(payload.get("row_step_mm", 5.3)),
        "mark_w_mm": float(payload.get("mark_w_mm", 4.4)),
        "mark_h_mm": float(payload.get("mark_h_mm", 2.9)),
        "game_offsets_json": game_offsets_json,
        "qty_offset_y_mm": float(payload.get("qty_offset_y_mm", 157.5)),
        "qty_step_x_mm": float(payload.get("qty_step_x_mm", 4.9)),
        "qty_start_x_mm": float(payload.get("qty_start_x_mm", 6.5)),
        "teimosinha_pos_json": teimosinha_pos_json,
    }

    with get_conn() as conn:
        if pid:
            params["id"] = int(pid)
            conn.execute(
                """
                UPDATE printer_profiles SET
                    nome=:nome, modo=:modo, papel_w_mm=:papel_w_mm, papel_h_mm=:papel_h_mm,
                    volante_w_mm=:volante_w_mm, volante_h_mm=:volante_h_mm,
                    offset_x_mm=:offset_x_mm, offset_y_mm=:offset_y_mm,
                    col_step_mm=:col_step_mm, row_step_mm=:row_step_mm,
                    mark_w_mm=:mark_w_mm, mark_h_mm=:mark_h_mm,
                    game_offsets_json=:game_offsets_json,
                    qty_offset_y_mm=:qty_offset_y_mm, qty_step_x_mm=:qty_step_x_mm,
                    qty_start_x_mm=:qty_start_x_mm, teimosinha_pos_json=:teimosinha_pos_json
                WHERE id=:id
                """,
                params,
            )
            row = conn.execute("SELECT * FROM printer_profiles WHERE id=?", (pid,)).fetchone()
        else:
            cur = conn.execute(
                """
                INSERT INTO printer_profiles (
                    nome, modo, papel_w_mm, papel_h_mm, volante_w_mm, volante_h_mm,
                    offset_x_mm, offset_y_mm, col_step_mm, row_step_mm,
                    mark_w_mm, mark_h_mm, game_offsets_json,
                    qty_offset_y_mm, qty_step_x_mm, qty_start_x_mm, teimosinha_pos_json
                ) VALUES (
                    :nome, :modo, :papel_w_mm, :papel_h_mm, :volante_w_mm, :volante_h_mm,
                    :offset_x_mm, :offset_y_mm, :col_step_mm, :row_step_mm,
                    :mark_w_mm, :mark_h_mm, :game_offsets_json,
                    :qty_offset_y_mm, :qty_step_x_mm, :qty_start_x_mm, :teimosinha_pos_json
                )
                """,
                params,
            )
            row = conn.execute("SELECT * FROM printer_profiles WHERE id=?", (cur.lastrowid,)).fetchone()
    return _hydrate_profile(row)


def delete_profile(profile_id: int) -> None:
    """Remove perfil customizado."""
    with get_conn() as conn:
        conn.execute("DELETE FROM printer_profiles WHERE id = ?", (profile_id,))


def build_slips_payload(
    games: list[dict],
    tipo_aposta: int | None = None,
    jogos_por_volante: int = 3,
) -> dict:
    """Agrupa jogos em volantes respeitando a quantidade de dezenas (6..20) por volante."""
    per_slip = max(1, min(3, int(jogos_por_volante)))
    grouped: dict[int, list[dict]] = {}

    for g in games:
        nums = sorted(int(n) for n in g["dezenas"])
        qtd = tipo_aposta or len(nums)
        if len(nums) != qtd:
            continue
        grouped.setdefault(qtd, []).append(
            {
                "dezenas": nums,
                "participante": g.get("participante", ""),
                "id": g.get("id"),
            }
        )

    volantes = []
    idx = 1
    for qtd, items in sorted(grouped.items()):
        for start in range(0, len(items), per_slip):
            chunk = items[start : start + per_slip]
            volantes.append(
                {
                    "volante_num": idx,
                    "tipo_aposta": qtd,
                    "jogos": chunk,
                }
            )
            idx += 1

    return {
        "total_jogos": sum(len(v["jogos"]) for v in volantes),
        "total_volantes": len(volantes),
        "volantes": volantes,
    }
