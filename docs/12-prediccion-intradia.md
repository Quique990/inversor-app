# 12 · Predicción intradía (hora a hora, 7:30–23:00)

Código: `pipeline/intradia.py` (cálculo, público), `web/js/intradia.js` (combinación con la cartera, en el
navegador), `web/js/vistas/intradia.js` (tarjeta "Hoy, hora a hora" en Cartera).
Workflow: `.github/workflows/intradia.yml` (cada hora en días laborables; gratis por ser repositorio público).
Datos: `web/data/intradia.json` (salida) y `web/data/intradia_estado.json` (lo aprendido). Ninguno es personal.

## Expectativa honesta
La dirección intradía de un ETF es casi un paseo aleatorio. Lo que se predice bien es la **magnitud** del
movimiento y su **reparto horario**. La salida es una línea esperada y una banda del 80 %, y el sistema publica
cada día su error frente al modelo ingenuo ("el precio no cambia"). **No ajustes parámetros para que salga bonito**
(regla 6 de AGENTS.md).

## Datos
- Barras de 60 min de Yahoo (`range=60d`). Xetra (9:00–17:30) = puntos **reales**: apertura al inicio de la barra
  y cierre al final; la última barra se recorta a las 17:30 (`cierre_intradia` en el YAML si se usa otra plaza).
- Fuera de Xetra (Trade Republic/LS cotiza 7:30–23:00, sin datos públicos gratis) el valor se **estima**:
  `último real × exp(beta · Δlog indicador_EUR)`. Indicador por rol (`PROXY_POR_ROL`): `ES=F` para renta
  variable y `GC=F` para el oro, pasados a euros con `EURUSD=X`. Beta = MCO por el origen con rendimientos horarios
  dentro de la sesión (mín. 30 pares; si no, 0,6 o 1,0 en el oro), limitada a [0, 1,5]. Bonos y monetario: sin
  indicador (se mantiene el último precio).
- Se puede forzar otro ticker o indicador por ETF en `config/universo_etf.yaml` con `yahoo_intradia`,
  `proxy_intradia` y `cierre_intradia` (p. ej. una plaza con horario ampliado, si Yahoo la ofrece).

## Modelo
1. **GARCH(1,1)** (Bollerslev 1986) con variance targeting (Engle y Mezrich 1996) sobre 2 años de cierres
   diarios → varianza prevista para hoy, σ²_día. Ajuste por rejilla de máxima verosimilitud gaussiana (sin
   dependencias).
2. **Estacionalidad intradía** (Andersen y Bollerslev 1997): cuota media de la varianza diaria en cada franja de la
   rejilla (incluida la nocturna 23:00→7:30), con los últimos ~40 días. Sin historia hay un patrón por defecto.
3. **Rentabilidad esperada del día**: regresión con coeficientes variables estimada con un **filtro de Kalman**
   (θ sigue un paseo aleatorio; Q = 1 % de P0 por día; R = σ²_día). Variables (`VARIABLES`): constante, tono
   geopolítico (Σ intensidad × impacto típico del evento en la clase del ETF / 10, de `mercado.json`), cambio del
   VIX, movimiento nocturno (ancla / último cierre real) y rentabilidad de ayer. El prior (P0) es estrecho: el
   modelo empieza diciendo "nada" y solo se mueve si los datos lo justifican.
4. **Combinación Hedge** (Freund y Schapire 1997): expertos "ingenuo" (0) y "modelo" (Kalman). La pérdida diaria es el
   error cuadrático normalizado por la varianza acumulada; olvido 0,95, η = 1. La previsión = peso_modelo × ŷ.
5. **Trayectoria**: la deriva se reparte en proporción a la varianza acumulada (llegada de información) y la banda
   es ±1,2816 · escala · σ_acumulada desde las 7:30.
6. **Calibración de la banda**: `escala ← escala · exp(0,3 · (0,8 − cobertura))`, limitada a [0,5, 3].

## Ciclo diario
- Primera ejecución del día: evalúa el plan del día anterior (solo con puntos **reales**), actualiza Kalman, Hedge,
  la escala y el historial (60 días), y crea el plan de hoy con el ancla a las 7:30 (sin usar datos posteriores).
  Se hace commit del estado (una vez al día).
