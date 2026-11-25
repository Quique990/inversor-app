# AGENTS.md — Instrucciones para Codex y otros agentes

Lee esto antes de tocar el código. Proyecto: app personal de inversión en ETF + contabilidad "Diners".
Idioma: **castellano de España** en la interfaz, los comentarios, los commits y la documentación.

## Mapa rápido
- `pipeline/`: análisis diario en Python 3.12 (sin estado; lee `config/`, escribe `web/data/`).
- `web/`: PWA estática en JavaScript ES modules, **sin build ni framework**. `vendor/` = Chart.js y ExcelJS (no usar CDN).
- `config/*.yaml`: universo de ETF, fuentes y reglas de eventos. **Las reglas de inversión viven aquí y en
  `pipeline/senales.py`; documéntalas en `docs/04` y `docs/05`.**
- `tests/`: `python -m pytest -q` y `node --test tests/web/logica.test.mjs`. Ambos tienen que pasar antes de
  cualquier commit.
- `plantilla-datos/`: contenido inicial del repositorio PRIVADO de datos.
- `docs/`: empieza por `00-vision.md` y `01-arquitectura.md`. La predicción intradía está en `docs/12`.
- Workflows: `analisis-diario.yml` (06:43 UTC), `intradia.yml` (cada hora laborable; solo él guarda
  `web/data/intradia_estado.json`), `publicar-web.yml`, `tests.yml` y `precios-cartera.yml` (reutilizable desde el
  repositorio privado).
- La pantalla "Cómo funciona" (`web/js/vistas/como.js`) explica la app al usuario: **si cambias una regla o un
  modelo, actualízala también.**

## Reglas que no se rompen
1. **Privacidad:** nada personal (perfil, cartera, contabilidad, tickers propios) entra en este repositorio ni en
   `web/data/`. Lo personal se calcula en el navegador o en el repositorio privado.
2. **Seguridad web:** prohibido `innerHTML`, `outerHTML`, `insertAdjacentHTML` o `eval` con datos. Usa `h()` de
   `web/js/dom.js`. No relajes la CSP de `index.html`; si hace falta un dominio nuevo en `connect-src`, justifícalo.
3. **Coste 0:** no añadas servicios de pago ni dependencias que requieran clave de pago. Las fuentes nuevas deben
   ser gratuitas y tener RSS o API pública.
4. **La IA no decide.** Las recomendaciones salen de reglas deterministas y testeadas. La IA resume y clasifica,
   y su intensidad se limita en `eventos.fusionar`.
5. **Degradación elegante:** cada fuente externa puede fallar; registra el fallo en `Salud` y sigue.
6. **Honestidad:** si un backtest sale mal, la web lo dice. No ajustes parámetros para que el pasado reciente
   salga bonito.
7. **Funciones puras:** la lógica de negocio (`finanzas.js`, `diners.js`, `reco.js`, `perfil.js`,
   `importar_tr.js`, `intradia.js`, `pipeline/senales.py`, `indicadores.py`, `intradia.py`) no toca el DOM ni la red. Cada cambio en ella
   lleva su test.

## Comandos
```bash
pip install -r requirements.txt
python -m pytest -q                      # tests del pipeline (sin red)
node --test tests/web/logica.test.mjs    # tests de la lógica web
SIN_IA=1 python -m pipeline.main         # análisis real (necesita red)
python scripts/generar_demo.py           # datos simulados en web/data/
python -m http.server 8000 -d web        # probar la web en http://localhost:8000
```

## Convenciones
- Python: tipado, funciones pequeñas, nada de prints (usa `log`). Las series son `list[tuple[str, float]]`
  (fecha ISO, valor).
- JS: módulos ES, sin dependencias nuevas salvo que se vendoricen en `web/vendor/` con su licencia. Formatea con
  `eur()`, `pct()` y `fecha()` de `dom.js`.
- Cada vista (`web/js/vistas/*.js`) exporta `render(ctx)` y devuelve nodos. Para guardar, usa
  `ctx.guardar(nombre, mensajeCommit)` y luego `ctx.refrescar()`.
- Si añades un fichero JS, añádelo también a `NUCLEO` en `web/sw.js` y sube `VERSION`.
- Los mensajes de commit de la web al repositorio privado deben ser descriptivos ("Semana 2026-01-04: 37.50 €"),
  porque son el historial del usuario.

## Tareas pendientes
Ver `docs/11-hoja-de-ruta.md`.
