"""Ideas tácticas ("satélites"): ETF/ETC algo más arriesgados que el momento geopolítico pone a favor.

Regla determinista y testeada (docs/04, config/ideas.yaml). La IA no decide: solo cuenta a través de los eventos.

  señal(tema) = Σ intensidad × impacto típico del evento en ese tema (impacto + impacto_tematico)

Un evento a favor no basta. Dos filtros de precio evitan el error típico de comprar con el titular:
  * "tarde": si ya ha subido mucho en un mes, la noticia ya está en el precio (el Brent tras una guerra suele
    devolver la subida en semanas).
  * "vigilar": si el precio está por debajo de su media de 50 sesiones, el mercado no confirma la noticia.

Cada idea que pasa a "activa" queda apuntada (fecha y precio) y se compara después con la bolsa mundial en el mismo
periodo: así se ve, sin maquillar, si estas ideas funcionan. No hay historial de noticias de años anteriores con
el que hacer un backtest; por eso son pequeñas y se miden desde el primer día.
"""
from __future__ import annotations

from . import indicadores as ind

Serie = list[tuple[str, float]]


def impactos(reglas: dict, tipo: str) -> dict:
    ev = (reglas.get("eventos") or {}).get(tipo) or {}
    return {**(ev.get("impacto") or {}), **(ev.get("impacto_tematico") or {})}


def senal(eventos: list[dict], reglas: dict, clase: str) -> tuple[int, list[dict]]:
    """Suma de intensidad × impacto y los eventos que la explican (de más a menos peso)."""
    total, motivos = 0, []
    for e in eventos:
        imp = impactos(reglas, e.get("tipo", "")).get(clase, 0) or 0
        aporte = int(e.get("intensidad") or 0) * int(imp)
        if aporte:
            total += aporte
            motivos.append({"evento": e.get("nombre") or e.get("tipo"), "tipo": e.get("tipo"), "intensidad": e.get("intensidad"),
                            "impacto": imp, "aporte": aporte})
    motivos.sort(key=lambda m: -abs(m["aporte"]))
    return total, motivos


def precio(serie: Serie) -> dict:
    """Métricas de precio que usan los filtros."""
    if not serie:
        return {}
    mm50 = ind.media_movil(serie, 50)
    ultimo = serie[-1][1]
    return {"fecha": serie[-1][0], "ultimo": round(ultimo, 4), "var_1m": ind.variacion(serie, 30), "var_3m": ind.variacion(serie, 91),
            "mm50": round(mm50, 4) if mm50 else None, "sobre_mm50": (ultimo >= mm50) if mm50 else None,
            "caida_max_52s": ind.caida_desde_maximo(serie, 365)}


def estado(s: int, p: dict, umbral: int, tarde_pct: float) -> tuple[str, str]:
    if s <= -umbral:
        return "en_contra", "Las noticias de hoy juegan en contra de este tema: no es momento de comprarlo."
    if s < umbral:
        return "sin_senal", "Las noticias de hoy no apuntan con fuerza a este tema."
    v1m = p.get("var_1m")
    if v1m is not None and v1m >= tarde_pct:
        return "tarde", f"Las noticias van a favor, pero ya ha subido un {v1m:.0f} % en un mes: buena parte está en el precio y el riesgo de comprar arriba es alto."
    if p.get("sobre_mm50") is False:
        return "vigilar", "Las noticias van a favor, pero el precio va en contra (está por debajo de su media de 50 sesiones). Espera a que el precio lo confirme."
    return "activa", "Las noticias van a favor y el precio lo confirma (sobre su media de 50 sesiones y sin haber subido ya en exceso)."


def evaluar(eventos: list[dict], series: dict[str, Serie], info: dict, reglas: dict, cfg: dict) -> list[dict]:
    lim = cfg.get("limites") or {}
    umbral = lim.get("umbral_senal", 3)
    salida = []
    for idea in cfg.get("ideas") or []:
        s, motivos = senal(eventos, reglas, idea["clase"])
        p = precio(series.get(idea["id"]) or [])
        if not p:
            est, texto = "sin_datos", "No hay precios de este producto hoy (ver Mercado → Estado de las fuentes)."
        else:
            est, texto = estado(s, p, umbral, idea.get("tarde_1m_pct", lim.get("tarde_1m_pct", 15)))
        i = info.get(idea["id"]) or {}
        salida.append({"id": idea["id"], "tema": idea["tema"], "clase": idea["clase"], "nombre": i.get("nombre"), "isin": i.get("isin"),
                       "yahoo": i.get("yahoo"), "moneda": i.get("moneda") or "EUR", "ter": i.get("ter"), "riesgo": idea.get("riesgo"), "senal": s, "motivos": motivos[:4],
                       "precio": p, "estado": est, "explicacion": texto})
    orden = {"activa": 0, "vigilar": 1, "tarde": 2, "sin_senal": 3, "en_contra": 4, "sin_datos": 5}
    salida.sort(key=lambda x: (orden.get(x["estado"], 9), -x["senal"]))
    return salida


def actualizar_historial(historial: dict | None, ideas: list[dict], series: dict[str, Serie], hoy: str, referencia: str = "VWCE") -> dict:
    """Apunta cuándo empieza y termina cada idea "activa" y su resultado frente a `referencia` en el mismo periodo."""
    h = historial or {"referencia": referencia, "tramos": []}
    abiertos = {t["id"]: t for t in h["tramos"] if not t.get("hasta")}
    ref = series.get(referencia) or []
    ref_hoy = ref[-1][1] if ref else None
    for idea in ideas:
        p = idea.get("precio") or {}
        if not p.get("ultimo"):
            continue
        t = abiertos.get(idea["id"])
        if idea["estado"] == "activa" and not t:
            h["tramos"].append({"id": idea["id"], "tema": idea["tema"], "desde": hoy, "precio_desde": p["ultimo"], "ref_desde": ref_hoy,
                                "senal_desde": idea["senal"]})
        elif t and idea["estado"] != "activa":
            t.update({"hasta": hoy, "precio_hasta": p["ultimo"], "ref_hasta": ref_hoy, "motivo_fin": idea["estado"]})
    # Resultado de cada tramo (los abiertos, con el precio de hoy)
    precios_hoy = {i["id"]: (i.get("precio") or {}).get("ultimo") for i in ideas}
    for t in h["tramos"]:
        fin = t.get("precio_hasta") or precios_hoy.get(t["id"])
        ref_fin = t.get("ref_hasta") or ref_hoy
        t["resultado_pct"] = round((fin / t["precio_desde"] - 1) * 100, 2) if fin and t.get("precio_desde") else None
        t["referencia_pct"] = round((ref_fin / t["ref_desde"] - 1) * 100, 2) if ref_fin and t.get("ref_desde") else None
    cerrados = [t for t in h["tramos"] if t.get("hasta") and t.get("resultado_pct") is not None and t.get("referencia_pct") is not None]
    h["resumen"] = {"cerrados": len(cerrados), "abiertos": len([t for t in h["tramos"] if not t.get("hasta")]),
                    "ganan_a_referencia": sum(1 for t in cerrados if t["resultado_pct"] > t["referencia_pct"]),
                    "ventaja_media_pct": round(sum(t["resultado_pct"] - t["referencia_pct"] for t in cerrados) / len(cerrados), 2) if cerrados else None}
    h["tramos"] = h["tramos"][-200:]
    return h
