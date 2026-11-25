"""Análisis diario. Se ejecuta en GitHub Actions (ver .github/workflows/analisis-diario.yml).

Salidas (todas PÚBLICAS, sin datos personales):
  web/data/mercado.json          -> informe del día (resumen, eventos, régimen, postura, métricas)
  web/data/precios_universo.json -> históricos semanales de los ETF del universo e indicadores
  web/data/historial/AAAA-MM-DD.json -> copia del informe de cada día (para ver la evolución)
  web/data/historial/indice.json -> lista de fechas con su postura y puntuación
  web/data/salud_fuentes.json    -> qué fuentes funcionaron
  web/data/backtest.json         -> backtest de la parte táctica (se recalcula los lunes)
  web/data/ideas_historial.json  -> cuándo empezó y acabó cada idea táctica y su resultado frente a la bolsa mundial

Uso local:  python -m pipeline.main            (SIN_IA=1 para no llamar a la IA)
"""
from __future__ import annotations

import os
from datetime import date

from . import backtest, eventos as ev, ia, ideas as ideas_mod, indicadores as ind, mercados, noticias, senales
from .util import WEB_DATA, Salud, ahora_iso, cargar_yaml, configurar_log, escribir_json, hoy_iso, leer_json, log


def contexto_mercado_texto(metricas: dict, resumenes: dict) -> str:
    partes = []
    for k in ("VWCE", "SP500", "STOXX50", "IBEX", "VIX", "BRENT", "ORO", "US10Y", "EURUSD"):
        r = resumenes.get(k)
        if r:
            partes.append(f"{k}: {r['ultimo']} (1d {r['var_1d']}%, 1m {r['var_1m']}%, desde máx. 52s {r['caida_max_52s']}%)")
    for k in ("sahm", "curva_10a3m", "high_yield", "ipc_eeuu", "ipca_euro", "tipo_bce", "gpr"):
        if metricas.get(k) is not None:
            partes.append(f"{k}: {metricas[k]}")
    return "\n".join(partes)


def resumen_plantilla(eventos: list[dict], decision: dict) -> str:
    if not eventos:
        cab = "Hoy no se detectan eventos con impacto relevante en los mercados."
    else:
        cab = "Temas que dominan hoy: " + "; ".join(f"{e['nombre'].lower()} (intensidad {e['intensidad']}/3)" for e in eventos[:4]) + "."
    return f"{cab} {decision['texto_postura']} (Resumen automático sin IA.)"


