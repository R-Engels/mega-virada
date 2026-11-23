# -*- coding: utf-8 -*-
"""Configurações globais e constantes do Sistema Mega-Sena & Bolão Potenza."""

import math
from pathlib import Path

APP_VERSION = "V. 1.21"
APP_NAME = "Mega-Sena Potenza"

BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "megasena.db"
STATIC_DIR = BASE_DIR / "static"

CAIXA_API_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena"
MIRROR_API_URL = "https://loteriascaixa-api.herokuapp.com/api/megasena"
FALLBACK_API_URL = "https://api.guidi.dev.br/loteria/megasena/ultimo"

DEFAULT_BASE_PRICE_6 = 6.00
MIN_DEZENAS_APOSTA = 6
MAX_DEZENAS_APOSTA = 20


def get_bet_price(dezenas: int, base_price_6: float = DEFAULT_BASE_PRICE_6) -> float:
    """Calcula o preço oficial da aposta pela quantidade de dezenas marcadas."""
    if dezenas < MIN_DEZENAS_APOSTA or dezenas > MAX_DEZENAS_APOSTA:
        return 0.0
    return round(math.comb(dezenas, 6) * base_price_6, 2)
