"""Clasificación de un activo por su nombre (oro, renta fija, monetario, renta variable o acción suelta).

Es la misma regla que `clasificarNombre` de web/js/reco.js: si cambias una, cambia la otra (hay tests de las dos).
Sirve para los activos que no están en el universo (config/universo_etf.yaml), cuyo "rol" no se conoce.
"""
from __future__ import annotations

import re

APALANCADO = re.compile(r"(\b[2-5]x\b|\bx[2-5]\b|leverag|lev\b|ultra|daily|short|inverse|bear|bull\b|apalanc)", re.I)
ORO = re.compile(r"(gold|\boro\b|\bgld\b)", re.I)
MONETARIO = re.compile(r"(overnight|money market|monetari|€str|\bestr\b|\bcash\b)", re.I)
RENTA_FIJA = re.compile(r"(bond|anleihe|treasur|\bgovt\b|government|aggregate|ibonds|renta fija|\bbonos?\b|"
                        r"\b(dez|dec|déc|dic)\.?\s*20\d\d\b|\bcorp(orate)?\b)", re.I)
RENTA_VARIABLE = re.compile(r"(s&p|\bsp ?500\b|msci|ftse|all.?world|\bworld\b|ibex|stoxx|\bdax\b|nasdaq|emerging|"
                            r"\bacwi\b|russell|nikkei|\bcac\b|\bmib\b|equity|aktien|dividend|\betf\b|\bucits\b|\bindex\b)", re.I)

# Hueco de la cartera modelo (web) -> rol del universo (pipeline)
HUECO_A_ROL = {"renta_variable_global": "renta_variable_global", "renta_fija_euro": "renta_fija_euro",
               "monetario": "monetario", "oro": "oro", "otros": "accion"}


def hueco_por_nombre(nombre: str | None) -> str:
    """renta_variable_global | renta_fija_euro | monetario | oro | otros."""
    n = nombre or ""
    if APALANCADO.search(n):
        return "otros"
    if ORO.search(n):
        return "oro"
    if MONETARIO.search(n):
        return "monetario"
    if RENTA_FIJA.search(n):
        return "renta_fija_euro"
    if RENTA_VARIABLE.search(n):
        return "renta_variable_global"
    return "otros"


def rol_de_activo(activo: dict) -> str:
    """Rol para el modelo intradía: el hueco elegido a mano manda; si no, se deduce del nombre."""
    return HUECO_A_ROL.get(activo.get("hueco") or hueco_por_nombre(activo.get("nombre")), "accion")
