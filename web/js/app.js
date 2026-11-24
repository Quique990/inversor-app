// Arranque, estado global y navegación.
import { abrirModal, cerrarModal, h, toast } from "./dom.js";
import * as store from "./store.js";
import { calcularPosiciones, indicePrecios, resumenCartera } from "./finanzas.js";
import { resumen as resumenDiners } from "./diners.js";
import { recomendar, huecoDe } from "./reco.js";
import { destruirTodas } from "./graficas.js";

const VISTAS = {
  hoy: ["Hoy", () => import("./vistas/hoy.js")],
  cartera: ["Cartera", () => import("./vistas/cartera.js")],
  diners: ["Diners", () => import("./vistas/diners.js")],
  mercado: ["Mercado", () => import("./vistas/mercado.js")],
  ajustes: ["Ajustes", () => import("./vistas/ajustes.js")],
};

export const S = { publico: {}, privado: {}, errores: [] };

async function cargarPublico() {
  const [mercado, universo, backtest, salud, indice] = await Promise.allSettled([
    store.leerPublico("mercado.json"), store.leerPublico("precios_universo.json"), store.leerPublico("backtest.json"),
    store.leerPublico("salud_fuentes.json"), store.leerPublico("historial/indice.json")]);
  S.publico = { mercado: mercado.value, universo: universo.value, backtest: backtest.value, salud: salud.value, indice: indice.value || [] };
}

async function cargarPrivado() {
  const estado = document.getElementById("estado-sync");
  estado.textContent = store.leerConfig().modo === "github" ? "Sincronizando…" : "Modo local";
  const nombres = ["perfil", "cartera", "contabilidad", "precios"];
  const res = await Promise.allSettled(nombres.map((n) => store.leer(n, { forzar: true })));
  res.forEach((r, i) => {
    if (r.status === "fulfilled") S.privado[nombres[i]] = r.value;
    else { S.privado[nombres[i]] = store.POR_DEFECTO[nombres[i]](); S.errores.push(`${nombres[i]}: ${r.reason?.message || r.reason}`); }
  });
  estado.textContent = store.leerConfig().modo === "github" ? (S.errores.length ? "Sin conexión (caché)" : "Sincronizado") : "Modo local";
}

/** Cálculos derivados que usan varias vistas. */
export function calcular() {
  const { perfil, cartera, contabilidad, precios } = S.privado;
  const universo = S.publico.universo;
  const universoPorIsin = {};
  for (const [id, info] of Object.entries(universo?.info || {})) if (info.isin) universoPorIsin[info.isin] = { id, ...info };
  const idx = indicePrecios(precios, universo, cartera.activos);
  const pos = calcularPosiciones(cartera.operaciones, idx);
  const res = resumenCartera(pos);
  // Valor de la cartera de ETF repartido por bloque de Diners (largo/medio) según cada activo
  const valorCartera = { largo: 0, medio: 0 };
  for (const p of Object.values(pos)) {
    const v = p.valor ?? p.costeVivo;
    const bloque = cartera.activos[p.isin]?.bloque === "medio" ? "medio" : "largo";
    valorCartera[bloque] += v;
  }
  const bloques = resumenDiners(contabilidad, valorCartera);
  const reco = recomendar({ mercado: S.publico.mercado, perfil, pos, activos: cartera.activos, universoPorIsin, saldos: bloques });
  return { idx, pos, res, bloques, reco, universoPorIsin, huecoDe: (isin) => huecoDe(isin, cartera.activos, universoPorIsin) };
}

export async function guardar(nombre, mensaje) {
  try {
    await store.guardar(nombre, S.privado[nombre], mensaje);
    toast(store.leerConfig().modo === "github" ? "Guardado en tu repositorio privado" : "Guardado en este navegador");
  } catch (e) {
    toast("Error al guardar: " + e.message, 5000);
    throw e;
  }
}

let renderizando = false;
export async function mostrar() {
  if (renderizando) return;
  renderizando = true;
  try {
    const nombre = (location.hash.replace(/^#\//, "").split("/")[0]) || "hoy";
    const [titulo, cargar] = VISTAS[nombre] || VISTAS.hoy;
    document.getElementById("titulo-vista").textContent = titulo;
    document.querySelectorAll(".pestanas a").forEach((a) => a.classList.toggle("activa", a.dataset.vista === nombre));
    const modulo = await cargar();
    destruirTodas();
    const vista = document.getElementById("vista");
    const contenido = await modulo.render({ S, calc: calcular(), guardar, refrescar: mostrar });
    vista.replaceChildren(...(Array.isArray(contenido) ? contenido : [contenido]));
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    document.getElementById("vista").replaceChildren(h("section", { class: "tarjeta" }, h("h2", {}, "Algo ha fallado"), h("p", {}, String(e.message || e))));
  } finally {
    renderizando = false;
  }
}

function pedirPin() {
  return new Promise((resolver) => {
    const pin = h("input", { type: "password", inputmode: "numeric", autocomplete: "current-password", placeholder: "PIN" });
    const error = h("p", { class: "neg pequeno" });
    const entrar = async () => {
      try { await store.desbloquear(pin.value); cerrarModal(); resolver(true); }
      catch { error.textContent = "PIN incorrecto."; pin.value = ""; }
    };
    pin.addEventListener("keydown", (e) => e.key === "Enter" && entrar());
    abrirModal(h("h2", {}, "Desbloquear"), h("p", { class: "suave" }, "Tu clave de GitHub está cifrada en este dispositivo. Introduce tu PIN."),
      pin, error, h("div", { class: "fila" }, h("button", { onclick: entrar }, "Entrar"),
        h("button", { class: "sec", onclick: () => { cerrarModal(); resolver(false); } }, "Seguir sin datos privados")));
    setTimeout(() => pin.focus(), 50);
  });
}

async function iniciar() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  const publico = cargarPublico();
  if (store.necesitaDesbloqueo()) await pedirPin();
  await Promise.all([publico, cargarPrivado()]);
  window.addEventListener("hashchange", mostrar);
  mostrar();
}

iniciar();