def ejecutar() -> dict:
    configurar_log()
    salud = Salud()
    universo = cargar_yaml("universo_etf.yaml")
    fuentes = cargar_yaml("fuentes.yaml")
    reglas = cargar_yaml("reglas_eventos.yaml")

    # 1. Datos
    titulares = noticias.recoger_titulares(fuentes, salud)
    titulares.sort(key=lambda t: (t.peso, t.fecha or ""), reverse=True)
    gdelt = noticias.leer_gdelt(fuentes.get("gdelt", []), salud)
    datos = mercados.recoger_mercados(universo, fuentes, salud)
    series = datos["series"]

    resumenes = {}
    for k, s in series.items():
        if k not in datos["info"]:
            continue  # solo activos e indicadores de precio (las series macro van en métricas)
        try:
            resumenes[k] = ind.resumen_activo(s)
        except Exception as e:  # noqa: BLE001 - una serie rara no debe tumbar el informe
            salud.mal(f"resumen:{k}", repr(e))
    metricas_previas = senales.calcular_metricas(series)

    # 2. Eventos (palabras clave + IA)
    clasif = ev.Clasificador(reglas)
    por_palabras = clasif.clasificar(titulares)
    resultado_ia, proveedor = ia.analizar(titulares[:120], contexto_mercado_texto(metricas_previas, resumenes), reglas["eventos"])
    eventos = ev.fusionar(por_palabras, resultado_ia, gdelt, reglas)

    # 3. Señales
    decision = senales.generar(series, eventos, reglas, ia_ok=resultado_ia is not None, noticias_ok=len(titulares) >= 30)

    # 3b. Ideas tácticas (satélites) y su historial de resultados
    cfg_ideas = cargar_yaml("ideas.yaml")
    try:
        ideas = ideas_mod.evaluar(eventos, series, datos["info"], reglas, cfg_ideas)
        historial_ideas = ideas_mod.actualizar_historial(leer_json(WEB_DATA / "ideas_historial.json", None), ideas, series, hoy_iso(),
                                                         (cfg_ideas.get("limites") or {}).get("comparar_con", "VWCE"))
    except Exception as e:  # noqa: BLE001 - las ideas son un extra: nunca tumban el informe
        salud.mal("ideas", repr(e))
        ideas, historial_ideas = [], None

    informe = {
        "fecha": hoy_iso(),
        "generado": ahora_iso(),
        "resumen": (resultado_ia or {}).get("resumen") or resumen_plantilla(eventos, decision),
        "riesgos_a_vigilar": (resultado_ia or {}).get("riesgos_a_vigilar", []),
        "tono_global": (resultado_ia or {}).get("tono_global"),
        "ia": proveedor,
        "eventos": eventos,
        "decision": decision,
        "ideas": {"limites": cfg_ideas.get("limites"), "lista": ideas},
        "gdelt": gdelt,
        "activos": {k: {**resumenes[k], **{kk: datos["info"].get(k, {}).get(kk) for kk in ("nombre", "isin", "yahoo", "moneda")}}
                    for k in resumenes},
        "titulares": [t.a_dict() for t in sorted(titulares, key=lambda t: -t.peso)[:60]],
        "num_titulares": len(titulares),
        "aviso_legal": ("Herramienta personal de apoyo a la decisión. No es asesoramiento financiero. "
                        "Las rentabilidades pasadas no garantizan rentabilidades futuras."),
    }

    # 4. Escritura
    escribir_json(WEB_DATA / "mercado.json", informe)
    escribir_json(WEB_DATA / "historial" / f"{informe['fecha']}.json", informe)
    indice = leer_json(WEB_DATA / "historial" / "indice.json", []) or []
    indice = [x for x in indice if x["fecha"] != informe["fecha"]]
    indice.append({"fecha": informe["fecha"], "postura": decision["postura"], "puntuacion": decision["puntuacion"],
                   "regimen": decision["regimen"]["principal"],
                   "eventos": [e["tipo"] for e in eventos[:5]]})
    escribir_json(WEB_DATA / "historial" / "indice.json", sorted(indice, key=lambda x: x["fecha"])[-730:])
    escribir_json(WEB_DATA / "precios_universo.json", {
        "generado": ahora_iso(),
        "series": {k: ind.muestrear_semanal(s) for k, s in series.items()
                   if k in {e["id"] for e in universo["etfs"] + universo.get("satelites", [])} | {"SP500", "STOXX50", "IBEX", "VIX", "BRENT", "ORO", "EURUSD"}},
        "ultimo": {k: series[k][-1] for k in series},
        "info": datos["info"],
    })
    if historial_ideas:
        escribir_json(WEB_DATA / "ideas_historial.json", historial_ideas)
    escribir_json(WEB_DATA / "salud_fuentes.json", salud.a_dict())

    if date.today().weekday() == 0 or not (WEB_DATA / "backtest.json").exists() or os.environ.get("FORZAR_BACKTEST"):
        escribir_json(WEB_DATA / "backtest.json", {"generado": ahora_iso(), **backtest.ejecutar(series)})

    log.info("Postura: %s (puntuación %s, régimen %s, confianza %s)", decision["postura"], decision["puntuacion"],
             decision["regimen"]["principal"], decision["confianza"])
    return informe


if __name__ == "__main__":
    ejecutar()
