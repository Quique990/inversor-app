// PIN de acceso a la app (4 cifras). En el repositorio PRIVADO (data/acceso.json) solo se guarda un verificador:
// sal aleatoria + PBKDF2-SHA256 (310.000 iteraciones). Con él se comprueba el PIN, pero no se guarda el PIN.
// El mismo PIN cifra en cada dispositivo la clave de GitHub (cripto.js). Funciones puras (sin DOM ni red).
// Los verificadores antiguos sin `tipo: "pin"` eran de una contraseña: al entrar con ella se pide crear el PIN.

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const ITERACIONES = 310000;
export const CIFRAS_PIN = 4;

async function huella(contrasena, sal, iteraciones) {
  const base = await crypto.subtle.importKey("raw", enc.encode(contrasena), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: sal, iterations: iteraciones, hash: "SHA-256" }, base, 256));
}

/** Verificador para guardar en el repositorio privado. */
export async function crearVerificador(contrasena, iteraciones = ITERACIONES) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return { version: 1, tipo: "pin", algoritmo: "PBKDF2-SHA256", iteraciones, sal: b64(sal), huella: b64(await huella(contrasena, sal, iteraciones)),
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

/** Mensaje de error si el PIN nuevo no vale, o null. */
export function validarPin(pin, repetido) {
  if (!new RegExp(`^\\d{${CIFRAS_PIN}}$`).test(pin || "")) return `El PIN tiene que ser de ${CIFRAS_PIN} cifras.`;
  if (repetido !== undefined && pin !== repetido) return "Los dos PIN no coinciden.";
  return null;
}

/** ¿El verificador guardado es de un PIN? (los antiguos eran de una contraseña) */
export const esPin = (v) => v?.tipo === "pin";
