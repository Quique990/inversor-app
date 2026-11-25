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
- Se guarda en el móvil (`localStorage`) **cifrada** con AES-GCM-256 y una clave derivada de la **contraseña de
  la app** con PBKDF2-SHA256 (310.000 iteraciones). Mientras la app está abierta, se guarda descifrada en
  `sessionStorage`, que se borra al cerrar la app.

## Entrada con PIN (desde el 25-11-2026)
- Con el repositorio privado conectado, la app no enseña nada hasta poner el **PIN de 4 cifras**
  (`web/js/sesion.js`). No hay botón para entrar sin él. La sesión dura mientras la app está abierta; "Cerrar
  sesión" y "Cambiar PIN" están en Ajustes. Con el PIN creado, la app entra sola al escribir la 4.ª cifra.
- El PIN es el mismo en todos los dispositivos. En el repositorio privado se guarda solo un **verificador** en
  `data/acceso.json` (`tipo: "pin"`, sal aleatoria + PBKDF2-SHA256, 310.000 iteraciones; `web/js/acceso.js`). El
  PIN no se guarda en ningún sitio.
- Al entrar, el PIN debe descifrar la clave de GitHub del dispositivo **y** coincidir con el verificador. Si el
  dispositivo tenía otro PIN (cambiado en otro dispositivo), se pide el actual y se vuelve a cifrar la clave. Sin
  conexión, basta con que descifre la clave del dispositivo.
- Hubo unas horas con contraseña en vez de PIN (verificador sin `tipo`): al entrar con esa contraseña se pide
  crear el PIN y se sustituye.
- PIN olvidado: borrar `data/acceso.json` en GitHub, "Volver a conectar este dispositivo" y crear otro.
- Límite asumido (decisión del usuario): 4 cifras son 10.000 combinaciones. Protege frente a alguien que coja el
  móvil o abra la web, pero no frente a quien ya tenga una copia del almacenamiento del navegador o acceso al
  repositorio privado (podría probarlas todas). La protección de fondo sigue siendo que el repositorio es privado
  y la clave de GitHub solo toca ese repositorio.
- Los datos públicos de mercado (`web/data/*.json`) siguen siendo públicos por diseño: el repositorio de la app
  es público. En modo local (sin GitHub) no se pide PIN.

## Protecciones de la web
- **CSP:** `script-src 'self'`, de modo que solo se ejecuta código del propio repositorio. `connect-src` solo
  permite el propio dominio y `api.github.com`, y no se pueden cargar scripts de terceros.
- **Sin `innerHTML` con datos externos.** Titulares, nombres de activos y ficheros importados se insertan como
  texto con `h()` (`web/js/dom.js`). Esto evita que un titular malicioso inyecte código.
- **Enlaces** a noticias con `rel="noopener noreferrer"` y `referrer` desactivado.
- **Ficheros importados** (Excel, CSV): se procesan en el móvil y no se suben a ningún sitio. Solo se guarda el
  resultado en el repositorio privado.

## Riesgos residuales (asumidos)
- Si alguien tiene tu móvil desbloqueado con la app abierta (sesión iniciada), ve tus datos. Lo mismo pasa con la
  app del banco. Cierra la sesión o la app para que vuelva a pedir la contraseña.
- Yahoo Finance no es una API oficial y puede fallar o cambiar. En ese caso puedes introducir el precio a mano.
- La IA puede equivocarse al resumir. Por diseño, no decide las recomendaciones.

## Aviso legal
Herramienta de uso personal y apoyo a la decisión. No es asesoramiento financiero regulado (MiFID II/CNMV). No
la ofrezcas a terceros como servicio de recomendación.
