# 01 · Arquitectura (coste 0 €)

```
┌──────────────────────── REPOSITORIO PÚBLICO: inversor-app ────────────────────────┐
│                                                                                    │
│  GitHub Actions (cron diario 06:43 UTC)  ──►  pipeline/ (Python)                   │
│     ├─ noticias.py   RSS + Google News RSS + GDELT ─┐                             │
│     ├─ mercados.py   Yahoo v8, FRED CSV, BCE SDMX, GPR ─┤                          │
│     ├─ eventos.py    palabras clave + IA (ia.py) ─────┤──► senales.py ──► web/data/*.json
│     └─ backtest.py   (lunes)                          ┘                             │
│                                                                                    │
│  GitHub Pages  ◄──  web/  (PWA estática: HTML + JS + CSS, sin servidor)            │
└────────────────────────────────────────────────────────────────────────────────────┘
          │  el navegador del móvil descarga web/ y web/data/*.json (públicos)
          ▼
   ┌─────────────── MÓVIL (PWA instalada en la pantalla de inicio) ───────────────┐
   │  Calcula la recomendación PERSONAL en local (reco.js) con:                   │
   │   · informe público del día     · tus datos privados                         │
   │  Lee/escribe tus datos con la API de GitHub usando una clave limitada al     │
   │  repositorio privado y cifrada con PIN (cripto.js).                           │
   └───────────────────────────────────────────────────────────────────────────────┘
          │  api.github.com (contents API)
          ▼
┌──────────────────── REPOSITORIO PRIVADO: inversor-datos ───────────────────┐
│  data/perfil.json · data/cartera.json · data/contabilidad.json              │
│  data/precios.json  ◄── workflow precios.yml (llama al reutilizable público) │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Componentes gratuitos

| Pieza | Servicio | Límite gratuito | Uso previsto |
|---|---|---|---|
| Ejecución diaria | GitHub Actions | Ilimitado en repositorios públicos; 2.000 min/mes en privados | ~3-5 min/día en el público; ~1 min/día en el privado |
| Web | GitHub Pages | Solo en repositorios públicos con GitHub Free | Web estática |
| IA principal | GitHub Models (`GITHUB_TOKEN` + `models: read`) | ~150 peticiones/día, 8.000 tokens de entrada y 4.000 de salida por petición (modelos "low") | 1 petición/día de ~5.000 tokens |
| IA de respaldo | API de Gemini (nivel gratuito, requiere clave) | Variable según el modelo | Solo si falla la principal |
| Noticias | RSS, Google News RSS, GDELT DOC 2.0 | Sin clave | ~25 peticiones/día |
| Precios | Yahoo Finance `/v8/finance/chart` (no oficial) | Sin clave; < 2 peticiones/s | ~30 tickers/día |
| Macro | FRED (`fredgraph.csv`), BCE (`data-api.ecb.europa.eu`) | Sin clave | 8 series/día |

Nota: Stooq exige clave desde marzo de 2026, por eso no se usa. El endpoint `/v7/quote` de Yahoo requiere autenticación desde enero de 2026; se usa `/v8/chart`.

## Decisiones de diseño

1. **Sin backend propio.** Todo es estático y los "servidores" son GitHub Actions. Así no hay nada que mantener ni pagar.
2. **Lo personal nunca toca el repositorio público.** El pipeline público no conoce tu perfil ni tu cartera. La
   recomendación personal se calcula en el navegador.
3. **Precios de tus activos en el repositorio privado.** El workflow reutilizable se ejecuta en el contexto del
   repositorio privado, así que el público no llega a saber qué tickers tienes.
4. **Degradación elegante.** Cada fuente puede fallar sin romper nada. `salud_fuentes.json` dice qué falló. Sin
   IA, el resumen se hace con una plantilla.
5. **Sin dependencias en CDN.** Chart.js y ExcelJS están en `web/vendor/`. Hay una CSP estricta (`script-src 'self'`,
   `connect-src 'self' https://api.github.com`) para que ningún script externo pueda leer la clave.
6. **Funciones puras y testeadas.** `finanzas.js`, `diners.js`, `perfil.js`, `reco.js` e `importar_tr.js` no
   dependen del DOM y se testean con Node (`tests/web/`). El pipeline se testea con pytest sin red.

## Estructura del repositorio público
```
AGENTS.md                instrucciones para Codex/agentes
config/                  universo de ETF, fuentes, reglas de eventos (YAML)
pipeline/                análisis diario en Python
scripts/generar_demo.py  datos de demostración
tests/                   pytest (pipeline) + node:test (web)
web/                     PWA (index.html, js/, css/, vendor/, data/)
plantilla-datos/         contenido inicial del repositorio privado
.github/workflows/       analisis-diario, publicar-web, tests, precios-cartera (reutilizable)
docs/                    esta documentación
```
