// Envoltorio fino sobre Chart.js (vendor/chart.umd.min.js, sin CDN).
import { h } from "./dom.js";

const activas = new Set();
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const COLORES = () => [css("--primario"), css("--verde"), css("--ambar"), css("--morado"), css("--rojo"), "#2a9d8f", "#8d99ae"];

export function destruirTodas() { for (const g of activas) g.destroy(); activas.clear(); }

/** Destruye las gráficas que haya dentro de un nodo (al redibujar solo una parte de la vista). */
export function destruirEn(nodo) {
  for (const g of [...activas]) if (nodo.contains(g.canvas)) { g.destroy(); activas.delete(g); }
}

function base() {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: css("--texto"), boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: css("--suave"), maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
      y: { ticks: { color: css("--suave") }, grid: { color: css("--borde") } },
    },
  };
}

/**
 * Gráfica de líneas. Con `zoom` se puede ampliar con dos dedos (o la rueda del ratón) y moverse arrastrando, solo en
 * horizontal; el eje vertical se ajusta a lo que se ve. `zoom.atajos` = [{texto, desde, hasta}] (índices de etiqueta)
 * añade botones de acceso rápido, además de "Ver todo".
 */
export function lineas(etiquetas, series, { baja = false, formatoY = null, puntos = null, zoom = null } = {}) {
  const lienzo = h("canvas");
  const caja = h("div", { class: baja ? "grafica baja" : "grafica" }, lienzo);
  if (!window.Chart) { caja.append(h("p", { class: "suave" }, "Gráfica no disponible (Chart.js no cargó).")); return caja; }
  const colores = COLORES();
  const datasets = series.map((s, i) => ({
    label: s.nombre, data: s.valores, borderColor: s.color || colores[i % colores.length], backgroundColor: s.relleno || "transparent",
    fill: s.fill ?? !!s.relleno, borderWidth: s.ancho ?? 2, pointRadius: s.radio ?? 0, pointBackgroundColor: s.color, tension: 0, stepped: !!s.escalonada, borderDash: s.discontinua ? [5, 4] : undefined, spanGaps: s.huecos === undefined ? true : !s.huecos,
  }));
  if (puntos) datasets.push({ type: "scatter", label: puntos.nombre, data: puntos.datos, pointRadius: 4, pointBackgroundColor: puntos.color || colores[2], showLine: false });
  const opciones = base();
  if (series.some((s) => s.sinLeyenda)) opciones.plugins.legend.labels.filter = (item) => !series[item.datasetIndex]?.sinLeyenda;
  if (formatoY) opciones.scales.y.ticks.callback = formatoY;
  let grafica = null, envoltorio = null;
  const conZoom = !!(zoom && window.ChartZoom); // vendor/chartjs-plugin-zoom.min.js (+ hammer.min.js para los dedos)
  if (conZoom) {
    opciones.plugins.zoom = {
      zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
      pan: { enabled: true, mode: "x" },
      limits: { x: { minRange: 2 } },
    };
    // Sin esto, el eje vertical mantiene la escala de todo el día al ampliar
    opciones.scales.y.afterDataLimits = (escala) => ajustarY(escala, etiquetas);
    const ver = (desde, hasta) => grafica?.zoomScale("x", { min: Math.max(0, desde), max: Math.min(etiquetas.length - 1, hasta) });
    envoltorio = h("div", {}, caja);
    envoltorio.append(h("div", { class: "fila zoom-botones", style: { marginTop: "6px" } },
      ...(zoom.atajos || []).map((a) => h("button", { class: "mini sec", onclick: () => ver(a.desde, a.hasta) }, a.texto)),
      h("button", { class: "mini sec", onclick: () => grafica?.resetZoom() }, "Ver todo")),
      h("p", { class: "suave pequeno" }, "Pellizca con dos dedos para ampliar y arrastra para moverte."));
  }
  requestAnimationFrame(() => {
    grafica = new window.Chart(lienzo, { type: "line", data: { labels: etiquetas, datasets }, options: opciones });
    activas.add(grafica);
    // Hammer bloquea todo gesto sobre la gráfica; así el desplazamiento vertical de la página sigue funcionando
    // (el pellizco y el arrastre horizontal siguen llegando al zoom)
    if (conZoom) lienzo.style.touchAction = "pan-y";
    if (conZoom && zoom.inicial) grafica.zoomScale("x", { min: Math.max(0, zoom.inicial.desde), max: Math.min(etiquetas.length - 1, zoom.inicial.hasta) });
  });
  return envoltorio || caja;
}

/** Ajusta el eje vertical a los valores que se ven con el zoom horizontal actual. */
function ajustarY(escala, etiquetas) {
  // El complemento de zoom guarda el rango visible en las opciones del eje x (índices de etiqueta)
  const ox = escala.chart.scales.x?.options || {};
  const desde = typeof ox.min === "number" ? ox.min : 0, hasta = typeof ox.max === "number" ? ox.max : etiquetas.length - 1;
  if (desde <= 0 && hasta >= etiquetas.length - 1) return;
  let min = Infinity, max = -Infinity;
  for (const ds of escala.chart.data.datasets) {
    for (let i = Math.max(0, Math.floor(desde)); i <= Math.min(etiquetas.length - 1, Math.ceil(hasta)); i++) {
      const v = ds.data[i];
      if (typeof v === "number") { min = Math.min(min, v); max = Math.max(max, v); }
    }
  }
  if (min === Infinity) return;
  const margen = (max - min) * 0.08 || Math.abs(max) * 0.001 || 1;
  escala.min = min - margen;
  escala.max = max + margen;
}

export function donut(etiquetas, valores) {
  const lienzo = h("canvas");
  const caja = h("div", { class: "grafica baja" }, lienzo);
  if (!window.Chart) return caja;
  requestAnimationFrame(() => activas.add(new window.Chart(lienzo, {
    type: "doughnut", data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: COLORES(), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, cutout: "62%",
      plugins: { legend: { position: "right", labels: { color: css("--texto"), boxWidth: 12 } } } },
  })));
  return caja;
}
