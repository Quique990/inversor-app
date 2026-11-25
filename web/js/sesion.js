// Pantalla de entrada con PIN de 4 cifras. Con el repositorio privado conectado, la app no enseña nada sin el PIN.
// El PIN se comprueba con el verificador de data/acceso.json (repositorio privado) y además descifra la clave de
// GitHub guardada en este dispositivo. Si aún no hay PIN en el repositorio (o lo que hay es una contraseña de la
// versión anterior), se crea aquí.
import { CIFRAS_PIN, comprobar, crearVerificador, esPin, validarPin } from "./acceso.js";
import { campo, h } from "./dom.js";
import * as store from "./store.js";

const vista = () => document.getElementById("vista");

/** Casilla de PIN: teclado numérico, solo cifras y, si se pasa `alCompletar`, entra sola al escribir la última. */
export function campoPin(alCompletar = null, nuevo = false) {
  const i = h("input", { type: "password", inputmode: "numeric", pattern: "[0-9]*", maxlength: String(CIFRAS_PIN),
    autocomplete: nuevo ? "new-password" : "current-password", placeholder: "• • • •", class: "pin" });
  i.addEventListener("input", () => {
    i.value = i.value.replace(/\D/g, "").slice(0, CIFRAS_PIN);
    if (alCompletar && i.value.length === CIFRAS_PIN) alCompletar();
  });
  return i;
}

function pantalla(titulo, ...contenido) {
  document.body.classList.add("sin-sesion");
  document.getElementById("titulo-vista").textContent = "Inversor";
  vista().replaceChildren(h("section", { class: "tarjeta acceso" }, h("h2", {}, titulo), ...contenido));
}

