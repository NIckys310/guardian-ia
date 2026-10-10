/* =========================================================
   GUARDIÁN · IA avanzada (Claude) a través del servidor
   La clave de Anthropic vive como secreto en Netlify: nunca llega
   al navegador. Estas funciones llaman a las Netlify Functions.
   ========================================================= */
import { CONFIG } from '../config.js';
import { auth } from './auth.js';

export const claude = { configured: null, model: '' };

function headers() {
  const h = { 'content-type': 'application/json' };
  if (auth.session?.access_token) h.authorization = `Bearer ${auth.session.access_token}`;
  return h;
}

/* ¿El servidor tiene la clave configurada? */
export async function checkClaude() {
  try {
    const r = await fetch(`${CONFIG.functionsBase}/identify`, { method: 'GET', headers: headers() });
    if (!r.ok) { claude.configured = false; return false; }
    const j = await r.json();
    claude.configured = Boolean(j.configured);
    claude.model = j.model || '';
  } catch { claude.configured = false; }
  return claude.configured;
}

export class AIError extends Error {
  constructor(msg, code) { super(msg); this.code = code; }
}

async function failure(r) {
  let j = {};
  try { j = await r.json(); } catch { /* sin cuerpo */ }
  const map = {
    401: 'Inicia sesión para usar la IA avanzada.',
    413: 'La imagen es demasiado grande.',
    429: 'Llegaste al límite de consultas de IA por hora. Intenta más tarde.',
    503: 'La IA avanzada aún no está configurada (falta la clave de Anthropic en Netlify).'
  };
  return new AIError(j.error || map[r.status] || `Error del servidor (${r.status})`, r.status);
}

/* Identifica la especie de una foto (JPEG en base64) */
export async function identifyWithClaude(imageDataURL, { kind = 'identify' } = {}) {
  let r;
  try {
    r = await fetch(`${CONFIG.functionsBase}/identify`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ image: imageDataURL.split(',')[1], kind })
    });
  } catch { throw new AIError('Sin conexión con el servidor de IA.', 0); }
  if (!r.ok) throw await failure(r);
  return r.json();
}

/* Chat con respuesta en vivo (palabra por palabra) */
export async function chatStream({ messages, context }, onDelta, signal) {
  let r;
  try {
    r = await fetch(`${CONFIG.functionsBase}/chat`, {
      method: 'POST', headers: headers(), signal,
      body: JSON.stringify({ messages, context })
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new AIError('Sin conexión con el servidor de IA.', 0);
  }
  if (!r.ok) throw await failure(r);

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === 'delta') { full += ev.text; onDelta(ev.text, full); }
      else if (ev.type === 'error') throw new AIError(ev.error, 500);
    }
  }
  return full;
}
