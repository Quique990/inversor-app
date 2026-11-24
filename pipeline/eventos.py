"""Clasificación de titulares en tipos de evento (config/reglas_eventos.yaml).

Dos capas:
  1. Palabras clave (determinista, siempre disponible).
  2. IA (opcional): pipeline/ia.py devuelve eventos con intensidad; se fusionan aquí.
La IA nunca decide la recomendación: solo ayuda a detectar y explicar eventos.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

from .noticias import Titular


def _norm(t: str) -> str:
    t = unicodedata.normalize("NFKD", t.lower())
    return "".join(c for c in t if not unicodedata.combining(c))


def _patron(palabras: list[str]) -> re.Pattern:
    partes = [r"\b" + re.escape(_norm(p)).replace(r"\ ", r"\s+") + r"\b" for p in palabras]
    return re.compile("|".join(partes))


class Clasificador:
    def __init__(self, reglas: dict):
        self.eventos = reglas["eventos"]
        self.patrones = {k: _patron(v.get("palabras", [])) for k, v in self.eventos.items()}

    def tipos_de(self, texto: str) -> list[str]:
        n = _norm(texto)
        return [k for k, p in self.patrones.items() if p.search(n)]

    def clasificar(self, titulares: list[Titular]) -> dict:
        """Devuelve {tipo: {"puntos": float, "n": int, "ejemplos": [titular dict]}}."""
        acc: dict[str, dict] = defaultdict(lambda: {"puntos": 0.0, "n": 0, "ejemplos": []})
        for t in titulares:
            for tipo in self.tipos_de(f"{t.titulo} {t.resumen}"):
                a = acc[tipo]
                a["puntos"] += t.peso
                a["n"] += 1
                if len(a["ejemplos"]) < 5:
                    a["ejemplos"].append({"titulo": t.titulo, "fuente": t.fuente, "url": t.url})
        return dict(acc)


def intensidad_desde_puntos(puntos: float) -> int:
    """0 = ruido, 1 = presente, 2 = relevante, 3 = dominante en la agenda."""
    if puntos >= 25:
        return 3
    if puntos >= 10:
        return 2
    if puntos >= 4:
        return 1
    return 0


def fusionar(palabras: dict, ia: dict | None, gdelt: dict | None, reglas: dict) -> list[dict]:
    """Combina las señales y devuelve la lista de eventos activos ordenada por intensidad."""
    eventos = reglas["eventos"]
    ia_eventos = {e["tipo"]: e for e in (ia or {}).get("eventos", []) if e.get("tipo") in eventos}
    # GDELT refuerza tipos concretos cuando la cobertura mundial se dispara
    mapa_gdelt = {"conflicto": "conflicto_militar", "sanciones_aranceles": "aranceles_sanciones",
                  "energia": "shock_petroleo", "banca": "crisis_bancaria_credito"}
    refuerzo: dict[str, int] = {}
    for gid, tipo in mapa_gdelt.items():
        g = (gdelt or {}).get(gid) or {}
        ratio = g.get("ratio") or 0
        if ratio >= 2.0:
            refuerzo[tipo] = 2
        elif ratio >= 1.4:
            refuerzo[tipo] = 1

    salida = []
    for tipo in set(palabras) | set(ia_eventos) | set(refuerzo):
        p = palabras.get(tipo, {"puntos": 0, "n": 0, "ejemplos": []})
        i_kw = intensidad_desde_puntos(p["puntos"])
        i_ia = int(ia_eventos.get(tipo, {}).get("intensidad", 0) or 0)
        # Fusión conservadora: la IA puede subir como mucho 1 nivel lo que ven las palabras clave
        base = max(i_kw, min(i_ia, i_kw + 1)) if i_kw else min(i_ia, 2)
        intensidad = min(3, base + (1 if refuerzo.get(tipo, 0) >= 2 and base else 0))
        if intensidad <= 0:
            continue
        salida.append({
            "tipo": tipo,
            "nombre": eventos[tipo]["nombre"],
            "intensidad": intensidad,
            "titulares": p["n"],
            "ejemplos": p["ejemplos"],
            "explicacion_ia": ia_eventos.get(tipo, {}).get("explicacion"),
            "region": ia_eventos.get(tipo, {}).get("region"),
            "gdelt_ratio": (gdelt or {}).get(next((g for g, t in mapa_gdelt.items() if t == tipo), ""), {}).get("ratio"),
            "impacto_tipico": eventos[tipo].get("impacto", {}),
            "historia": eventos[tipo].get("historia"),
            "matices": eventos[tipo].get("matices", []),
        })
    salida.sort(key=lambda e: (-e["intensidad"], -e["titulares"]))
    return salida
