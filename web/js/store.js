// Almacenamiento de los datos PRIVADOS del usuario.
//  - modo "github": ficheros JSON en un repositorio PRIVADO, vía API REST de GitHub con una clave
//    (fine-grained token) limitada a ese repositorio. La clave puede ir cifrada con PIN.
//  - modo "local": solo en este navegador (para probar). Se pierde si se borran los datos del navegador.
import { cifrar, descifrar } from "./cripto.js";

const CLAVE_CONFIG = "inversor.config";
const API = "https://api.github.com";

export const FICHEROS = {
  perfil: "data/perfil.json",
  cartera: "data/cartera.json",
  contabilidad: "data/contabilidad.json",
  precios: "data/precios.json",
  intradia: "data/intradia.json", // previsión intradía de tus activos fuera del universo (workflow privado)
  acceso: "data/acceso.json",     // verificador de la contraseña (nunca la contraseña), ver acceso.js
};
// Ficheros que viven en otra rama del repositorio privado (la rama "intradia" se reescribe cada hora)
const RAMA_FICHERO = { intradia: "intradia" };
const SOLO_WORKFLOW = new Set(["precios", "intradia"]);

export const POR_DEFECTO = {
  perfil: () => ({ version: 1, cuestionario: null, perfil: null, asignacion: null, huecos: {},
    plan: { aportacionMensual: 10, dia: 2, maxExtraMes: 100, minOrdenManual: 100, comision: 1, colchonMinimo: 0 } }),
  cartera: () => ({ version: 1, activos: {}, operaciones: [] }),
  contabilidad: () => ({ version: 1,
    config: { umbralCorto: 300, traspaso: 150 },
    saldosIniciales: { fecha: null, corto: 0, medio: 0, largo: 0 },
    semanas: [], transferencias: [], intereses: [], inversionesManuales: [], notas: [], gastos: [] }),
  precios: () => ({ series: {} }),
  intradia: () => null,
  acceso: () => null,
};

// ------------------------------------------------------------------ utilidades base64 UTF-8
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function deBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ------------------------------------------------------------------ configuración
export function leerConfig() {
  try { return JSON.parse(localStorage.getItem(CLAVE_CONFIG)) || { modo: "local" }; } catch { return { modo: "local" }; }
}
function escribirConfig(c) { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(c)); }

let tokenSesion = sessionStorage.getItem("inversor.token") || null;
const memoria = {};   // nombre -> datos
const shas = {};      // nombre -> sha del fichero en GitHub

// ------------------------------------------------------------------ sesión
// Con GitHub conectado hay que iniciar sesión cada vez que se abre la app (la sesión dura mientras la app está
// abierta: sessionStorage). La clave de GitHub se guarda en el dispositivo cifrada con la contraseña.
export const sesionAbierta = () => leerConfig().modo !== "github" || sessionStorage.getItem("inversor.sesion") === "1";

/** Descifra la clave del dispositivo con la contraseña (o el PIN antiguo). Lanza si no es correcta. */
export async function desbloquear(contrasena) {
  const c = leerConfig();
  if (c.tokenCifrado) tokenSesion = await descifrar(c.tokenCifrado, contrasena);
  else if (c.tokenPlano) tokenSesion = c.tokenPlano;
  else throw new Error("Este dispositivo no tiene clave de GitHub");
  sessionStorage.setItem("inversor.token", tokenSesion);
}

/** Tras comprobar la contraseña: deja la clave cifrada con ella (y quita la copia sin cifrar) y abre la sesión. */
export async function abrirSesion(contrasena) {
  const c = leerConfig();
  if (!tokenSesion) throw new Error("Primero hay que desbloquear la clave");
  c.tokenCifrado = await cifrar(tokenSesion, contrasena);
  delete c.tokenPlano;
  escribirConfig(c);
  sessionStorage.setItem("inversor.sesion", "1");
}

export function cerrarSesion() {
  tokenSesion = null;
  sessionStorage.removeItem("inversor.token");
  sessionStorage.removeItem("inversor.sesion");
  for (const k of Object.keys(memoria)) delete memoria[k];
}

/** Guarda la conexión con la clave aún sin cifrar en memoria; abrirSesion() la cifra con la contraseña. */
export async function configurarGithub({ owner, repo, rama = "main", token }) {
  const c = { modo: "github", owner: owner.trim(), repo: repo.trim(), rama: rama.trim() || "main" };
  escribirConfig(c);
  tokenSesion = token.trim();
  sessionStorage.setItem("inversor.token", tokenSesion);
  sessionStorage.removeItem("inversor.sesion");
  for (const k of Object.keys(memoria)) delete memoria[k];
}

