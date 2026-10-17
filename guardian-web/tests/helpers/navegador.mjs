/* =========================================================
   Pruebas · Navegador falso mínimo
   Algunos módulos de Guardián escuchan eventos del navegador al cargarse.
   En Node no existen, así que se crean versiones vacías antes de importarlos.
   ========================================================= */
export function navegadorFalso() {
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 0);
}

/** Reemplaza fetch por una función de prueba y devuelve cómo restaurarlo. */
export function fetchFalso(responder) {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, init = {}) => {
    llamadas.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return { llamadas, restaurar: () => { globalThis.fetch = original; } };
}

/** Respuesta JSON como la que devolvería un servidor. */
export const respuesta = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Cambia variables de entorno durante una prueba y las deja como estaban. */
export function conEntorno(vars, fn) {
  const antes = {};
  for (const [k, v] of Object.entries(vars)) {
    antes[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const restaurar = () => {
    for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };
  return Promise.resolve().then(fn).finally(restaurar);
}