- Resto de horas: recalcula lo real/estimado hasta ahora y la previsión **reanclada** en el último dato
  (`prevision`), sin commit; despliega Pages directamente.
- Festivos: no hay puntos reales → no se aprende nada ese día.
- El análisis diario (`analisis-diario.yml`) también ejecuta el módulo para publicar con datos frescos, pero no
  guarda `intradia_estado.json` (lo guarda solo el workflow intradía, para evitar conflictos).

## Navegador
`prediccionCartera(intradia, pos)` suma participaciones × trayectoria de cada ETF. La banda de la cartera usa las
correlaciones de rendimientos diarios publicadas (`correlaciones`). Si falta alguna, se usa 0,6. Los activos sin
previsión se suman con su último valor y se listan. La calidad de la cartera es la media ponderada por valor.
`actual` de la cartera llega hasta la última hora con dato de cualquier activo; a los que les falta esa hora se les
arrastra su último valor y la hora queda como "estimado" (antes se perdía la hora entera si la parte privada y la
pública se habían actualizado en momentos distintos). La gráfica tiene zoom horizontal (chartjs-plugin-zoom 2.2.0 +
hammerjs 2.0.8, vendorizados con licencia MIT) y el eje vertical se ajusta al tramo visible. Si el último cálculo
tiene más de 90 min en horario, la tarjeta explica que GitHub ha retrasado o saltado la ejecución.

## Activos propios fuera del universo (repositorio privado)
- `pipeline/intradia_cartera.py` elige los activos de `data/cartera.json` con participaciones vivas que **no** están
  en el universo y llama a `intradia.ejecutar(etfs=…)` con el mismo modelo. Ticker: el escrito en la app o el que
  `precios_cartera.py` encontró por ISIN (`precios.json → tickers`). Rol: hueco elegido a mano o
  `clasificar.hueco_por_nombre` (oro → `GC=F`; renta variable y acciones → `ES=F`; renta fija → sin indicador).
- Tickers en USD (p. ej. acciones de EE. UU.) se pasan a euros con `EURUSD=X` hora a hora (`a_euros`). Las bolsas
  europeas se recortan a las 17:30; las de EE. UU. conservan su horario (`cierre_por_defecto`).
- Workflow reutilizable `intradia-cartera.yml`, llamado desde `plantilla-datos/.github/workflows/intradia.yml`
  (`20 6-21 * * 1-5`, ~16 min/día laborable ≈ 350 min/mes). Guarda `data/intradia.json` e `intradia_estado.json`
  en la rama `intradia` del repositorio privado con `push -f` (un solo commit: no ensucia el historial de datos).
- La web lo lee con la API de contenidos (`ref=intradia`) y lo fusiona con el público (`fusionarIntradia`): solo si
  es del mismo día; las correlaciones público-privado quedan a `null` (se usa 0,6).
- La tarjeta enseña solo los activos del usuario (los del universo solo si la cartera está vacía).
- El último valor intradía es también el **precio actual** de la cartera (`indicePrecios(…, intradia)`): el cierre
  diario se descarga una vez al día y, con el mercado moviéndose, dejaba la rentabilidad desfasada varios puntos.

## Pendiente / ideas
- Comprobar en `salud` que Yahoo devuelve barras de 60 min para todos los tickers `.DE`. Si alguno falla, probar
  otra plaza (`yahoo_intradia`).
- Variable de tono por titular con IA cuando haya una IA gratuita estable (López-Lira y Tang 2023).

## Referencias
Bollerslev (1986) *J. Econometrics*; Engle y Mezrich (1996) *Risk*; Andersen y Bollerslev (1997) *J. Empirical
Finance*; Kalman (1960) *J. Basic Eng.*; Freund y Schapire (1997) *JCSS*; Vovk (1990); Tetlock (2007)
*J. Finance*; López-Lira y Tang (2023) *Can ChatGPT Forecast Stock Price Movements?*; Fama (1970) *J. Finance*.
