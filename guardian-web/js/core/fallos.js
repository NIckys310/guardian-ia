/* =========================================================
   GUARDIÁN · Registro de fallos
   Ningún error se pierde: los que la app maneja (registrar) y los
   inesperados (errores y promesas sin catch) quedan en la consola y
   en este navegador (los últimos 50). Nada se envía a terceros.
   ========================================================= */
const CLAVE = 'guardian.fallos';
const MAX = 50;

function almacen() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/** Anota un error con dónde pasó. Nunca lanza excepciones. */
export function registrar(donde, error) {
  const texto = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'desconocido');
  try { console.warn(`[Guardián] ${donde}:`, error); } catch { /* sin consola */ }
  const ls = almacen();
  if (!ls) return;
  try {
    const lista = JSON.parse(ls.getItem(CLAVE) || '[]');
    lista.push({ en: new Date().toISOString(), donde, error: texto.slice(0, 300) });
    ls.setItem(CLAVE, JSON.stringify(lista.slice(-MAX)));
  } catch { /* almacenamiento lleno o bloqueado: queda solo en la consola */ }
}

/** Los fallos guardados, del más reciente al más antiguo. */
export function recientes() {
  try { return JSON.parse(almacen()?.getItem(CLAVE) || '[]').reverse(); } catch { return []; }
}

/** Escucha los errores que nadie atrapó. Se llama una vez al arrancar. */
export function vigilar(ventana = globalThis) {
  ventana.addEventListener?.('error', (e) => registrar('error sin atrapar', e.error || e.message));
  ventana.addEventListener?.('unhandledrejection', (e) => registrar('promesa sin atrapar', e.reason));
}
