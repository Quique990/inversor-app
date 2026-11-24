"""Motor de señales: régimen macro + puntuación de oportunidad + postura táctica.

Filosofía (ver docs/04-motor-de-senales.md):
  * La base es SIEMPRE el plan de inversión periódico. Las señales solo deciden si merece la pena
    una aportación EXTRA y cómo hacerla (de golpe o escalonada).
  * Lo que crea la oportunidad es la caída de precios, no la noticia. Una noticia grave con la bolsa
    en máximos no es una oportunidad; una caída del 15% con el VIX en 35 sí suele serlo (en expansión).
  * El régimen macro (recesión probable, inflación alta) decide si hay que ser prudente porque las
    caídas pueden durar mucho más (2008, 1973).
  * Ventas: casi nunca por "timing". Solo rebalanceo, productos inadecuados o riesgo de concentración
    (eso se calcula en el navegador con los datos privados del usuario).
"""
from __future__ import annotations

from . import indicadores as ind

GEO_SHOCKS = {"conflicto_militar", "terrorismo", "aranceles_sanciones", "pandemia"}


def _clamp(x: float, a: float, b: float) -> float:
    return max(a, min(b, x))


def _intensidad(eventos: list[dict], tipo: str) -> int:
    return next((e["intensidad"] for e in eventos if e["tipo"] == tipo), 0)


def proxy_renta_variable(series: dict) -> tuple[str | None, list]:
    for k in ("VWCE", "EUNL", "SP500"):
        if series.get(k):
            return k, series[k]
    return None, []


def calcular_metricas(series: dict) -> dict:
    pid, rv = proxy_renta_variable(series)
    m: dict = {"proxy": pid}
    if rv:
        m["caida_52s"] = ind.caida_desde_maximo(rv, 365)
        mm = ind.media_movil(rv, 200)
        m["sobre_mm200"] = (rv[-1][1] > mm) if mm else None
        m["pendiente_mm200"] = ind.pendiente_media(rv, 200)
        m["sesiones_bajo_mm200"] = ind.sesiones_bajo_media(rv, 200)
        m["var_1m"] = ind.variacion(rv, 30)
    m["vix"] = ind.ultimo(series.get("VIX", []))
    m["vstoxx"] = ind.ultimo(series.get("VSTOXX", []))
    m["brent_3m"] = ind.variacion(series.get("BRENT", []), 91)
    m["oro_1m"] = ind.variacion(series.get("ORO", []), 30)
    m["sahm"] = ind.ultimo(series.get("SAHMREALTIME", []))
    m["curva_10a3m"] = ind.ultimo(series.get("T10Y3M", []))
    m["curva_min_24m"] = ind.minimo_ventana(series.get("T10Y3M", []), 730)
    m["high_yield"] = ind.ultimo(series.get("BAMLH0A0HYM2", []))
    m["ipc_eeuu"] = ind.interanual(series.get("CPIAUCSL", []))
    m["ipca_euro"] = ind.ultimo(series.get("HICP_EURO", []))
    m["tipo_bce"] = ind.ultimo(series.get("DFR", []))
    m["gpr"] = ind.ultimo(series.get("GPR", []))
    m["gpr_media_1a"] = (sum(v for _, v in series["GPR"][-365:]) / min(365, len(series["GPR"]))) if series.get("GPR") else None
    return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in m.items()}


def detectar_regimen(m: dict, eventos: list[dict], umbrales: dict) -> dict:
    motivos_rec, motivos_inf = [], []
    if m.get("sahm") is not None and m["sahm"] >= umbrales["sahm"]["recesion"]:
        motivos_rec.append(f"Regla de Sahm en {m['sahm']} (≥ {umbrales['sahm']['recesion']}): el paro sube como en recesiones pasadas.")
    if m.get("high_yield") is not None and m["high_yield"] >= umbrales["high_yield"]["crisis"]:
        motivos_rec.append(f"Diferencial high yield en {m['high_yield']} pp: estrés de crédito alto.")
    if (m.get("curva_min_24m") is not None and m["curva_min_24m"] < umbrales["curva_10a3m"]["inversion"]
            and (m.get("sahm") or 0) >= 0.3):
        motivos_rec.append("La curva de tipos estuvo invertida en los últimos 2 años y el paro empieza a subir.")
    if _intensidad(eventos, "senales_recesion") >= 2 and m.get("sobre_mm200") is False:
        motivos_rec.append("Noticias de recesión relevantes con la bolsa en tendencia bajista.")

    if m.get("ipc_eeuu") is not None and m["ipc_eeuu"] > 3.5:
        motivos_inf.append(f"Inflación de EE. UU. en {m['ipc_eeuu']}% interanual.")
    if m.get("ipca_euro") is not None and m["ipca_euro"] > 3.0:
        motivos_inf.append(f"Inflación de la eurozona en {m['ipca_euro']}% interanual.")
    if _intensidad(eventos, "banco_central_endurece") >= 2:
        motivos_inf.append("Los bancos centrales están endureciendo el tono.")

    if motivos_rec:
        principal = "recesion_probable"
    elif motivos_inf:
        principal = "inflacion_alta"
    else:
        principal = "expansion"
    return {"principal": principal, "recesion_probable": bool(motivos_rec), "inflacion_alta": bool(motivos_inf),
            "motivos": motivos_rec + motivos_inf}


