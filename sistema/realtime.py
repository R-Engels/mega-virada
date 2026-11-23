# -*- coding: utf-8 -*-
"""Módulo de sincronização em tempo real (SSE e controle de revisões)."""

import asyncio
import json
import time
from typing import Set

_revision: int = 1
_last_bolao_id: int | None = None
_subscribers: Set[asyncio.Queue] = set()


def get_current_revision() -> dict:
    """Retorna número da revisão e metadados de atualização em tempo real."""
    return {
        "revision": _revision,
        "last_bolao_id": _last_bolao_id,
        "timestamp": time.time(),
    }


def notify_bolao_update(bolao_id: int | None = None) -> None:
    """Incrementa a revisão e dispara notificação imediata a todos os navegadores conectados."""
    global _revision, _last_bolao_id
    _revision += 1
    _last_bolao_id = bolao_id
    payload = {
        "event": "bolao_update",
        "revision": _revision,
        "bolao_id": bolao_id,
        "timestamp": time.time(),
    }
    to_remove = set()
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except Exception:
            to_remove.add(q)
    _subscribers.difference_update(to_remove)


async def register_subscriber() -> asyncio.Queue:
    """Registra novo cliente SSE."""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(q)
    return q


def unregister_subscriber(q: asyncio.Queue) -> None:
    """Remove cliente SSE desconectado."""
    _subscribers.discard(q)
