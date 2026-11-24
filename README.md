# Inversor

App personal, **gratuita** y para el móvil que cada mañana analiza la geopolítica y los mercados y te dice qué
hacer con tu inversión en ETF (Trade Republic): seguir el plan, aportar extra o tener precaución. También lleva tu
cartera (ganancia por compra, TIR y gráficas) y tu contabilidad personal **Diners**.

- 🌍 **Análisis diario automático** (GitHub Actions): más de 20 fuentes (BCE, Fed, BBC, Al Jazeera, Expansión,
  Google News…), GDELT, VIX, petróleo, curva de tipos, regla de Sahm, crédito e inflación. Resumen con IA gratuita
  (GitHub Models).
- 🧠 **Reglas basadas en evidencia** sobre cómo reaccionan los mercados a guerras, shocks de petróleo, aranceles,
  bancos centrales, recesiones… ([docs/05](docs/05-base-conocimiento-eventos.md)).
- 📱 **PWA** instalable en el iPhone, funciona sin conexión.
- 🔒 **Tus datos en un repositorio privado**, con una clave limitada y cifrada con PIN. El repositorio público no
  contiene nada tuyo.
- 💶 **Coste 0 €.**

> Herramienta personal de apoyo a la decisión. No es asesoramiento financiero. Rentabilidades pasadas no
> garantizan rentabilidades futuras.

## Empezar
Sigue [docs/10-puesta-en-marcha.md](docs/10-puesta-en-marcha.md).

## Documentación
| | |
|---|---|
| [00 Visión](docs/00-vision.md) | Para quién es y qué resuelve |
| [01 Arquitectura](docs/01-arquitectura.md) | Cómo funciona gratis |
| [02 Seguridad](docs/02-seguridad-y-privacidad.md) | Qué es público y qué privado |
| [03 Perfil de riesgo](docs/03-perfil-de-riesgo.md) | Test y carteras modelo |
| [04 Motor de señales](docs/04-motor-de-senales.md) | Cómo decide la postura del día |
| [05 Eventos y mercados](docs/05-base-conocimiento-eventos.md) | La investigación, con fuentes |
| [06 Fuentes diarias](docs/06-fuentes-diarias.md) | Qué lee cada mañana |
| [07 Diners](docs/07-diners-contabilidad.md) | Contabilidad personal |
| [08 IA](docs/08-ia-y-prompts.md) | IA gratuita y prompts |
| [09 Backtesting](docs/09-backtesting-y-evaluacion.md) | Cómo se evalúa |
| [10 Puesta en marcha](docs/10-puesta-en-marcha.md) | Paso a paso |
| [11 Hoja de ruta](docs/11-hoja-de-ruta.md) | Próximas mejoras |
| [AGENTS.md](AGENTS.md) | Instrucciones para Codex |

## Desarrollo
```bash
pip install -r requirements.txt && python -m pytest -q
node --test tests/web/logica.test.mjs
python -m http.server 8000 -d web
```

Licencias de terceros: Chart.js (MIT) y ExcelJS (MIT), en `web/vendor/`.
