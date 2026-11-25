// Cuestionario de perfil de riesgo (inspirado en los test de idoneidad MiFID II) y carteras modelo.
// Ver docs/03-perfil-de-riesgo.md para la justificación.

export const PREGUNTAS = [
  { id: "horizonte", texto: "¿Cuándo crees que necesitarás este dinero invertido?", opciones: [
    ["Antes de 2 años", 0], ["Entre 2 y 5 años", 2], ["Entre 5 y 10 años", 4], ["En más de 10 años", 6]] },
  { id: "caida", texto: "Tu cartera cae un 25 % en pocos meses (como en 2020 o 2022). ¿Qué harías?", opciones: [
    ["Vendería todo para no perder más", 0], ["Vendería una parte", 1], ["No haría nada", 3], ["Aprovecharía para comprar más", 5]] },
  { id: "objetivo", texto: "¿Qué buscas principalmente?", opciones: [
    ["No perder dinero aunque gane poco", 0], ["Ganarle a la inflación con poco riesgo", 2],
    ["Crecimiento equilibrado", 3], ["Máximo crecimiento a largo plazo, aceptando altibajos fuertes", 5]] },
  { id: "perdida_max", texto: "¿Qué pérdida temporal máxima en un año podrías soportar sin agobiarte?", opciones: [
    ["Ninguna o casi ninguna (≤ 5 %)", 0], ["Hasta un 10 %", 1], ["Hasta un 20 %", 3], ["Hasta un 35 % o más", 5]] },
  { id: "colchon", texto: "¿Tienes un fondo de emergencia aparte (3-6 meses de gastos o lo que tú consideres suficiente)?", opciones: [
    ["No", 0], ["Algo, pero insuficiente", 1], ["Sí", 3]] },
  { id: "ingresos", texto: "¿Cómo de estables son tus ingresos?", opciones: [
    ["Inestables o inexistentes", 0], ["Algo variables", 1], ["Estables", 2]] },
  { id: "experiencia", texto: "¿Qué experiencia tienes invirtiendo?", opciones: [
    ["Ninguna", 0], ["He invertido algo en fondos o ETF", 1], ["Llevo años invirtiendo y he vivido caídas fuertes", 2]] },
  { id: "dependencia", texto: "Si perdieras la mitad de lo invertido, ¿cambiaría tu vida diaria?", opciones: [
    ["Sí, mucho", 0], ["Algo", 1], ["No", 3]] },
];

export const PERFILES = [
  { id: "conservador", nombre: "Conservador", min: 0,
    asignacion: { renta_variable_global: 20, renta_fija_euro: 50, monetario: 20, oro: 10 },
    descripcion: "Prioriza no sufrir caídas grandes. Caída máxima histórica orientativa de un 10-15 %." },
  { id: "moderado", nombre: "Moderado", min: 10,
    asignacion: { renta_variable_global: 40, renta_fija_euro: 40, monetario: 10, oro: 10 },
    descripcion: "Algo de crecimiento con red de seguridad. Caídas orientativas del 15-25 %." },
  { id: "equilibrado", nombre: "Equilibrado", min: 17,
    asignacion: { renta_variable_global: 60, renta_fija_euro: 30, oro: 10 },
    descripcion: "Clásico 60/40 con oro como diversificador. Caídas orientativas del 25-30 %." },
  { id: "dinamico", nombre: "Dinámico", min: 23,
    asignacion: { renta_variable_global: 80, renta_fija_euro: 10, oro: 10 },
    descripcion: "Crecimiento a largo plazo. Caídas orientativas del 35-45 %." },
  { id: "agresivo", nombre: "Agresivo", min: 28,
    asignacion: { renta_variable_global: 95, oro: 5 },
    descripcion: "Casi todo renta variable mundial. Caídas del 50 % posibles (2008). Solo con horizonte > 10 años." },
];

export const HUECOS = {
  renta_variable_global: { nombre: "Renta variable mundial", etfPorDefecto: "IE00BK5BQT80" },
  renta_fija_euro: { nombre: "Renta fija (bonos)", etfPorDefecto: "IE00B4WXJJ64" },
  monetario: { nombre: "Monetario (liquidez remunerada)", etfPorDefecto: "LU0290358497" },
  oro: { nombre: "Oro", etfPorDefecto: "IE00B579F325" },
};

// Asignación de cada rol del universo a un hueco de la cartera modelo
export const ROL_A_HUECO = {
  renta_variable_global: "renta_variable_global", renta_variable_desarrollados: "renta_variable_global",
  renta_variable_emergentes: "renta_variable_global", renta_variable_eeuu: "renta_variable_global",
  renta_fija_euro: "renta_fija_euro", renta_fija_global: "renta_fija_euro", monetario: "monetario", oro: "oro",
};

export function calcularPerfil(respuestas) {
  const total = PREGUNTAS.reduce((s, p) => s + (respuestas[p.id] ?? 0), 0);
  let perfil = PERFILES[0];
  for (const p of PERFILES) if (total >= p.min) perfil = p;
  // Límites de sentido común: horizonte corto o sin colchón -> nunca más que "moderado"
  const limites = [];
  if ((respuestas.horizonte ?? 0) <= 2) limites.push("Horizonte inferior a 5 años");
  if ((respuestas.colchon ?? 0) === 0) limites.push("Sin fondo de emergencia");
  if (limites.length && PERFILES.indexOf(perfil) > 1) perfil = PERFILES[1];
  if ((respuestas.caida ?? 0) === 0 && PERFILES.indexOf(perfil) > 1) { perfil = PERFILES[1]; limites.push("Venderías en una caída fuerte"); }
  return { puntos: total, perfil: perfil.id, nombre: perfil.nombre, asignacion: { ...perfil.asignacion }, limites, descripcion: perfil.descripcion };
}
