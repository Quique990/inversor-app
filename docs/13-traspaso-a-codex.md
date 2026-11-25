# 13 · Traspaso a Codex: mantenimiento y mejoras

> **Para Codex.** Desde el 25-11-2026 te encargas tú del mantenimiento y las mejoras de esta app. Este documento
> recoge el estado real del proyecto, cómo trabajar en él sin romper nada, lo que hay que vigilar y el backlog
> priorizado. Léelo después de `AGENTS.md` y antes de tocar código. Si algo de aquí contradice al código, manda el
> código: corrige este documento en el mismo cambio.

---

## 1. El usuario y lo que ha decidido (no lo cambies sin preguntarle)

- **Usuario:** Enric (cuenta de GitHub `Quique990`). **No le llames "Quique".** Escríbele en castellano de España,
  claro y sin jerga. No es programador de webs: cuando necesites algo de él (un secreto, pulsar un botón en
  GitHub), dale los pasos exactos.
- **Uso:** invierte en ETF con **Trade Republic**, a largo plazo, unos 10 € al mes con plan de ahorro y compras extra
  esporádicas cuando hay buen momento. Usa la web **en el móvil** como PWA.
- **Decisiones firmes:**
  | Tema | Decisión |
  |---|---|
  | Presupuesto | **0 €.** Nada de servicios de pago, ni claves que exijan tarjeta o facturación. |
  | Privacidad | Código en el repositorio **público** `Quique990/inversor-app`; datos personales **solo** en el **privado** `Quique990/inversor-datos`. |
  | Idioma | Castellano en interfaz, comentarios, commits y documentación. |
  | Diners | Es su Excel de contabilidad convertido en app. **Sin categorías de gasto** (las quitó a propósito). La regla de los 300 € es **solo un aviso**, nunca un movimiento automático. |
  | Recomendaciones | Casi siempre "mantener plan". Comprar extra solo con caída + miedo. **Vender casi nunca.** La IA no decide. |
  | Predicción intradía | Horario completo de Trade Republic (**7:30–23:00**), **cada ETF y la cartera completa**, valores cada hora como mínimo, con retroalimentación diaria. |
  | Documentación para él | **Dentro de la app** (pantalla "Cómo funciona", `web/js/vistas/como.js`), no en documentos aparte. |
  | Telegram | **Aparcado.** No lo implementes hasta que lo pida. |
  | Gemini | **Aparcado.** AI Studio le pidió activar facturación; no le insistas. |

---

## 2. Estado a 25-11-2026

### Funciona en producción (verificado con ejecuciones reales en Actions)
- **Análisis diario** (`analisis-diario.yml`, 06:43 UTC): precios, FRED, BCE, ~300 titulares de 22 fuentes,
  eventos, régimen, puntuación, postura y backtest semanal. Postura reciente: `mantener_plan`, régimen
  `inflacion_alta`.
- **Predicción intradía** (`intradia.yml`, cada hora laborable): Yahoo devuelve barras de 60 min para los 9 ETF
  `.DE` del universo (~600 puntos cada uno). Beta frente a futuros razonable (VWCE ≈ 0,89). Primer plan real:
  25-11-2026. **Aún no hay días evaluados**: la calidad (`calidad.dias`) empieza a contar desde el 26-11.
- **Web** en GitHub Pages: `https://quique990.github.io/inversor-app/`. Despliegue con `publicar-web.yml` y
  también desde los workflows de análisis e intradía.
- **Tests:** 29 en Python y 18 en JS, todos en verde (`tests.yml` en cada push).

### Cambios del 25-11-2026 (petición del usuario)
- Activos fuera del universo: tipo deducido del nombre (`reco.clasificarNombre` / `pipeline/clasificar.py`, misma
  regla en los dos lados), ticker buscado por ISIN en el workflow privado (`pipeline/tickers.py`) y previsión
  intradía privada (`pipeline/intradia_cartera.py` + `intradia-cartera.yml`, rama `intradia` del privado).
