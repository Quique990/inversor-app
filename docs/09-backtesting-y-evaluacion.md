# 09 · Backtesting y evaluación honesta

## Backtest automático (`pipeline/backtest.py`, cada lunes → `web/data/backtest.json`)
Compara, **con el mismo dinero aportado**, dos estrategias:
- **A, plan puro:** 100 €/mes invertidos el primer día hábil del mes.
- **B, plan + reserva táctica:** el (100 − x) % se invierte igual y el x % va a una hucha sin intereses. La hucha
  se invierte entera cuando la puntuación es ≥ 45, o en tercios cuando es ≥ 20, con 14 días de enfriamiento.

Se usa el S&P 500 desde 1990 (o VWCE si falla) y el VIX, porque son las únicas señales que se pueden reconstruir
hacia atrás gratis. Las noticias históricas no entran.

**Qué esperar:** según Vanguard, invertir pronto gana unas 2 de cada 3 veces, así que es probable que B **no** gane
a A. La web lo muestra tal cual. Por eso la app no te pide retener dinero del plan: las aportaciones extra salen
de ahorro que ya tenías fuera (el medio plazo de Diners), y la pregunta relevante pasa a ser "¿cuándo meto ese
ahorro?". La puntuación mejora ese momento frente a meterlo en un día cualquiera.

## Evaluación con tus datos reales
Cartera → "¿Te han servido las señales?" compara el precio de cada compra marcada como **Extra (señal)** con el
precio medio de tus compras del **plan** del mismo ETF en ±90 días. Un valor positivo significa que compraste
más barato gracias a la señal.

## Tests
- `python -m pytest -q`: escenarios del motor (máximos, corrección geopolítica, petróleo con inflación, recesión,
  tendencia bajista), parseo de RSS/Atom, clasificador, fusión con IA y pipeline completo sin red.
- `node --test tests/web/logica.test.mjs`: FIFO, XIRR, histórico, eficacia de señales, Diners, perfil,
  recomendación e importación del CSV de Trade Republic.

## Cómo calibrar
Si en 6-12 meses ves demasiadas o muy pocas señales, ajusta los umbrales en `config/reglas_eventos.yaml`
(`umbrales`) y los cortes de puntuación en `pipeline/senales.py` (`decidir_postura`). Después vuelve a lanzar el
backtest (`FORZAR_BACKTEST=1`). No ajustes los parámetros "a medida" del pasado reciente: es sobreajuste.
