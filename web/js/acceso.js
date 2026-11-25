// Contraseña de acceso a la app. En el repositorio PRIVADO (data/acceso.json) solo se guarda un verificador:
// sal aleatoria + PBKDF2-SHA256 (310.000 iteraciones). Con él se comprueba la contraseña, pero no se puede sacar.
// La misma contraseña cifra en cada dispositivo la clave de GitHub (cripto.js). Funciones puras (sin DOM ni red).

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const ITERACIONES = 310000;
export const LONGITUD_MINIMA = 8;

async function huella(contrasena, sal, iteraciones) {
  const base = await crypto.subtle.importKey("raw", enc.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: iteraciones, hash: "SHA-256" }, base, 256));
}

/** Verificador para guardar en el repositorio privado. */
export async function crearVerificador(contrasena, iteraciones = ITERACIONES) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { version: 1, algoritmo: "PBKDF2-SHA256", iteraciones, sal: b64(sal), huella: b64(await huella(contrasena, sal, iteraciones)),
    creado: new Date().toISOString() };
}

/** ¿Coincide la contraseña con el verificador? (comparación en tiempo constante) */
export async function comprobar(contrasena, v) {
  if (!v?.sal || !v?.huella) return false;
  const a = await huella(contrasena, deB64(v.sal), v.iteraciones || ITERACIONES);
  const b = deB64(v.huella);
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

/** Mensaje de error si la contraseña nueva no vale, o null. */
export function validarContrasena(c, repetida) {
  if (!c || c.length < LONGITUD_MINIMA) return `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  if (repetida !== undefined && c !== repetida) return "Las dos contraseñas no coinciden.";
  return null;
}