/** Resuelve cuando la sesión está abierta. Solo se usa con el repositorio privado conectado. */
export function iniciarSesion() {
  return new Promise((listo) => {
    const terminar = () => { document.body.classList.remove("sin-sesion"); listo(); };
    const cfg = store.leerConfig();

    const pedir = () => {
      const error = h("p", { class: "neg pequeno" });
      let ocupado = false;
      const entrar = async () => {
        if (ocupado) return;
        ocupado = true; error.textContent = "Comprobando…";
        try { await probar(pin.value, error); } finally { ocupado = false; if (error.textContent.startsWith("Comprobando")) error.textContent = ""; }
        if (error.textContent) { pin.value = ""; pin.focus(); }
      };
      const pin = h("input", { type: "password", autocomplete: "current-password", placeholder: "PIN" });
      // Casilla para el PIN (o, solo esta vez, para la contraseña de la versión anterior): Enter o botón
      pin.addEventListener("keydown", (e) => e.key === "Enter" && entrar());
      // Entra sola al escribir la 4.ª cifra, salvo la primera vez (podría ser la contraseña antigua que empieza por cifras)
      if (cfg.pinActivo) {
        Object.assign(pin, { inputMode: "numeric", placeholder: "• • • •" });
        pin.classList.add("pin");
        pin.addEventListener("input", () => { if (/^\d{4}$/.test(pin.value)) entrar(); });
      }
      pantalla("Introduce tu PIN",
        h("p", { class: "suave" }, `Tus datos están en ${cfg.owner}/${cfg.repo}.`),
        campo("PIN (4 cifras)", pin), error, h("div", { class: "fila" }, h("button", { onclick: entrar }, "Entrar")),
        h("details", { class: "pequeno" }, h("summary", {}, "¿No te acuerdas?"),
          h("p", {}, "Si todavía no has creado el PIN y tenías contraseña, escribe la contraseña aquí (y pulsa Entrar): después te pedirá crear el PIN."),
          h("p", {}, "Si lo has olvidado: en GitHub, abre tu repositorio privado y borra el fichero data/acceso.json. Después pulsa el botón de abajo, vuelve a conectar este dispositivo (Ajustes → Conectar GitHub) con tu clave de GitHub y crea un PIN nuevo. Tus datos no se tocan."),
          h("button", { class: "sec", onclick: () => { if (confirm("Se borrará la conexión de ESTE dispositivo (no tus datos).")) { store.olvidarTodo(); location.reload(); } } },
            "Volver a conectar este dispositivo")));
      setTimeout(() => pin.focus(), 50);
    };

    const probar = async (secreto, error) => {
      try { await store.desbloquear(secreto); }
      catch {
        const c = store.leerConfig();
        error.textContent = c.tokenCifrado || c.tokenPlano ? "PIN incorrecto."
          : "Este dispositivo no tiene guardada la conexión: abre “¿No te acuerdas?” y pulsa “Volver a conectar este dispositivo”.";
        return;
      }
      let verificador;
      try { verificador = await store.leer("acceso", { forzar: true }); }
      catch {
        // Sin conexión: si el PIN ha descifrado la clave de este dispositivo, es el bueno
        if (store.leerConfig().tokenCifrado) { sessionStorage.setItem("inversor.sesion", "1"); terminar(); }
        else error.textContent = "Sin conexión con GitHub: no se puede comprobar el PIN.";
        return;
      }
      if (!verificador) return crear("Crea tu PIN");
      if (await comprobar(secreto, verificador)) {
        if (!esPin(verificador)) return crear("Ahora crea tu PIN", "Era la contraseña de la versión anterior. A partir de ahora entrarás con un PIN de 4 cifras.");
        await store.abrirSesion(secreto); terminar(); return;
      }
      if (store.leerConfig().tokenCifrado) return actual(verificador); // el dispositivo tenía otro PIN/contraseña
      store.cerrarSesion();
      error.textContent = "PIN incorrecto.";
    };

    // Este dispositivo tenía un PIN antiguo o la contraseña: se pide el actual y se vuelve a cifrar la clave con él
    const actual = (verificador) => {
      const error = h("p", { class: "neg pequeno" });
      const seguir = async () => {
        if (!(await comprobar(pin.value, verificador))) { error.textContent = "No coincide con el guardado en tu repositorio."; pin.value = ""; return; }
        if (!esPin(verificador)) return crear("Ahora crea tu PIN", "Era la contraseña de la versión anterior. A partir de ahora entrarás con un PIN de 4 cifras.");
        await store.abrirSesion(pin.value); terminar();
      };
      const pin = h("input", { type: "password", autocomplete: "current-password", placeholder: "PIN o contraseña actual" });
      pin.addEventListener("keydown", (e) => e.key === "Enter" && seguir());
      pantalla("Escribe tu PIN actual",
        h("p", { class: "suave" }, "Lo que has escrito abre este dispositivo, pero no es el PIN actual (lo cambiaste en otro dispositivo, o aún tenías la contraseña). Escribe el actual: el PIN o, si todavía no lo has creado, la contraseña."),
        campo("PIN o contraseña actual", pin), error, h("div", { class: "fila" }, h("button", { onclick: seguir }, "Entrar")));
      setTimeout(() => pin.focus(), 50);
    };

    const crear = (titulo, explicacion = "A partir de ahora la app te lo pedirá cada vez que la abras, en todos tus dispositivos.") => {
      const p1 = campoPin(null, true), p2 = campoPin(null, true);
      const error = h("p", { class: "neg pequeno" });
      const guardar = async () => {
        const fallo = validarPin(p1.value, p2.value);
        if (fallo) { error.textContent = fallo; return; }
        error.textContent = "Guardando…";
        try {
          await store.guardar("acceso", await crearVerificador(p1.value), "PIN de acceso a la app (solo su huella, no el PIN)");
          await store.abrirSesion(p1.value);
          terminar();
        } catch (e) { error.textContent = "No se pudo guardar en GitHub: " + e.message; }
      };
      p1.addEventListener("input", () => { if (p1.value.length === CIFRAS_PIN) p2.focus(); });
      p2.addEventListener("input", () => { if (p2.value.length === CIFRAS_PIN) guardar(); });
      pantalla(titulo, h("p", { class: "suave" }, explicacion),
        h("p", { class: "suave pequeno" }, "En tu repositorio privado solo se guarda una huella cifrada, nunca el PIN."),
        campo("PIN nuevo (4 cifras)", p1), campo("Repítelo", p2), error, h("div", { class: "fila" }, h("button", { onclick: guardar }, "Guardar y entrar")));
      setTimeout(() => p1.focus(), 50);
    };

    pedir();
  });
}

/** Cambiar el PIN (desde Ajustes, con la sesión abierta). Devuelve un mensaje de error o null. */
export async function cambiarPin(actualTexto, nuevo, repetido) {
  const fallo = validarPin(nuevo, repetido);
  if (fallo) return fallo;
  const v = await store.leer("acceso", { forzar: true });
  if (v && !(await comprobar(actualTexto, v))) return "El PIN actual no es correcto.";
  await store.guardar("acceso", await crearVerificador(nuevo), "Cambiar el PIN de acceso a la app (solo su huella)");
  await store.abrirSesion(nuevo);
  return null;
}
