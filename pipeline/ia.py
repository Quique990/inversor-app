"""Capa de IA gratuita: GitHub Models (principal) -> Gemini (respaldo) -> sin IA (plantilla).

Límites del nivel gratuito de GitHub Models (modelos "low"): ~150 peticiones/día y
8.000 tokens de entrada por petición. Usamos 1 petición al día, con un presupuesto de
~5.500 tokens de entrada (titulares recortados), así que sobra margen.

La IA SOLO resume y clasifica. Nunca genera la recomendación de compra/venta: eso lo hace
el motor de reglas (pipeline/senales.py) a partir de datos verificables.
"""
from __future__ import annotations

import json
import os
import re

import requests

from .noticias import Titular
from .util import log

GITHUB_MODELS_URL = "https://models.github.ai/inference/chat/completions"
GITHUB_MODELS_MODELO = os.environ.get("GITHUB_MODELS_MODEL", "openai/gpt-4.1-mini")
GEMINI_MODELO = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
MAX_CHARS_ENTRADA = 20000  # ~5.000-5.500 tokens


def _prompt_sistema(tipos: dict) -> str:
    lista = "\n".join(f"- {k}: {v['nombre']}" for k, v in tipos.items())
    return f"""Eres un analista macro y geopolítico prudente que escribe en castellano de España para un
inversor particular de largo plazo que invierte en ETF indexados. Tu trabajo es RESUMIR y CLASIFICAR,
no recomendar compras ni ventas.

Tipos de evento permitidos (usa exactamente estos identificadores):
{lista}

Reglas:
- Basa todo SOLO en los titulares y datos proporcionados. Si algo no aparece, no lo inventes.
- Intensidad: 0 ruido, 1 presente, 2 relevante para mercados, 3 domina la agenda mundial.
- Distingue amenazas/rumores de hechos consumados.
- Sé breve, concreto y sin sensacionalismo.
- Responde ÚNICAMENTE con un objeto JSON válido con esta forma:
{{"resumen": "máx. 170 palabras: qué ha pasado hoy en el mundo y en los mercados, y por qué importa",
  "eventos": [{{"tipo": "<identificador>", "intensidad": 0-3, "region": "texto corto",
               "explicacion": "1-2 frases", "hecho_o_amenaza": "hecho|amenaza"}}],
  "riesgos_a_vigilar": ["máx. 4 frases cortas"],
  "tono_global": -2..2}}"""


def _prompt_usuario(titulares: list[Titular], contexto_mercado: str) -> str:
    lineas = []
    total = len(contexto_mercado) + 500
    for i, t in enumerate(titulares):
        linea = f"[{i}] ({t.fuente}) {t.titulo}"
        if total + len(linea) > MAX_CHARS_ENTRADA:
            break
        lineas.append(linea)
        total += len(linea) + 1
    return f"DATOS DE MERCADO DE HOY:\n{contexto_mercado}\n\nTITULARES (últimas ~24 h):\n" + "\n".join(lineas)


def _extraer_json(texto: str) -> dict:
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?|```$", "", texto, flags=re.MULTILINE).strip()
    inicio, fin = texto.find("{"), texto.rfind("}")
    if inicio < 0 or fin < 0:
        raise ValueError("La IA no devolvió JSON")
    return json.loads(texto[inicio:fin + 1])


def _github_models(sistema: str, usuario: str) -> dict:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_MODELS_TOKEN")
    if not token:
        raise RuntimeError("Sin GITHUB_TOKEN")
    cabeceras = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"}
    r = requests.post(GITHUB_MODELS_URL, timeout=90, headers=cabeceras, json={
        "model": GITHUB_MODELS_MODELO, "temperature": 0.2, "max_tokens": 1500,
        "messages": [{"role": "system", "content": sistema}, {"role": "user", "content": usuario}]})
    try:
        r.raise_for_status()
        return _extraer_json(r.json()["choices"][0]["message"]["content"])
    except Exception as e:  # noqa: BLE001
        # Diagnóstico: ¿existe el modelo en el catálogo?
        try:
            cat = requests.get("https://models.github.ai/catalog/models", headers=cabeceras, timeout=30).json()
            ids = [m.get("id") for m in cat] if isinstance(cat, list) else []
            log.warning("Modelo %s en catálogo: %s. Ejemplos: %s", GITHUB_MODELS_MODELO, GITHUB_MODELS_MODELO in ids, ids[:12])
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError(f"{r.status_code}: {e!r} | {r.headers.get('content-type')} | {r.text[:300]!r}") from e



def _gemini(sistema: str, usuario: str) -> dict:
    clave = os.environ.get("GEMINI_API_KEY")
    if not clave:
        raise RuntimeError("Sin GEMINI_API_KEY")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODELO}:generateContent"
    r = requests.post(url, params={"key": clave}, timeout=90, json={
        "systemInstruction": {"parts": [{"text": sistema}]},
        "contents": [{"role": "user", "parts": [{"text": usuario}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1200, "responseMimeType": "application/json"}})
    r.raise_for_status()
    partes = r.json()["candidates"][0]["content"]["parts"]
    return _extraer_json("".join(p.get("text", "") for p in partes))


def analizar(titulares: list[Titular], contexto_mercado: str, tipos: dict) -> tuple[dict | None, str]:
    """Devuelve (resultado_json | None, proveedor_usado)."""
    if os.environ.get("SIN_IA") == "1":
        return None, "desactivada"
    sistema = _prompt_sistema(tipos)
    usuario = _prompt_usuario(titulares, contexto_mercado)
    for nombre, fn in (("github_models", _github_models), ("gemini", _gemini)):
        try:
            res = fn(sistema, usuario)
            if not isinstance(res.get("eventos", []), list):
                raise ValueError("Formato inesperado")
            log.info("IA OK con %s", nombre)
            return res, nombre
        except Exception as e:  # noqa: BLE001
            log.warning("IA %s falló: %s", nombre, repr(e)[:300])
    return None, "ninguna"