def puntuar(m: dict, eventos: list[dict], umbrales: dict) -> tuple[float, list[dict]]:
    """Puntuación de oportunidad 0-100 y desglose de factores."""
    factores = []
    total = 0.0
    dd = m.get("caida_52s")
    if dd is not None:
        p = _clamp((-dd - 3) / (20 - 3) * 40, 0, 45)
        total += p
        factores.append({"factor": "Caída desde máximos (52 semanas)", "valor": f"{dd:.1f}%", "puntos": round(p, 1)})
    vol = max([v for v in (m.get("vix"), m.get("vstoxx")) if v is not None], default=None)
    if vol is not None:
        p = _clamp((vol - 20) / (umbrales["vix"]["panico"] - 20) * 25, 0, 30)
        total += p
        factores.append({"factor": "Miedo en el mercado (VIX/VSTOXX)", "valor": f"{vol:.1f}", "puntos": round(p, 1)})
    geo = [e for e in eventos if e["tipo"] in GEO_SHOCKS and e["intensidad"] >= 2]
    if geo and dd is not None and dd <= umbrales["caida_desde_maximo"]["leve"]:
        p = 10.0
        total += p
        factores.append({"factor": "Caída provocada por un shock geopolítico (suelen recuperarse en semanas)",
                         "valor": ", ".join(e["nombre"] for e in geo), "puntos": p})
    return round(_clamp(total, 0, 100), 1), factores


def decidir_postura(puntos: float, m: dict, regimen: dict, eventos: list[dict], umbrales: dict) -> dict:
    avisos = []
    if puntos >= 45:
        postura = "comprar_extra"
    elif puntos >= 20:
        postura = "comprar_extra_escalonado"
    else:
        postura = "mantener_plan"

    # Tendencia bajista = precio bajo la media de 200 sesiones durante >= 40 sesiones Y media descendente.
    # Un desplome reciente (shock) no cuenta como tendencia: es justo cuando más se recupera.
    tendencia_bajista = (m.get("sobre_mm200") is False and (m.get("pendiente_mm200") or 0) < 0
                         and (m.get("sesiones_bajo_mm200") or 0) >= umbrales["tendencia"].get("sesiones_confirmacion", 40))
    if tendencia_bajista:
        avisos.append("La renta variable está por debajo de su media de 200 sesiones y la media baja: "
                      "las caídas pueden alargarse, mejor escalonar.")
    if postura != "mantener_plan" and (tendencia_bajista or regimen["principal"] != "expansion"):
        postura = "escalonar"

    petroleo = _intensidad(eventos, "shock_petroleo") >= 2 or (m.get("brent_3m") or 0) >= umbrales["petroleo"]["subida_3m_pct_alerta"]
    credito = _intensidad(eventos, "crisis_bancaria_credito") >= 2 and (m.get("high_yield") or 0) >= umbrales["high_yield"]["tension"]
    if petroleo and regimen["inflacion_alta"]:
        avisos.append("Shock de petróleo con inflación alta: es la combinación de 1973, la más dañina para la bolsa.")
    if credito:
        avisos.append("Tensión de crédito confirmada por los diferenciales: riesgo de contagio financiero.")
    if (petroleo and regimen["inflacion_alta"]) or credito:
        postura = "precaucion" if puntos < 45 else "escalonar"

    multiplicador = {"mantener_plan": 0, "comprar_extra_escalonado": 3, "escalonar": 3,
                     "comprar_extra": 6 if puntos < 70 else 10, "precaucion": 0}[postura]
    return {"postura": postura, "multiplicador_extra": multiplicador, "tramos": 1 if postura == "comprar_extra" else 3,
            "tendencia_bajista": tendencia_bajista, "avisos": avisos}


def confianza(m: dict, eventos_ok: bool, ia_ok: bool) -> str:
    claves = ["caida_52s", "vix", "sahm", "curva_10a3m", "high_yield"]
    presentes = sum(1 for k in claves if m.get(k) is not None)
    if presentes >= 4 and eventos_ok and ia_ok:
        return "alta"
    if presentes >= 3:
        return "media"
    return "baja"


def generar(series: dict, eventos: list[dict], reglas: dict, *, ia_ok: bool, noticias_ok: bool) -> dict:
    umbrales = reglas["umbrales"]
    m = calcular_metricas(series)
    regimen = detectar_regimen(m, eventos, umbrales)
    puntos, factores = puntuar(m, eventos, umbrales)
    decision = decidir_postura(puntos, m, regimen, eventos, umbrales)
    texto = reglas["posturas"][decision["postura"]]["texto"]
    return {
        "metricas": m,
        "regimen": regimen,
        "puntuacion": puntos,
        "factores": factores,
        **decision,
        "texto_postura": texto,
        "confianza": confianza(m, noticias_ok, ia_ok),
    }
