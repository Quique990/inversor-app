// Envoltorio fino sobre Chart.js (vendor/chart.umd.min.js, sin CDN).
import { h } from "./dom.js";

const activas = new Set();
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const COLORES = () => [css("--primario"), css("--verde"), css("--ambar"), css("--morado"), css("--rojo"), "#2a9d8f", "#8d99ae"];

export function destruirTodas() { for (const g of activas) g.destroy(); activas.clear(); }

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

export function lineas(etiquetas, series, { baja = false, formatoY = null, puntos = null } = {}) {
  const lienzo = h("canvas");
  const caja = h("div", { class: baja ? "grafica baja" : "grafica" }, lienzo);
  if (!window.Chart) { caja.append(h("p", { class: "suave" }, "Gráfica no disponible (Chart.js no cargó).")); return caja; }
  const colores = COLORES();
  const datasets = series.map((s, i) => ({
    label: s.nombre, data: s.valores, borderColor: s.color || colores[i % colores.length], backgroundColor: s.relleno || "transparent",
    fill: !!s.relleno, borderWidth: 2, pointRadius: 0, tension: 0, stepped: !!s.escalonada, borderDash: s.discontinua ? [5, 4] : undefined, spanGaps: true,
  }));
  if (puntos) datasets.push({ type: "scatter", label: puntos.nombre, data: puntos.datos, pointRadius: 4, pointBackgroundColor: puntos.color || colores[2], showLine: false });
  const opciones = base();
  if (formatoY) opciones.scales.y.ticks.callback = formatoY;
  requestAnimationFrame(() => activas.add(new window.Chart(lienzo, { type: "line", data: { labels: etiquetas, datasets }, options: opciones })));
  return caja;
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
