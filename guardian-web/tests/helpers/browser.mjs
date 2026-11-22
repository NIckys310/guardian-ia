/* =========================================================
   Pruebas · Navegador falso mínimo
   Algunos módulos de Guardián escuchan eventos del navegador al cargarse.
   En Node no existen, así que se crean versiones vacías antes de importarlos.
   ========================================================= */
export function fakeBrowser() {
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(Date.now()), 0);
}

/** Reemplaza fetch por una función de prueba y devuelve cómo restaurarlo. */
export function fakeFetch(respond) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return { llamadas: calls, restaurar: () => { globalThis.fetch = original; } };
}

/** Respuesta JSON como la que devolvería un servidor. */
export const reply = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Cambia variables de entorno durante una prueba y las deja como estaban. */
export function withEnv(vars, fn) {
  const previousFocus = {};
  for (const [k, v] of Object.entries(vars)) {
    previousFocus[k] = process.env[k];
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const restoreValue = () => {
    for (const [k, v] of Object.entries(previousFocus)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };
  return Promise.resolve().then(fn).finally(restoreValue);
}
