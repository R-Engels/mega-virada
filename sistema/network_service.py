# -*- coding: utf-8 -*-
"""Serviço de gerenciamento de rede local (Wi-Fi) e túnel público de internet (Cloudflare)."""

import os
import re
import socket
import subprocess
import threading
import time
from pathlib import Path
from .config import BASE_DIR

CLOUDFLARED_PATH = BASE_DIR / "cloudflared.exe"

_tunnel_process: subprocess.Popen | None = None
_tunnel_url: str | None = None
_tunnel_thread: threading.Thread | None = None
_tunnel_error: str | None = None


def get_local_ip() -> str:
    """Detecta o IP IPv4 desta máquina na rede local / Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_network_info() -> dict:
    """Retorna dados de conexão local e pública para acesso via celular."""
    ip = get_local_ip()
    return {
        "local_ip": ip,
        "local_url": f"http://{ip}:8080",
        "tunnel_url": _tunnel_url,
        "tunnel_active": bool(_tunnel_url and _tunnel_process and _tunnel_process.poll() is None),
        "tunnel_error": _tunnel_error,
    }


def _run_tunnel():
    global _tunnel_process, _tunnel_url, _tunnel_error
    if not CLOUDFLARED_PATH.exists():
        _tunnel_error = "Executável cloudflared.exe não encontrado."
        return

    cmd = [
        str(CLOUDFLARED_PATH),
        "tunnel",
        "--url",
        "http://127.0.0.1:8080",
        "--no-autoupdate",
    ]
    try:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        _tunnel_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=flags,
        )
        while True:
            line = _tunnel_process.stdout.readline()
            if not line:
                break
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
            if match:
                _tunnel_url = match.group(0)
                _tunnel_error = None
        _tunnel_process.wait()
    except Exception as exc:
        _tunnel_error = str(exc)


def start_tunnel_if_needed():
    """Inicia o túnel Cloudflare em segundo plano se ainda não estiver ativo."""
    global _tunnel_thread
    if _tunnel_url and _tunnel_process and _tunnel_process.poll() is None:
        return
    if CLOUDFLARED_PATH.exists():
        _tunnel_thread = threading.Thread(target=_run_tunnel, daemon=True)
        _tunnel_thread.start()


def stop_tunnel():
    """Finaliza o processo do túnel com segurança."""
    global _tunnel_process, _tunnel_url
    if _tunnel_process and _tunnel_process.poll() is None:
        try:
            _tunnel_process.terminate()
            _tunnel_process.wait(timeout=2)
        except Exception:
            try:
                _tunnel_process.kill()
            except Exception:
                pass
    _tunnel_url = None
