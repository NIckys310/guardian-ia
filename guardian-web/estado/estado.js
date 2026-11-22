/* =========================================================
   PÁGINA DE ESTADO · revisa y despierta los servicios en la nube
   - Supabase (Guardián y Time Capsule): hace una consulta real a la
     base de datos, que cuenta como uso para que no se pause.
   - Funciones de IA en Netlify: las llama para que arranquen.
   Solo usa claves públicas ("publishable").
   ========================================================= */
import { CONFIG } from '../js/config.js';

// Guardián: la misma dirección y clave pública de la app (un solo lugar: js/config.js)
const proyecto = (url) => new URL(url).hostname.split('.')[0];

export const SERVICIOS = [
  { id: 'g-nube', app: 'Guardián', nombre: 'Base de datos', tipo: 'supabase',
    url: `${CONFIG.supabaseUrl}/rest/v1/species?select=id&limit=1`,
    clave: CONFIG.supabaseKey,
    panel: `https://supabase.com/dashboard/project/${proyecto(CONFIG.supabaseUrl)}` },
  { id: 'g-ia', app: 'Guardián', nombre: 'IA (Claude)', tipo: 'funcion', url: '/.netlify/functions/identify' },
  { id: 't-nube', app: 'Time Capsule', nombre: 'Base de datos', tipo: 'supabase', metodo: 'POST',
    url: 'https://frascwpukyygsaeeohnr.supabase.co/rest/v1/rpc/ping',
    clave: 'sb_publishable_HlD6zjfxofaUGFguDr5yNQ_7K5CVBPY',
    panel: 'https://supabase.com/dashboard/project/frascwpukyygsaeeohnr' },
  { id: 't-ia', app: 'Time Capsule', nombre: 'IA (Claude)', tipo: 'externa', url: 'https://timecapsule-ia.netlify.app/.netlify/functions/ia' }
];

const LENTO_MS = 4000;

/** Traduce el resultado de una consulta a lo que ve la persona. */
export function veredicto({ ok, status, ms, error }) {
  if (error) return { clase: 'mal', texto: 'En pausa o sin conexión' };
  if (!ok) return { clase: 'mal', texto: `Responde con error (${status})` };
  if (ms > LENTO_MS) return { clase: 'lento', texto: `Despertó (tardó ${(ms / 1000).toFixed(1)} s)` };
  return { clase: 'ok', texto: `Funciona · ${ms} ms` };
}

async function consultar(s) {
  const inicio = performance.now();
  try {
    let r;
    if (s.tipo === 'supabase') {
      r = await fetch(s.url, { method: s.metodo || 'GET', cache: 'no-store',
        headers: { apikey: s.clave, 'Content-Type': 'application/json' }, body: s.metodo === 'POST' ? '{}' : undefined });
    } else if (s.tipo === 'externa') {
      // Otro sitio: el navegador no deja leer la respuesta, pero si llega, el servicio respondió
      r = await fetch(s.url, { mode: 'no-cors', cache: 'no-store' });
      r = { ok: true, status: 0 };
    } else {
      r = await fetch(s.url, { cache: 'no-store' });
    }
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - inicio) };
  } catch (e) {
    return { error: String(e?.message || e), ms: Math.round(performance.now() - inicio) };
  }
}

function tarjeta(s) {
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `<small></small><h3></h3><span class="estado espera"><i></i><b>Revisando…</b></span><span class="extra"></span>`;
  el.querySelector('small').textContent = s.app;
  el.querySelector('h3').textContent = s.nombre;
  return el;
}

async function revisarTodo() {
  const boton = document.getElementById('despertar');
  const resumen = document.getElementById('resumen');
  boton.disabled = true;
  resumen.textContent = 'Despertando los servicios…';
  const resultados = await Promise.all(SERVICIOS.map(async (s) => {
    const el = document.getElementById(s.id);
    const est = el.querySelector('.estado');
    const extra = el.querySelector('.extra');
    est.className = 'estado espera'; est.querySelector('b').textContent = 'Revisando…'; extra.textContent = '';
    const v = veredicto(await consultar(s));
    est.className = `estado ${v.clase}`;
    est.querySelector('b').textContent = v.texto;
    if (v.clase === 'mal' && s.panel) {
      const a = document.createElement('a');
      a.href = s.panel; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Abrir Supabase →';
      extra.append(a);
    }
    return v.clase !== 'mal';
  }));
  const bien = resultados.filter(Boolean).length;
  resumen.textContent = bien === SERVICIOS.length
    ? `Todo funciona (${new Date().toLocaleTimeString('es-CO')}).`
    : `${SERVICIOS.length - bien} servicio(s) necesitan atención. Mira las tarjetas en rojo.`;
  boton.disabled = false;
}

if (typeof document !== 'undefined') {
  const grid = document.getElementById('servicios');
  for (const s of SERVICIOS) { const el = tarjeta(s); el.id = s.id; grid.append(el); }
  const gestores = tarjeta({ app: 'Gestores', nombre: 'App en el celular' });
  gestores.querySelector('.estado').className = 'estado ok';
  gestores.querySelector('b').textContent = 'No necesita internet';
  grid.append(gestores);
  document.getElementById('despertar').addEventListener('click', revisarTodo);
  revisarTodo();
}
