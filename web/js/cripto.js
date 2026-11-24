// Cifrado de la clave de GitHub con un PIN (AES-GCM 256 + PBKDF2-SHA256, 310.000 iteraciones).
// La clave nunca se guarda en claro si el usuario pone PIN.

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derivar(pin, sal) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: 310000, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function cifrar(texto, pin) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivar(pin, sal);
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, enc.encode(texto));
  return { v: 1, sal: b64(sal), iv: b64(iv), datos: b64(datos) };
}

export async function descifrar(paquete, pin) {
  const clave = await derivar(pin, deB64(paquete.sal));
  const datos = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(paquete.iv) }, clave, deB64(paquete.datos));
  return dec.decode(datos);
}
