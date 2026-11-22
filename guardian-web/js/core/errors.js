/* =========================================================
   GUARDIÁN · Registro de fallos
   Ningún error se pierde: los que la app maneja (registrar) y los
   inesperados (errores y promesas sin catch) quedan en la consola y
   en este navegador (los últimos 50). Nada se envía a terceros.
   ========================================================= */
const STORAGE_KEY = 'guardian.fallos';
const MAX = 50;

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Anota un error con dónde pasó. Nunca lanza excepciones. */
export function logError(where, error) {
  const textValue = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'desconocido');
  try { console.warn(`[Guardián] ${where}:`, error); } catch { /* sin consola */ }
  const ls = storage();
  if (!ls) return;
  try {
    const entries = JSON.parse(ls.getItem(STORAGE_KEY) || '[]');
    entries.push({ en: new Date().toISOString(), donde: where, error: textValue.slice(0, 300) });
    ls.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX)));
  } catch { /* almacenamiento lleno o bloqueado: queda solo en la consola */ }
}

/** Los fallos guardados, del más reciente al más antiguo. */
export function recent() {
  try { return JSON.parse(storage()?.getItem(STORAGE_KEY) || '[]').reverse(); } catch { return []; }
}

/** Escucha los errores que nadie atrapó. Se llama una vez al arrancar. */
export function watchErrors(dialog = globalThis) {
  dialog.addEventListener?.('error', (e) => logError('error sin atrapar', e.error || e.message));
  dialog.addEventListener?.('unhandledrejection', (e) => logError('promesa sin atrapar', e.reason));
}
