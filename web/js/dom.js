// Utilidades de interfaz. REGLA DE SEGURIDAD: nunca usar innerHTML con datos externos
// (titulares, nombres de activos, ficheros importados). h() solo crea nodos de texto.

export function h(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else if (k === "href" && typeof v === "string" && /^\s*javascript:/i.test(v)) continue;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export const tarjeta = (titulo, ...contenido) => h("section", { class: "tarjeta" }, titulo ? h("h2", {}, titulo) : null, ...contenido);

const fmtEur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

export function eur(x) { return x === null || x === undefined || Number.isNaN(x) ? "—" : fmtEur.format(x); }
export function num(x, d = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: d }).format(x);
}
export function pct(x, d = 1, signo = true) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return (signo && x > 0 ? "+" : "") + new Intl.NumberFormat("es-ES", { maximumFractionDigits: d, minimumFractionDigits: d }).format(x) + " %";
}
export function claseSigno(x) { return x > 0 ? "pos" : x < 0 ? "neg" : ""; }
/** "25 nov, 07:43 (hace 2 h)" en hora de Madrid, para saber cuándo se generó un dato. */
export function momento(iso, ahora = new Date()) {
  if (!iso) return "—";
  const d = new Date(iso);
  const texto = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  const min = Math.round((ahora - d) / 60000);
  const hace = min < 1 ? "ahora mismo" : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;
  return `${texto} (${hace})`;
}

export function fecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
export const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const fmtNumero = fmtNum;

export function parseNumero(texto) {
  // Acepta "1.234,56", "1234.56", "1,5", " 12 € "
  if (typeof texto === "number") return texto;
  if (texto === null || texto === undefined) return NaN;
  let t = String(texto).replace(/[€\s]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  return t === "" ? NaN : Number(t);
}

let temporizador;
export function toast(texto, ms = 2600) {
  const t = document.getElementById("aviso-toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (t.hidden = true), ms);
}

export function abrirModal(...contenido) {
  const m = document.getElementById("modal");
  m.replaceChildren(h("div", { class: "caja", role: "dialog", "aria-modal": "true" }, ...contenido));
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) cerrarModal(); };
  return m;
}
export function cerrarModal() { const m = document.getElementById("modal"); m.hidden = true; m.replaceChildren(); }

export function campo(etiqueta, input) { return h("div", {}, h("label", {}, etiqueta), input); }

export function cargarScript(src) {
  return new Promise((ok, mal) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(); s.onerror = () => mal(new Error("No se pudo cargar " + src));
    document.head.append(s);
  });
}

export function descargar(nombre, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