export function usarModoLocal() { escribirConfig({ modo: "local" }); tokenSesion = null; sessionStorage.removeItem("inversor.token"); }

export function olvidarTodo() {
  Object.keys(localStorage).filter((k) => k.startsWith("inversor.")).forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
  tokenSesion = null;
}

function token() {
  const c = leerConfig();
  return tokenSesion || c.tokenPlano || null;
}

async function gh(ruta, opciones = {}) {
  const c = leerConfig();
  const r = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/${ruta}`, {
    ...opciones,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token()}`,
      "X-GitHub-Api-Version": "2022-11-28", ...(opciones.headers || {}) },
    cache: "no-store",
  });
  return r;
}

export async function probarConexion() {
  const c = leerConfig();
  const r = await fetch(`${API}/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token()}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}. Revisa usuario, repositorio y permisos de la clave.`);
  const info = await r.json();
  return { privado: info.private, nombre: info.full_name };
}

// ------------------------------------------------------------------ lectura / escritura
export async function leer(nombre, { forzar = false } = {}) {
  if (memoria[nombre] && !forzar) return memoria[nombre];
  const c = leerConfig();
  let datos = null;
  if (c.modo === "github" && token()) {
    try {
      const ref = encodeURIComponent(RAMA_FICHERO[nombre] || c.rama || "main");
      const r = await gh(`contents/${FICHEROS[nombre]}?ref=${ref}`);
      if (r.status === 404) datos = null;
      else if (!r.ok) throw new Error(`GitHub ${r.status}`);
      else {
        const j = await r.json();
        shas[nombre] = j.sha;
        // Ficheros >1 MB: la API no devuelve el contenido; se pide en crudo
        const texto = j.content ? deBase64(j.content)
          : await (await gh(`contents/${FICHEROS[nombre]}?ref=${ref}`,
            { headers: { Accept: "application/vnd.github.raw+json" } })).text();
        datos = JSON.parse(texto);
      }
      localStorage.setItem(`inversor.cache.${nombre}`, JSON.stringify(datos));
    } catch (e) {
      const cache = localStorage.getItem(`inversor.cache.${nombre}`);
      if (cache) datos = JSON.parse(cache);
      else throw e;
    }
  } else {
    const local = localStorage.getItem(`inversor.datos.${nombre}`);
    datos = local ? JSON.parse(local) : null;
  }
  const base = POR_DEFECTO[nombre]();
  memoria[nombre] = datos ? (base ? { ...base, ...datos } : datos) : base;
  return memoria[nombre];
}

export async function guardar(nombre, datos, mensaje = `Actualizar ${nombre}`) {
  if (SOLO_WORKFLOW.has(nombre)) throw new Error(`${nombre}.json lo escribe un workflow, no la web`);
  memoria[nombre] = datos;
  const c = leerConfig();
  const texto = JSON.stringify(datos, null, 1);
  if (c.modo !== "github") { localStorage.setItem(`inversor.datos.${nombre}`, texto); return; }
  const cuerpo = (sha) => JSON.stringify({ message: mensaje, content: aBase64(texto), branch: c.rama || "main", ...(sha ? { sha } : {}) });
  let r = await gh(`contents/${FICHEROS[nombre]}`, { method: "PUT", body: cuerpo(shas[nombre]) });
  if (r.status === 409 || r.status === 422) {
    // El fichero cambió en otro dispositivo o no conocíamos su sha: se vuelve a pedir y se reintenta
    const actual = await gh(`contents/${FICHEROS[nombre]}?ref=${encodeURIComponent(c.rama || "main")}`);
    shas[nombre] = actual.ok ? (await actual.json()).sha : undefined;
    r = await gh(`contents/${FICHEROS[nombre]}`, { method: "PUT", body: cuerpo(shas[nombre]) });
  }
  if (!r.ok) throw new Error(`No se pudo guardar en GitHub (${r.status}).`);
  shas[nombre] = (await r.json()).content.sha;
  localStorage.setItem(`inversor.cache.${nombre}`, texto);
}

export async function leerPublico(ruta) {
  const r = await fetch(`data/${ruta}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`No hay ${ruta} (${r.status})`);
  return r.json();
}

export function exportarCopia() {
  return { exportado: new Date().toISOString(), perfil: memoria.perfil, cartera: memoria.cartera, contabilidad: memoria.contabilidad };
}
