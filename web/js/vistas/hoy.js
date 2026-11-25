import { h, tarjeta, eur, fecha, momento, pct } from "../dom.js";
import { avisoCorto } from "../diners.js";
import { modalOperacion } from "./cartera.js";
import { modalTransferencia } from "./diners.js";

export const NOMBRE_POSTURA = {
  mantener_plan: "Sigue con tu plan", comprar_extra: "Oportunidad: aporta extra", comprar_extra_escalonado: "Aporta extra, escalonado",
  escalonar: "Aporta solo escalonado", precaucion: "Precaución",
};
export const NOMBRE_REGIMEN = { expansion: "Expansión", recesion_probable: "Recesión probable", inflacion_alta: "Inflación alta" };
const IMPACTO = { 2: "▲▲", 1: "▲", 0: "＝", "-1": "▼", "-2": "▼▼" };
const NOMBRE_ACTIVO = { renta_variable: "Bolsa", renta_fija_calidad: "Bonos", oro: "Oro", dolar: "Dólar", petroleo: "Petróleo" };

export function render({ S, calc, guardar, refrescar }) {
  const m = S.publico.mercado;
  const nodos = [];
  if (m?.demo) nodos.push(h("div", { class: "banner-demo" }, "Datos de demostración: el análisis real aparecerá tras la primera ejecución diaria en GitHub."));
  if (!m) {
    nodos.push(tarjeta("Aún no hay análisis", h("p", {}, "El análisis diario se genera cada mañana en GitHub Actions. Si acabas de crear el repositorio, lanza el workflow “Análisis diario” a mano desde la pestaña Actions.")));
    return nodos;
  }
  const d = m.decision;

  // Postura del día
  nodos.push(h("section", { class: `tarjeta postura ${d.postura}` },
    h("div", { class: "fila entre" }, h("span", { class: "suave" }, `Último análisis de noticias y mercado: ${momento(m.generado)}`), h("span", { class: "chip" }, `Confianza ${d.confianza}`)),
    m.generado && Date.now() - new Date(m.generado).getTime() > 30 * 3600000
      ? h("div", { class: "aviso" }, "El análisis tiene más de un día: el de hoy aún no se ha ejecutado (se lanza a las 7:43 en invierno, 8:43 en verano; GitHub a veces lo retrasa). Puedes lanzarlo a mano en GitHub → Actions → Análisis diario → Run workflow.") : null,
    h("div", { class: "titular" }, NOMBRE_POSTURA[d.postura] || d.postura),
    h("p", {}, d.texto_postura),
    h("div", { class: "medidor", title: "Puntuación de oportunidad 0-100" }, h("div", { class: "aguja", style: { left: `calc(${Math.min(100, d.puntuacion)}% - 2px)` } })),
    h("div", { class: "fila entre suave pequeno" }, h("span", {}, "Sin oportunidad"), h("strong", {}, `${d.puntuacion}/100`), h("span", {}, "Gran oportunidad")),
    h("p", { class: "pequeno" }, h("span", { class: "chip" }, `Régimen: ${NOMBRE_REGIMEN[d.regimen.principal]}`),
      d.tendencia_bajista ? h("span", { class: "chip i2" }, "Tendencia bajista") : null),
    ...d.avisos.map((a) => h("div", { class: "aviso" }, a)),
    ...(d.regimen.motivos || []).map((a) => h("div", { class: "aviso azul" }, a)),
  ));

  // Recomendación personal
  const acciones = [...calc.reco.acciones];
  const a300 = avisoCorto(S.privado.contabilidad, S.privado.cartera);
  const tuya = tarjeta("Para ti",
    ...acciones.map((a) => h("div", { class: `aviso ${a.nivel}` }, a.texto, a.detalle ? h("div", { class: "pequeno" }, a.detalle) : null)));
  if (calc.reco.extra) {
    tuya.append(h("div", { class: "fila" },
      h("button", { onclick: () => modalOperacion({ S, guardar, refrescar, calc }, { origen: "extra", isin: calc.reco.extra.isinDestino, importe: calc.reco.extra.porTramo }) },
        "Registrar la compra extra")));
  }
  if (a300) {
    tuya.append(h("div", { class: "aviso" }, `Tu corto plazo está en ${eur(a300.saldo)} (≥ ${eur(a300.umbral)}): toca pasar ${eur(a300.traspaso)} a medio plazo.`,
      h("div", {}, h("button", { class: "mini", onclick: () => modalTransferencia({ S, guardar, refrescar }, { cantidad: a300.traspaso, de: "corto", a: "medio", concepto: "Regla de los 300 €" }) }, "Registrar traspaso"))));
  }
  nodos.push(tuya);

  // Resumen del día
  nodos.push(tarjeta("Resumen del día",
    h("p", {}, m.resumen),
    m.riesgos_a_vigilar?.length ? h("div", {}, h("h3", {}, "Riesgos a vigilar"), h("ul", {}, m.riesgos_a_vigilar.map((r) => h("li", {}, r)))) : null,
    h("p", { class: "suave pequeno" }, `Fuente del resumen: ${m.ia === "github_models" ? "IA (GitHub Models)" : m.ia === "gemini" ? "IA (Gemini)" : "plantilla automática"} · ${m.num_titulares} titulares analizados · ${momento(m.generado)}`)));

  // Eventos
  if (m.eventos?.length) {
    nodos.push(tarjeta("Qué está moviendo el mundo",
      ...m.eventos.map((e) => h("details", {},
        h("summary", {}, h("span", { class: `chip i${e.intensidad}` }, `${e.intensidad}/3`), " ", e.nombre),
        e.explicacion_ia ? h("p", {}, e.explicacion_ia) : null,
        h("p", { class: "pequeno" }, "Impacto típico a corto plazo: ",
          Object.entries(e.impacto_tipico || {}).map(([k, v]) => h("span", { class: "chip" }, `${NOMBRE_ACTIVO[k] || k} ${IMPACTO[v] ?? v}`))),
        e.historia?.nota ? h("p", { class: "pequeno" }, e.historia.nota) : null,
        e.historia?.caida_media_sp500_pct ? h("p", { class: "pequeno" },
          `Históricamente: caída media del S&P 500 ${pct(e.historia.caida_media_sp500_pct)}, suelo en ~${e.historia.dias_hasta_suelo} días, recuperación en ~${e.historia.dias_recuperacion} días.`) : null,
        (e.matices || []).length ? h("ul", { class: "pequeno" }, e.matices.map((x) => h("li", {}, x))) : null,
        h("ul", { class: "lista-titulares" }, (e.ejemplos || []).map((t) => h("li", {}, h("a", { href: t.url, target: "_blank", rel: "noopener noreferrer" }, t.titulo), h("span", { class: "suave" }, ` · ${t.fuente}`)))),
      ))));
  }

  // Factores
  nodos.push(tarjeta("Cómo se ha calculado",
    h("table", {}, h("tr", {}, h("th", {}, "Factor"), h("th", { class: "num" }, "Valor"), h("th", { class: "num" }, "Puntos")),
      d.factores.map((f) => h("tr", {}, h("td", {}, f.factor), h("td", { class: String(f.valor).length < 14 ? "num" : "pequeno" }, f.valor), h("td", { class: "num" }, f.puntos)))),
    h("p", { class: "suave pequeno" }, "La puntuación sube cuando la bolsa ha caído y hay miedo. La noticia por sí sola no crea la oportunidad: la crea el precio. El régimen económico decide si hay que escalonar."),
    h("p", { class: "suave pequeno" }, m.aviso_legal)));

  return nodos;
}
