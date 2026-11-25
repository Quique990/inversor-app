// Recomendación PERSONAL: se calcula en el navegador con tus datos privados + el informe público del día.
import { esApalancado } from "./finanzas.js";
import { HUECOS, ROL_A_HUECO } from "./perfil.js";

// Clasificación por el nombre para activos fuera del universo (misma regla que pipeline/clasificar.py).
const ORO = /(gold|\boro\b|\bgld\b)/i;
const MONETARIO = /(overnight|money market|monetari|€str|\bestr\b|\bcash\b)/i;
const RENTA_FIJA = /(bond|anleihe|treasur|\bgovt\b|government|aggregate|ibonds|renta fija|\bbonos?\b|\b(dez|dec|déc|dic)\.?\s*20\d\d\b|\bcorp(orate)?\b)/i;
const RENTA_VARIABLE = /(s&p|\bsp ?500\b|msci|ftse|all.?world|\bworld\b|ibex|stoxx|\bdax\b|nasdaq|emerging|\bacwi\b|russell|nikkei|\bcac\b|\bmib\b|equity|aktien|dividend|\betf\b|\bucits\b|\bindex\b)/i;

/** renta_variable_global | renta_fija_euro | monetario | oro | otros (acciones sueltas, temáticos, apalancados). */
export function clasificarNombre(nombre = "") {
  if (esApalancado(nombre)) return "otros";
  if (ORO.test(nombre)) return "oro";
  if (MONETARIO.test(nombre)) return "monetario";
  if (RENTA_FIJA.test(nombre)) return "renta_fija_euro";
  if (RENTA_VARIABLE.test(nombre)) return "renta_variable_global";
  return "otros";
}

export function huecoDe(isin, activos, universoPorIsin) {
  const a = activos[isin] || {};
  if (a.hueco) return a.hueco;
  if (esApalancado(a.nombre)) return "otros";
  const rol = universoPorIsin[isin]?.rol;
  return ROL_A_HUECO[rol] || clasificarNombre(a.nombre || universoPorIsin[isin]?.nombre || "");
}

export function asignacionActual(pos, activos, universoPorIsin) {
  const porHueco = {};
  let total = 0;
  for (const p of Object.values(pos)) {
    const v = p.valor ?? p.costeVivo;
    if (!(v > 0)) continue;
    const hueco = huecoDe(p.isin, activos, universoPorIsin);
    porHueco[hueco] = (porHueco[hueco] || 0) + v;
    total += v;
  }
  const pctPorHueco = Object.fromEntries(Object.entries(porHueco).map(([k, v]) => [k, total ? (v / total) * 100 : 0]));
  return { porHueco, pctPorHueco, total };
}

/** Hueco más infraponderado respecto al objetivo, teniendo en cuenta el importe que se va a añadir. */
export function destinoAportacion(objetivo, actual, importe) {
  const total = actual.total + importe;
  let mejor = null, deficitMax = -Infinity;
  for (const [hueco, pctObj] of Object.entries(objetivo)) {
    const deficit = (pctObj / 100) * total - (actual.porHueco[hueco] || 0);
    if (deficit > deficitMax) { deficitMax = deficit; mejor = hueco; }
  }
  return mejor;
}

