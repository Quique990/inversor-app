# inversor-datos (PRIVADO)

Datos personales de la app **Inversor**. Este repositorio debe ser **privado**.

| Fichero | Lo escribe | Contenido |
|---|---|---|
| `data/perfil.json` | la web | Perfil de riesgo, reparto objetivo, ETF por hueco, parámetros del plan |
| `data/cartera.json` | la web | Activos y operaciones (compras, ventas, dividendos) |
| `data/contabilidad.json` | la web | Diners: semanas, transferencias, intereses, inversiones manuales |
| `data/precios.json` | workflow `precios.yml` | Precios de tus activos (Yahoo Finance) |

Cada cambio desde la web es un commit: el historial de Git es tu copia de seguridad.