- Precio actual = último dato intradía (antes, cierre diario con hasta un día de retraso: la rentabilidad salía
  varios puntos distinta de la de Trade Republic). `yahoo_serie` usa el cierre si falta el ajustado.
- La tarjeta intradía solo enseña los activos del usuario.
- Diners: asistente "Poner mi dinero a mano", tarjeta **Paga** (check por semana) y **+ Gasto** (con bloque).
- Hoy y Mercado muestran fecha y hora del último análisis de noticias (`mercado.generado`), con aviso si > 30 h.

### Funciona pero sin probar con datos reales del usuario
- Conexión al repositorio privado (token de grano fino + PIN). El usuario **todavía no** ha conectado el token,
  ni importado su `Diners.xlsx`, ni el CSV de Trade Republic. Cuando lo haga, revisad juntos:
  - los **saldos iniciales** de medio y largo plazo (en su Excel estaban vacíos);
  - que las compras importadas del CSV no se cuenten dos veces con las inversiones manuales del Excel (la app
    avisa en Diners → "Revisa esto");
  - si alguna compra se pagó con dinero de fuera de Diners (nota del Excel: "704 € de paga en Trade Republic no
    contabilizados").

### No funciona o funciona a medias
| Problema | Efecto | Pista |
|---|---|---|
| **GitHub Models** responde `200 text/plain "OK"` en vez del JSON de chat | El resumen lo hace la plantilla (`resumen_plantilla`) | `pipeline/ia.py` ya registra diagnóstico del catálogo. Revisar el endpoint/modelo vigente en la documentación de GitHub Models. No es crítico. |
| **GDELT** devuelve 429 desde Actions | 4 consultas fallan a diario (`salud_fuentes.json`) | Ya se espacian 12 s. Opciones: una sola consulta combinada, o quitarlo si sigue fallando 2 semanas. |
| **Activos del usuario fuera del universo** | Previsión solo cuando active el workflow privado `intradia.yml` | Código hecho (25-11); falta que el usuario lo active y comprobar la primera ejecución. |
| **Importación de Diners.xlsx** | El usuario dice que no va bien | Hay que reproducirlo con su fichero (en su dispositivo, nunca en este repositorio). Mientras, tiene el modo manual. |
| **Precios fuera de Xetra** | Son **estimados** con futuros (no hay datos de Lang & Schwarz gratis) | Documentado en `docs/12`. No lo presentes nunca como real. |
| **Retrasos de cron** | GitHub retrasa 10-60 min o se salta ejecuciones | Normal. No "arregles" añadiendo más crons. |

---

## 3. Cómo trabajar

### Antes de empezar cualquier tarea
1. `git pull`: los workflows hacen commits automáticos varias veces al día ("Análisis diario…", "Intradía: plan…").
2. Lee el documento de `docs/` de la zona que vas a tocar (índice en la sección 7).
3. Ejecuta los tests para partir de verde.

### Comandos
```bash
pip install -r requirements.txt
python -m pytest -q                       # pipeline (sin red)
node --test tests/web/logica.test.mjs     # lógica web
SIN_IA=1 python -m pipeline.main          # análisis real (necesita red)
FORZAR=1 python -m pipeline.intradia      # intradía real fuera de horario (necesita red)
python scripts/generar_demo.py            # datos simulados en web/data/ (NO hagas commit de ellos)
python -m http.server 8000 -d web         # web en http://localhost:8000 (modo local con localStorage)
```
Para probar la web con datos: en modo local la app guarda en `localStorage` con claves `inversor.datos.cartera`,
`inversor.datos.contabilidad` e `inversor.datos.perfil`. Puedes inyectarlas con Playwright y abrir
`#/cartera`, `#/diners`, etc. (recarga la página después de inyectarlas).

### Checklist de cada cambio ("hecho" significa todo esto)
- [ ] Tests nuevos o ampliados para la lógica cambiada (regla 7 de `AGENTS.md`), y todos en verde.
- [ ] Si añades o renombras un JS: está en `NUCLEO` de `web/sw.js` y has subido `VERSION`. **Si no subes
      `VERSION`, el móvil del usuario seguirá con el código viejo** (el service worker sirve primero la caché).
- [ ] Nada de `innerHTML`, `eval` ni CDNs; CSP intacta.
- [ ] Nada personal en el repositorio público ni en `web/data/`.
- [ ] Si cambia una regla, un modelo o lo que ve el usuario: actualizado `web/js/vistas/como.js` **y** el
      `docs/NN` correspondiente.
- [ ] Probado en un viewport de móvil (390×844) sin errores de consola.
- [ ] Commit en castellano y descriptivo. Un cambio = un commit (o un PR si el usuario lo prefiere).
- [ ] Tras el push: `Tests` y `Publicar web` en verde en Actions.

### Compatibilidad de datos del usuario (muy importante)
Los JSON del repositorio privado (`perfil.json`, `cartera.json`, `contabilidad.json`) son **el historial real del
usuario** y llevan `version: 1`.
- Los cambios de esquema deben ser **aditivos**: campos nuevos opcionales y con valor por defecto en el código.
- Si alguna vez es imprescindible un cambio incompatible: sube `version`, escribe una migración pura en el
  navegador (al cargar) con su test, y no borres nunca campos que el usuario rellenó.
- Nunca reescribas el repositorio privado desde un workflow público.

---

## 4. Contratos de datos (resumen)

| Fichero | Quién lo escribe | Lo lee | Notas |
|---|---|---|---|
| `web/data/mercado.json` | `pipeline/main.py` | Hoy, Mercado, intradía | `fecha`, `activos.*.var_1d`, `eventos[] {tipo, intensidad, impacto_tipico{renta_variable, renta_fija_calidad, oro…}}`, régimen, puntuación, postura. |
| `web/data/precios_universo.json` | `main.py` | Cartera, reco | `series` **semanales** (no diarias) e `info`. |
| `web/data/historial/AAAA-MM-DD.json` + `indice.json` | `main.py` | Mercado | Un fichero por día. |
| `web/data/backtest.json` | `main.py` (lunes) | Mercado | Plan puro vs. plan + reserva táctica. |
| `web/data/salud_fuentes.json` | `main.py` | Mercado → Salud | `ok`, `fallos`, totales. |
| Privado `data/intradia.json` (rama `intradia`) | `intradia_cartera.py` (workflow privado) | Cartera (fusionado con el público) | Mismo formato que el público; ids = ISIN. Se reescribe con `push -f`. |
| `web/data/intradia.json` | `pipeline/intradia.py` | Cartera → "Hoy, hora a hora" y precio actual | `horas`, `z`, `activos.{id}.{isin, ancla, plan[], actual[], prevision[], modelo, calidad, historial}`, `correlaciones`. Formato estable: la web depende de él. |
| `web/data/intradia_estado.json` | **solo** `intradia.yml` | `intradia.py` | Lo aprendido (Kalman, Hedge, escala, historial de 60 días, plan del día). **No lo borres**: perderías el aprendizaje. |
| Privado `data/cartera.json` | Web | Web, `precios_cartera.py` | `activos{isin:{nombre, bloque, ticker…}}`, `operaciones[] {fecha, tipo, isin, participaciones, precio, importe, comision, origen, pagadoDesde?}`. |
| Privado `data/contabilidad.json` | Web | Web | Esquema en `docs/07`. |
| Privado `data/precios.json` | `precios_cartera.py` (workflow privado) | Web, `intradia_cartera.py` | Precios diarios de los activos propios y `tickers{isin:{ticker, moneda, origen}}` (encontrados por ISIN o manuales). |

---

## 5. Operación (runbook)

### Workflows
| Workflow | Cuándo | Hace commit | Despliega |
|---|---|---|---|
| `analisis-diario.yml` | 06:43 UTC diario + manual | `web/data/*` excepto `intradia_estado.json` | Sí |
| `intradia.yml` | `13 5-22 * * 1-5` UTC + manual (`FORZAR=1`) | Solo el plan nuevo del día (1 vez/día) | Sí, cada hora |
| `publicar-web.yml` | Push a `main` | No | Sí |
| `tests.yml` | Push y PR | No | No |
| `precios-cartera.yml` | Reutilizable, lo llama el repositorio privado (`17 18 * * 1-5`) | En el privado | No |
| `intradia-cartera.yml` | Reutilizable, lo llama el privado (`20 6-21 * * 1-5`, ~350 min/mes) | Rama `intradia` del privado (`push -f`) | No |

- Secretos y variables (repositorio público): `GITHUB_TOKEN` (automático; permiso `models: read`),
  `GEMINI_API_KEY` (opcional, **no configurada**), `vars.GEMINI_MODEL` y `vars.GITHUB_MODELS_MODEL` (opcionales).
- Los minutos de Actions son gratis en el repositorio público. En el privado hay 2.000 min/mes: cualquier workflow
  nuevo allí debe ser barato (calcula los minutos/mes en el PR).

### Problemas ya vistos y su solución
| Síntoma | Causa | Solución aplicada |
|---|---|---|
| `No artifacts named "github-pages"` | Subida y despliegue en el mismo job / sin `actions: read` | Jobs separados, `upload-pages-artifact@v5`, `actions: read`. No lo deshagas. |
| `push rejected (fetch first)` | Otro workflow hizo commit antes | `git pull --rebase -X theirs --autostash` antes de `git push`. |
| `ZeroDivisionError` con series a 0 | Datos de Yahoo con ceros | Guardas en `indicadores.py` + `try/except` por serie + test de regresión. |
| Fuentes 403/404 (FMI, Guardian, Yahoo RSS, elEconomista, `^V2TX`) | Fuentes muertas o que bloquean | Eliminadas. Antes de añadir una fuente, pruébala desde Actions, no solo en local. |
| La web no muestra un cambio | Caché del service worker | Subir `VERSION` en `web/sw.js`. |
| `intradia.json` con plan anclado de madrugada | Ejecución manual antes de las 7:00 | El plan anterior a las 07:00 es provisional y se rehace (test incluido). |

### Si el usuario dice que algo no funciona
1. Actions: ¿último "Análisis diario" e "Intradía" en verde? Si no, abre el log.
2. `web/data/salud_fuentes.json` y `intradia.json → salud`: ¿qué fuente falla?
3. En el móvil: ¿token conectado en Ajustes? ¿ha cerrado y abierto la app tras el último cambio?
4. Reproduce en local con `python -m http.server` y Playwright a 390×844.

---

## 6. Backlog priorizado

Cada tarea lleva su criterio de aceptación. Hazlas en orden salvo que el usuario pida otra cosa.

1. **Vigilar la predicción intradía las 2 primeras semanas.**
   *Aceptación:* `calidad.dias` crece cada día laborable; `cobertura_pct` tiende a 70-90 %; ninguna excepción en los
   logs. Si la cobertura se queda < 60 % o > 97 % tras 10 días, revisa la estacionalidad o la calibración
   **sin** tocar los parámetros para "maquillar" (regla 6). Documenta lo que veas en `docs/12`.
2. **Intradía para activos propios fuera del universo: HECHO el 25-11-2026** (ver docs/12). Pendiente: que el
   usuario copie `plantilla-datos/.github/workflows/intradia.yml` y comprobar la primera ejecución real (tickers
   encontrados por ISIN, conversión USD → EUR) y los minutos gastados.
3. **IA gratuita para el resumen.** Arreglar GitHub Models (endpoint o modelo actual) o añadir un proveedor con nivel
   gratuito **sin tarjeta** (p. ej. Groq, OpenRouter o Mistral) a la cadena de `pipeline/ia.py`.
   *Aceptación:* `mercado.json` indica un proveedor ≠ plantilla; la intensidad sigue limitada a +1
   (`eventos.fusionar`); si falla, vuelve a la plantilla sin romper nada.
4. **GDELT:** reducir a 1 consulta o eliminar. *Aceptación:* 0 fallos de GDELT en `salud` durante una semana, o
   fuente retirada y `docs/06` actualizado.
5. **Gráfica de la puntuación frente a la bolsa mundial** (en Mercado) con el historial diario.
6. **Calendario macro** (Fed, BCE, IPC) para avisar de días de volatilidad esperada; puede alimentar también la
   banda intradía como variable (probar con evaluación, no a ojo).
7. **Modo IRPF:** ganancias realizadas por año (FIFO) listas para la declaración.
8. **Varios dispositivos:** fusionar cambios en lugar de "gana el último" (usa el `sha` de la API de contenidos).
9. **Telegram:** solo cuando el usuario lo pida (diseño en `docs/11`).

### Ideas que NO debes hacer (salvo petición explícita)
- Ejecutar órdenes en Trade Republic o leer su app (no hay API pública y sería un riesgo).
- Modelos de ML grandes para predecir precios, o que la predicción intradía influya en las recomendaciones.
- Mover datos personales a `web/data/` "para simplificar".
- Añadir categorías de gasto a Diners.

---

## 7. Índice de la documentación

| Doc | Tema |
|---|---|
| `00-vision` | Qué es la app y para quién |
| `01-arquitectura` | Piezas, flujos de datos y repositorios |
| `02-seguridad-y-privacidad` | Token, PIN, cifrado, CSP |
| `03-perfil-de-riesgo` | Cuestionario y reparto objetivo |
| `04-motor-de-senales` | Puntuación, régimen, postura |
| `05-base-conocimiento-eventos` | Evidencia histórica por tipo de evento |
| `06-fuentes-diarias` | Fuentes activas y retiradas |
| `07-diners-contabilidad` | Diners, mapeo del Excel y revisión de fórmulas |
| `08-ia-y-prompts` | Papel de la IA y prompts |
| `09-backtesting-y-evaluacion` | Backtest y eficacia de las señales |
| `10-puesta-en-marcha` | Pasos de instalación para el usuario |
| `11-hoja-de-ruta` | Hecho / próximo / descartado |
| `12-prediccion-intradia` | Modelo intradía, datos y ciclo de aprendizaje |
| `13-traspaso-a-codex` | Este documento |

---

## 8. Trampas técnicas que conviene conocer

- `precios_universo.json` tiene series **semanales**. Para todo lo diario (GARCH, correlaciones) se descarga aparte.
- Yahoo: barras de 60 min con `range=60d`. La última barra de Xetra se recorta a las 17:30. Usa `query1` y,
  como respaldo, `query2`.
- Las horas de la rejilla intradía van en **hora de Madrid** (`zoneinfo`); los cron en **UTC**. Ojo con el cambio
  de hora: el cron intradía cubre ambos horarios y el script filtra.
- `intradia_estado.json` solo lo guarda `intradia.yml`. El análisis diario lo ejecuta para publicar datos frescos,
  pero lo descarta antes del commit (evita conflictos).
- `diners.saldos(c, hasta, cartera)` necesita la cartera para descontar las compras. Si llamas sin `cartera`, las
  compras no se descuentan (útil solo en tests).
- Los repartos de intereses quedan **fijados** al guardarse; para recalcularlos usa `recalcularRepartos`.
- En la web todo pasa por `h()` de `dom.js` y `ctx.guardar()`; el commit al repositorio privado lleva un mensaje
  legible porque es el historial del usuario.
- Desde algunos entornos (sandbox de agentes), Yahoo y `github.io` están bloqueados: verifica con una ejecución
  manual en Actions (`workflow_dispatch`) en lugar de suponer.

---

## 9. Cómo hablar con el usuario

- Respuestas cortas, en castellano, con el resultado primero y los pasos a seguir numerados.
- Si algo requiere que haga algo en GitHub o en el móvil, indica la ruta exacta de menús.
- Sé honesto con las limitaciones (sobre todo con la predicción): prefiere "no se puede saber" a una cifra bonita.
- No le pidas claves por chat: van como secretos de GitHub.
