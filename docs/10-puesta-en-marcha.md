# 10 · Puesta en marcha (unos 15 minutos, una sola vez)

## 1. Repositorios
1. **`inversor-app` (público):** sube aquí todo este proyecto.
2. **`inversor-datos` (PRIVADO):** sube el contenido de `plantilla-datos/`. En
   `.github/workflows/precios.yml` cambia `TU_USUARIO` por tu usuario de GitHub (aparece dos veces).

## 2. Activar la web (GitHub Pages)
En `inversor-app` → Settings → Pages → *Build and deployment* → **Source: GitHub Actions**.
Después ve a Actions → "Publicar web" → *Run workflow*. Tu web quedará en `https://TU_USUARIO.github.io/inversor-app/`.

## 3. Primer análisis
Actions → "Análisis diario" → *Run workflow*. Tarda 3-5 minutos y sustituye los datos de demostración. A partir
de ahí se ejecuta solo cada mañana (06:43 UTC).

Opcional: Settings → Secrets and variables → Actions → *New repository secret* `GEMINI_API_KEY`, como IA de
respaldo gratuita (clave de Google AI Studio).

## 4. Clave para tus datos privados
GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*:
- **Repository access:** *Only select repositories* → `inversor-datos`.
- **Permissions → Repository permissions → Contents: Read and write.** Ningún otro permiso.
- **Expiration:** la máxima que te deje. Cuando caduque, crea otra y pégala en la app.

## 5. En el iPhone
1. Abre la web en **Safari** → Compartir → **Añadir a pantalla de inicio**.
2. Abre la app → **Ajustes → Conectar GitHub**: tu usuario, `inversor-datos`, la clave y un PIN.
3. **Ajustes → Hacer test** (perfil de riesgo) y **Tu plan** (aportación mensual, máximo extra al mes, colchón).
4. **Diners → Importar Diners.xlsx** (tu Excel) y revisa los saldos iniciales.
5. **Cartera → Importar CSV de Trade Republic** (en Trade Republic: Perfil → Extractos → Exportar transacciones).
6. Si tienes activos que no están en el universo de ETF, toca el activo y pon su **ticker de Yahoo** (p. ej.
   `WCBR.DE`). El workflow `precios.yml` del repositorio privado actualizará su precio cada tarde. Si no lo
   encuentras, pon un precio manual.

## 6. Uso diario
- Abre **Hoy**: la postura del día, qué hacer con tu dinero este mes y por qué.
- Cuando cobres o gastes: **Diners → + Semana**.
- Cuando compres: **Cartera → + Operación** (marca "Extra (señal)" si la compra viene de una recomendación) o
  vuelve a importar el CSV, que no duplica operaciones.

## Problemas frecuentes
| Síntoma | Solución |
|---|---|
| "GitHub respondió 401/404" al conectar | Revisa el usuario, el nombre del repositorio y que la clave tenga acceso a ese repositorio con Contents: Read and write |
| Un activo sale "sin precio" | Ponle su ticker de Yahoo y ejecuta "Precios de mi cartera" en el repositorio privado, o pon un precio manual |
| El análisis no se actualiza | Actions → "Análisis diario" → mira el log; Mercado → Estado de las fuentes |
| He olvidado el PIN | Ajustes → Olvidar este dispositivo y vuelve a conectar (tus datos siguen en GitHub) |