export function recomendar({ mercado, perfil, pos, activos, universoPorIsin, saldos }) {
  const acciones = [];
  const plan = perfil.plan || {};
  const objetivo = perfil.asignacion;
  const actual = asignacionActual(pos, activos, universoPorIsin);
  const d = mercado?.decision;
  let extra = null;

  if (!objetivo) {
    acciones.push({ nivel: "azul", texto: "Haz el test de perfil de riesgo (Ajustes) para recibir recomendaciones personalizadas." });
  }

  // 1. Colchón primero
  const liquido = (saldos?.corto || 0) + (saldos?.medio || 0);
  const colchonOk = !(plan.colchonMinimo > 0) || liquido >= plan.colchonMinimo;
  if (!colchonOk) {
    acciones.push({ nivel: "rojo", texto: `Antes de aportar extra, completa tu colchón: tienes ${liquido.toFixed(0)} € en corto + medio plazo y te marcaste ${plan.colchonMinimo} €.` });
  }

  // 2. Aportación extra según la postura del día
  if (d && objetivo) {
    const mult = d.multiplicador_extra || 0;
    if (mult > 0 && colchonOk) {
      let importe = Math.min((plan.aportacionMensual || 0) * mult, plan.maxExtraMes || Infinity);
      if (saldos && typeof saldos.medio === "number" && plan.colchonMinimo > 0) {
        importe = Math.min(importe, Math.max(0, liquido - plan.colchonMinimo));
      }
      importe = Math.round(importe);
      if (importe >= 1) {
        const tramos = d.tramos || 1;
        const porTramo = Math.round(importe / tramos);
        // La oportunidad la crea la caída de la BOLSA: el extra va a renta variable mientras no
        // supere su objetivo en más de 5 puntos; si ya está sobreponderada, al hueco más infraponderado.
        const total = actual.total + importe;
        const rvTrasCompra = total ? (((actual.porHueco.renta_variable_global || 0) + importe) / total) * 100 : 100;
        const destino = objetivo.renta_variable_global && rvTrasCompra <= objetivo.renta_variable_global + 5
          ? "renta_variable_global" : destinoAportacion(objetivo, actual, importe);
        const isinDestino = perfil.huecos?.[destino] || HUECOS[destino]?.etfPorDefecto;
        const nombreDestino = universoPorIsin[isinDestino]?.nombre || activos[isinDestino]?.nombre || isinDestino;
        const minOrden = plan.minOrdenManual || 100;
        const comision = plan.comision ?? 1;
        let metodo;
        if (porTramo >= minOrden) {
          metodo = `Orden manual de ${porTramo} € (comisión ${comision} € = ${((comision / porTramo) * 100).toFixed(1)} %).`;
        } else {
          metodo = `Como ${porTramo} € es poco para una orden manual (${comision} € de comisión = ${((comision / porTramo) * 100).toFixed(1)} %), `
            + `sube tu plan de inversión de este mes de ${plan.aportacionMensual} € a ${(plan.aportacionMensual || 0) + porTramo} € (gratis) y vuelve a bajarlo después.`;
        }
        extra = { importe, tramos, porTramo, destino, isinDestino, nombreDestino, metodo };
        acciones.push({ nivel: "verde", texto: tramos > 1
          ? `Aportación extra sugerida: ${importe} € en ${tramos} partes de ~${porTramo} € (una cada 1-2 semanas) en ${nombreDestino}.`
          : `Aportación extra sugerida: ${importe} € en ${nombreDestino}.`, detalle: metodo });
      }
    } else if (d.postura === "precaucion") {
      acciones.push({ nivel: "rojo", texto: "Entorno de riesgo alto: mantén el plan y evita aportaciones extra grandes." });
    } else {
      acciones.push({ nivel: "azul", texto: `Sigue con tu plan de ${plan.aportacionMensual ?? "—"} €/mes. Hoy no hay una oportunidad clara para aportar más.` });
    }
  }

  // 3. Rebalanceo (sin vender, salvo desviaciones grandes)
  const desviaciones = [];
  if (objetivo && actual.total > 0) {
    for (const [hueco, pctObj] of Object.entries(objetivo)) {
      const real = actual.pctPorHueco[hueco] || 0;
      desviaciones.push({ hueco, objetivo: pctObj, real, diferencia: real - pctObj });
    }
    const otros = actual.pctPorHueco.otros || 0;
    if (otros > 0) desviaciones.push({ hueco: "otros", objetivo: 0, real: otros, diferencia: otros });
    const peor = [...desviaciones].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))[0];
    if (peor && Math.abs(peor.diferencia) >= 5 && actual.total >= 200) {
      const nombre = HUECOS[peor.hueco]?.nombre || "Otros (acciones, temáticos, apalancados)";
      if (peor.diferencia > 15 && peor.hueco !== "otros") {
        acciones.push({ nivel: "ambar", texto: `${nombre} pesa ${peor.real.toFixed(0)} % (objetivo ${peor.objetivo} %). Desviación grande: considera vender una parte para rebalancear. Ojo: la venta tributa si hay ganancias y cuesta 1 € en Trade Republic.` });
      } else if (peor.diferencia < 0) {
        acciones.push({ nivel: "azul", texto: `${nombre} está por debajo de su objetivo (${peor.real.toFixed(0)} % vs ${peor.objetivo} %): dirige ahí las próximas aportaciones.` });
      } else {
        acciones.push({ nivel: "azul", texto: `${nombre} pesa más de lo previsto (${peor.real.toFixed(0)} % vs ${peor.objetivo} %): no hace falta vender, basta con que las próximas aportaciones vayan a los demás huecos.` });
      }
    }
  }

  // 4. Productos inadecuados para largo plazo y concentración
  for (const p of Object.values(pos)) {
    if (!(p.participaciones > 1e-9)) continue;
    const a = activos[p.isin] || {};
    const v = p.valor ?? p.costeVivo;
    if (esApalancado(a.nombre)) {
      const primera = p.lotes.find((l) => l.restantes > 1e-9)?.fecha;
      const dias = primera ? Math.round((Date.now() - new Date(primera).getTime()) / 86400000) : null;
      acciones.push({ nivel: "ambar", texto: `${a.nombre || p.isin} es un producto apalancado con reajuste diario${dias !== null ? ` (lo tienes desde hace ${dias} días)` : ""}. Pierde valor con la volatilidad aunque el subyacente no baje: no es adecuado para el largo plazo.` });
    }
    if (actual.total > 0 && v / actual.total > 0.15 && huecoDe(p.isin, activos, universoPorIsin) === "otros") {
      acciones.push({ nivel: "ambar", texto: `${a.nombre || p.isin} supone el ${((v / actual.total) * 100).toFixed(0)} % de tu cartera. Una sola acción o temática no debería pasar del 10-15 %.` });
    }
  }

  return { acciones, extra, actual, desviaciones };
}

/**
 * Tamaño máximo de cada idea táctica para TU cartera: como mucho `max_idea_pct` % en una idea y `max_total_pct` %
 * en todas, descontando lo que ya tengas en esos productos. Devuelve {total, enIdeas, libre, porIdea:{id:{tienes, maximo}}}.
 */
export function tamanoIdeas(ideas, pos, limites = {}) {
  const lista = ideas || [];
  const valorDe = (isin) => { const p = pos?.[isin]; return p && p.participaciones > 1e-9 ? (p.valor ?? p.costeVivo ?? 0) : 0; };
  const total = Object.values(pos || {}).reduce((s, p) => s + (p.participaciones > 1e-9 ? (p.valor ?? p.costeVivo ?? 0) : 0), 0);
  const isins = new Set(lista.map((i) => i.isin).filter(Boolean));
  const enIdeas = [...isins].reduce((s, isin) => s + valorDe(isin), 0);
  const libre = Math.max(0, ((limites.max_total_pct ?? 10) / 100) * total - enIdeas);
  const porIdea = {};
  for (const i of lista) {
    const tienes = valorDe(i.isin);
    const maximo = Math.max(0, Math.min(((limites.max_idea_pct ?? 5) / 100) * total - tienes, libre));
    porIdea[i.id] = { tienes, maximo: Math.floor(maximo) };
  }
  return { total, enIdeas, libre, porIdea };
}
