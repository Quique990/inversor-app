// Importación del CSV oficial de Trade Republic (Perfil → Extractos → Exportar transacciones, desde abril de 2026).
// El formato exacto puede variar, así que se detectan las columnas por nombre (en inglés, alemán o español)
// y, si no se reconocen, la web deja elegir a mano qué columna es cada cosa.
import { parseNumero, uid } from "./dom.js";

export function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const primera = texto.split(/\r?\n/, 1)[0];
  const delim = [",", ";", "\t"].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === delim) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.some((x) => x !== "")) filas.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((x) => x !== "")) filas.push(fila);
  return { cabecera: filas[0] || [], filas: filas.slice(1) };
}

const ALIAS = {
  fecha: ["date", "datum", "fecha", "booking date", "valuta", "datetime", "timestamp"],
  tipo: ["type", "typ", "tipo", "transaction type", "category", "kategorie"],
  isin: ["isin", "symbol", "instrument", "wkn"],
  nombre: ["name", "nombre", "asset", "description", "beschreibung", "instrument name", "title"],
  participaciones: ["shares", "quantity", "anteile", "stück", "stueck", "participaciones", "units", "amount of shares"],
  precio: ["price", "rate", "kurs", "precio", "price per share", "share price"],
  importe: ["amount", "betrag", "importe", "total", "value", "net amount"],
  comision: ["fee", "fees", "gebühr", "gebuehr", "comision", "comisión", "costs"],
  moneda: ["currency", "währung", "moneda"],
};

export function detectarColumnas(cabecera) {
  const norm = cabecera.map((c) => c.trim().toLowerCase());
  const mapa = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    // Coincidencia exacta respetando el orden de preferencia de los alias; luego "contiene"
    let i = -1;
    for (const a of alias) { i = norm.findIndex((c, k) => c === a && !Object.values(mapa).includes(k)); if (i >= 0) break; }
    if (i < 0) i = norm.findIndex((c, k) => !Object.values(mapa).includes(k) && alias.some((a) => c.includes(a)));
    if (i >= 0 && !Object.values(mapa).includes(i)) mapa[campo] = i;
  }
  return mapa;
}

const COMPRA = /(buy|kauf|compra|savings.?plan|sparplan|plan de inversi|purchase|order.?executed|execution)/i;
const VENTA = /(sell|verkauf|venta)/i;
const DIVIDENDO = /(dividend|ausschüttung|distribution)/i;

function fechaISO(v) {
  const t = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Convierte filas en operaciones. Devuelve {operaciones, activos, descartadas}. */
export function convertir({ cabecera, filas }, mapa, origenPorDefecto = "importado") {
  const operaciones = [], activos = {}, descartadas = [];
  for (const f of filas) {
    const g = (k) => (mapa[k] === undefined ? "" : (f[mapa[k]] ?? "").trim());
    const tipoTxt = g("tipo");
    const isin = g("isin").toUpperCase();
    const fecha = fechaISO(g("fecha"));
    let part = Math.abs(parseNumero(g("participaciones")));
    let precio = Math.abs(parseNumero(g("precio")));
    let importe = Math.abs(parseNumero(g("importe")));
    const comision = Math.abs(parseNumero(g("comision"))) || 0;
    let tipo = DIVIDENDO.test(tipoTxt) ? "dividendo" : VENTA.test(tipoTxt) ? "venta" : COMPRA.test(tipoTxt) ? "compra" : null;
    // Si el tipo no es claro, el signo de las participaciones decide (negativas = venta)
    if (!tipo && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) && parseNumero(g("participaciones"))) tipo = parseNumero(g("participaciones")) < 0 ? "venta" : "compra";
    if (!tipo || !fecha || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) { descartadas.push({ fila: f, motivo: !isin ? "sin ISIN (movimiento de efectivo)" : "tipo o fecha no reconocidos" }); continue; }
    if (tipo !== "dividendo") {
      if (!part && importe && precio) part = importe / precio;
      if (!precio && importe && part) precio = importe / part;
      if (!importe && part && precio) importe = part * precio;
      if (!(part > 0) || !(importe > 0)) { descartadas.push({ fila: f, motivo: "faltan participaciones o importe" }); continue; }
      // En muchos extractos el importe ya incluye la comisión: lo separamos
      if (Math.abs(importe - part * precio - comision) < 0.02 && comision) importe = part * precio;
    }
    operaciones.push({ id: uid(), fecha, tipo, isin, participaciones: tipo === "dividendo" ? 0 : part, precio: precio || 0,
      importe: Math.round(importe * 100) / 100, comision, origen: /savings|sparplan|plan/i.test(tipoTxt) ? "plan" : origenPorDefecto,
      nota: tipoTxt });
    if (!activos[isin]) activos[isin] = { nombre: g("nombre") || isin };
  }
  return { operaciones, activos, descartadas, cabecera };
}

/** Evita duplicados al importar el mismo CSV dos veces. */
export function fusionar(existentes, nuevas) {
  const clave = (o) => `${o.fecha}|${o.tipo}|${o.isin}|${Number(o.participaciones).toFixed(6)}|${Number(o.importe).toFixed(2)}`;
  const vistas = new Set(existentes.map(clave));
  const añadidas = nuevas.filter((o) => !vistas.has(clave(o)));
  return { operaciones: [...existentes, ...añadidas], añadidas: añadidas.length, repetidas: nuevas.length - añadidas.length };
}
