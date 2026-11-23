# -*- coding: utf-8 -*-
"""Camada de acesso e schema SQLite."""

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH


@contextmanager
def get_conn() -> Iterator[sqlite3.Connection]:
    """Abre conexão SQLite com timeout e foreign keys habilitadas."""
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA foreign_keys=ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict | None:
    """Converte sqlite3.Row para dict."""
    return dict(row) if row is not None else None


def init_db() -> None:
    """Cria tabelas iniciais caso não existam."""
    with get_conn() as conn:
        # DELETE evita falhas/locks de WAL em compartilhamentos de rede SMB
        conn.execute("PRAGMA journal_mode=DELETE;")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS concursos (
                concurso INTEGER PRIMARY KEY,
                data_apuracao TEXT NOT NULL,
                d1 INTEGER NOT NULL,
                d2 INTEGER NOT NULL,
                d3 INTEGER NOT NULL,
                d4 INTEGER NOT NULL,
                d5 INTEGER NOT NULL,
                d6 INTEGER NOT NULL,
                dezenas_json TEXT NOT NULL,
                soma INTEGER NOT NULL,
                pares INTEGER NOT NULL,
                impares INTEGER NOT NULL,
                baixas INTEGER NOT NULL,
                altas INTEGER NOT NULL,
                acumulada INTEGER NOT NULL DEFAULT 0,
                valor_acumulado REAL NOT NULL DEFAULT 0.0,
                valor_estimado_proximo REAL NOT NULL DEFAULT 0.0,
                data_proximo TEXT DEFAULT '',
                premiacoes_json TEXT NOT NULL DEFAULT '[]',
                atualizado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS stats_dezenas (
                dezena INTEGER PRIMARY KEY,
                freq_total INTEGER NOT NULL DEFAULT 0,
                freq_recente_50 INTEGER NOT NULL DEFAULT 0,
                freq_recente_100 INTEGER NOT NULL DEFAULT 0,
                ultimo_concurso INTEGER NOT NULL DEFAULT 0,
                atraso INTEGER NOT NULL DEFAULT 0,
                score REAL NOT NULL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS metadata (
                chave TEXT PRIMARY KEY,
                valor TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS boloes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                concurso_alvo INTEGER,
                dezenas_por_jogo INTEGER NOT NULL DEFAULT 6,
                jogos_por_cota INTEGER NOT NULL DEFAULT 4,
                valor_cota REAL NOT NULL DEFAULT 24.0,
                valor_jogo REAL NOT NULL DEFAULT 6.0,
                observacoes TEXT NOT NULL DEFAULT '',
                criado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS participantes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bolao_id INTEGER NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
                nome TEXT NOT NULL,
                cotas INTEGER NOT NULL DEFAULT 1,
                pago INTEGER NOT NULL DEFAULT 0,
                valor_pago REAL NOT NULL DEFAULT 0.0
            );

            CREATE TABLE IF NOT EXISTS catalogo_nomes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                origem TEXT NOT NULL DEFAULT 'predefinido'
            );

            CREATE TABLE IF NOT EXISTS apostas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bolao_id INTEGER NOT NULL REFERENCES boloes(id) ON DELETE CASCADE,
                participante_id INTEGER REFERENCES participantes(id) ON DELETE SET NULL,
                dezenas_json TEXT NOT NULL,
                assinatura TEXT NOT NULL,
                tipo_aposta INTEGER NOT NULL DEFAULT 6,
                origem TEXT NOT NULL DEFAULT 'manual',
                criado_em TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_apostas_bolao ON apostas(bolao_id);
            CREATE INDEX IF NOT EXISTS idx_apostas_assinatura ON apostas(bolao_id, assinatura);

            CREATE TABLE IF NOT EXISTS printer_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL UNIQUE,
                modo TEXT NOT NULL DEFAULT 'volante_caixa',
                papel_w_mm REAL NOT NULL DEFAULT 83.0,
                papel_h_mm REAL NOT NULL DEFAULT 185.0,
                volante_w_mm REAL NOT NULL DEFAULT 83.0,
                volante_h_mm REAL NOT NULL DEFAULT 185.0,
                offset_x_mm REAL NOT NULL DEFAULT 5.5,
                offset_y_mm REAL NOT NULL DEFAULT 24.0,
                col_step_mm REAL NOT NULL DEFAULT 7.2,
                row_step_mm REAL NOT NULL DEFAULT 5.2,
                mark_w_mm REAL NOT NULL DEFAULT 4.2,
                mark_h_mm REAL NOT NULL DEFAULT 2.8,
                game_offsets_json TEXT NOT NULL DEFAULT '[0.0, 41.5, 83.0]',
                qty_offset_y_mm REAL NOT NULL DEFAULT 134.0,
                qty_step_x_mm REAL NOT NULL DEFAULT 4.8,
                qty_start_x_mm REAL NOT NULL DEFAULT 5.5,
                teimosinha_pos_json TEXT NOT NULL DEFAULT '{"x": 5.5, "y": 146.0}'
            );
            """
        )
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(boloes)").fetchall()}
        if "jogos_por_cota" not in cols:
            conn.execute("ALTER TABLE boloes ADD COLUMN jogos_por_cota INTEGER NOT NULL DEFAULT 4")
