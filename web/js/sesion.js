// Pantalla de inicio de sesión. Con el repositorio privado conectado, la app no enseña nada hasta poner la contraseña.
// La contraseña se comprueba con el verificador de data/acceso.json (repositorio privado) y además descifra la clave
// de GitHub guardada en este dispositivo. Si aún no hay contraseña (antes había PIN), se crea aquí.
import { comprobar, crearVerificador, LONGITUD_MINIMA, validarContrasena } from "./acceso.js";
import { campo, h } from "./dom.js";
import * as store from "./store.js";

const vista = () => document.getElementById("vista");
const campoClave = (placeholder, autocomplete = "current-password") => h("input", { type: "password", placeholder, autocomplete });

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

    const pedir = (mensaje = "") => {
      const clave = campoClave(cfg.tokenCifrado ? "Contraseña" : "Contraseña");
      const error = h("p", { class: "neg pequeno" }, mensaje);
      const boton = h("button", {}, "Entrar");
      const entrar = async () => {
        boton.disabled = true; error.textContent = "Comprobando…";
        try { await probar(clave.value, error); } finally { boton.disabled = false; }
      };
      boton.addEventListener("click", entrar);
      clave.addEventListener("keydown", (e) => e.key === "Enter" && entrar());
      pantalla("Iniciar sesión",
        h("p", { class: "suave" }, `Tus datos están en ${cfg.owner}/${cfg.repo}.`),
        campo("Contraseña", clave), error, h("div", { class: "fila" }, boton),
        h("details", { class: "pequeno" }, h("summary", {}, "¿No te acuerdas?"),
          h("p", {}, "Si antes usabas un PIN y todavía no has creado la contraseña, escribe el PIN: después te pedirá crearla."),
          h("p", {}, "Si la has olvidado: en GitHub, abre tu repositorio privado y borra el fichero data/acceso.json. Después pulsa el botón de abajo, vuelve a conectar este dispositivo (Ajustes → Conectar GitHub) con tu clave de GitHub y crea una contraseña nueva. Tus datos no se tocan."),
          h("button", { class: "sec", onclick: () => { if (confirm("Se borrará la conexión de ESTE dispositivo (no tus datos).")) { store.olvidarTodo(); location.reload(); } } },
            "Volver a conectar este dispositivo")));
      setTimeout(() => clave.focus(), 50);
    };

    const probar = async (contrasena, error) => {
      try { await store.desbloquear(contrasena); }
      catch {
        const c = store.leerConfig();
        error.textContent = c.tokenCifrado || c.tokenPlano ? "Contraseña incorrecta."
          : "Este dispositivo no tiene guardada la conexión: abre “¿No te acuerdas?” y pulsa “Volver a conectar este dispositivo”.";
        return;
      }
      let verificador;
      try { verificador = await store.leer("acceso", { forzar: true }); }
      catch {
        // Sin conexión: si la contraseña ha descifrado la clave de este dispositivo, es la buena
        if (store.leerConfig().tokenCifrado) { sessionStorage.setItem("inversor.sesion", "1"); terminar(); }
        else error.textContent = "Sin conexión con GitHub: no se puede comprobar la contraseña.";
        return;
      }
      if (!verificador) return crear(); // primera vez: aún no hay contraseña en el repositorio
      if (await comprobar(contrasena, verificador)) { await store.abrirSesion(contrasena); terminar(); return; }
      if (store.leerConfig().tokenCifrado) return actual(verificador); // el PIN antiguo o una contraseña ya cambiada
      store.cerrarSesion();
      error.textContent = "Contraseña incorrecta.";
    };

    // Este dispositivo tenía el PIN o una contraseña antigua: se pide la actual y se vuelve a cifrar la clave con ella
    const actual = (verificador) => {
      const clave = campoClave("Contraseña actual");
      const error = h("p", { class: "neg pequeno" });
      const seguir = async () => {
        if (await comprobar(clave.value, verificador)) { await store.abrirSesion(clave.value); terminar(); }
        else error.textContent = "No coincide con la contraseña guardada en tu repositorio.";
      };
      clave.addEventListener("keydown", (e) => e.key === "Enter" && seguir());
      pantalla("Escribe tu contraseña",
        h("p", { class: "suave" }, "Lo que has escrito abre este dispositivo, pero no es la contraseña actual de la app (era tu PIN antiguo o la cambiaste en otro dispositivo). Escribe la contraseña actual."),
        campo("Contraseña actual", clave), error, h("div", { class: "fila" }, h("button", { onclick: seguir }, "Entrar")));
      setTimeout(() => clave.focus(), 50);
    };

    const crear = () => {
      const c1 = campoClave(`Mínimo ${LONGITUD_MINIMA} caracteres`, "new-password");
      const c2 = campoClave("Repite la contraseña", "new-password");
      const error = h("p", { class: "neg pequeno" });
      const guardar = async () => {
        const fallo = validarContrasena(c1.value, c2.value);
        if (fallo) { error.textContent = fallo; return; }
        error.textContent = "Guardando…";
        try {
          await store.guardar("acceso", await crearVerificador(c1.value), "Contraseña de acceso a la app (solo su huella, no la contraseña)");
          await store.abrirSesion(c1.value);
          terminar();
        } catch (e) { error.textContent = "No se pudo guardar en GitHub: " + e.message; }
      };
      pantalla("Crea tu contraseña",
        h("p", { class: "suave" }, "A partir de ahora la app te la pedirá cada vez que la abras, en todos tus dispositivos. Sustituye al PIN."),
        h("p", { class: "suave pequeno" }, "En tu repositorio privado solo se guarda una huella cifrada (no se puede sacar la contraseña de ella)."),
        campo("Contraseña nueva", c1), campo("Repítela", c2), error, h("div", { class: "fila" }, h("button", { onclick: guardar }, "Guardar y entrar")));
      setTimeout(() => c1.focus(), 50);
    };

    pedir();
  });
}

/** Cambiar la contraseña (desde Ajustes, con la sesión abierta). Devuelve un mensaje de error o null. */
export async function cambiarContrasena(actualTexto, nueva, repetida) {
  const fallo = validarContrasena(nueva, repetida);
  if (fallo) return fallo;
  const v = await store.leer("acceso", { forzar: true });
  if (v && !(await comprobar(actualTexto, v))) return "La contraseña actual no es correcta.";
  await store.guardar("acceso", await crearVerificador(nueva), "Cambiar la contraseña de acceso a la app (solo su huella)");
  await store.abrirSesion(nueva);
  return null;
}
