# 02 · Seguridad y privacidad

## Qué es público y qué es privado
| Público (inversor-app) | Privado (inversor-datos) |
|---|---|
| Código, configuración, documentación | Perfil de riesgo y respuestas del test |
| Informe diario de mercado (`web/data/`) | Operaciones, activos, precios de tus activos |
| Precios del universo de ETF de referencia | Contabilidad Diners completa |

El repositorio público no contiene **nada** tuyo. Cualquiera puede ver el análisis diario de mercado, igual que
cualquiera puede leer un periódico.

## La clave de GitHub
- Es un **fine-grained personal access token** limitado a **un solo repositorio** (`inversor-datos`) con el permiso
  **Contents: Read and write**. Si alguien la robara, solo podría tocar ese repositorio.
- Se guarda en el móvil (`localStorage`). Con PIN (recomendado) va **cifrada** con AES-GCM-256 y una clave
  derivada del PIN con PBKDF2-SHA256 (310.000 iteraciones). Mientras la app está abierta, se guarda descifrada
  en `sessionStorage`, que se borra al cerrar la pestaña.
- Al conectar, la web comprueba que el repositorio es **privado** y se niega a continuar si es público.
- Pon caducidad a la clave y renuévala cuando caduque (Ajustes → Cambiar conexión).

## Protecciones de la web
- **CSP:** `script-src 'self'`, de modo que solo se ejecuta código del propio repositorio. `connect-src` solo
  permite el propio dominio y `api.github.com`, y no se pueden cargar scripts de terceros.
- **Sin `innerHTML` con datos externos.** Titulares, nombres de activos y ficheros importados se insertan como
  texto con `h()` (`web/js/dom.js`). Esto evita que un titular malicioso inyecte código.
- **Enlaces** a noticias con `rel="noopener noreferrer"` y `referrer` desactivado.
- **Ficheros importados** (Excel, CSV): se procesan en el móvil y no se suben a ningún sitio. Solo se guarda el
  resultado en el repositorio privado.

## Riesgos residuales (asumidos)
- Si alguien tiene tu móvil desbloqueado con la app abierta, ve tus datos. Lo mismo pasa con la app del banco.
- Yahoo Finance no es una API oficial y puede fallar o cambiar. En ese caso puedes introducir el precio a mano.
- La IA puede equivocarse al resumir. Por diseño, no decide las recomendaciones.

## Aviso legal
Herramienta de uso personal y apoyo a la decisión. No es asesoramiento financiero regulado (MiFID II/CNMV). No
la ofrezcas a terceros como servicio de recomendación.
