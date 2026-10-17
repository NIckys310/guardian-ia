/* =========================================================
   GUARDIÁN · Protección de las funciones del servidor
   - Exige una sesión válida de Supabase (si la nube está configurada)
   - Limita las consultas de IA por día según el plan (gratis o Pro)
   - Registra cada consulta en la tabla ai_requests
   Variables de entorno en Netlify:
     ANTHROPIC_API_KEY  (secreta)   · ANTHROPIC_MODEL (opcional)
     SUPABASE_URL · SUPABASE_ANON_KEY  (los límites de IA dependen del plan)
   ========================================================= */
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_ANON_KEY;

export const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

/* Devuelve { user, token } o una Response de error */
export async function requireUser(req) {
  if (!SB_URL() || !SB_KEY()) {
    // Sin nube configurada solo se permite si se habilita explícitamente
    return process.env.ALLOW_ANON_AI === 'true' ? { user: null, token: null } : json(401, { error: 'El servidor no tiene Supabase configurado.' });
  }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Inicia sesión para usar la IA avanzada.' });
  const r = await fetch(`${SB_URL()}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SB_KEY() } });
  if (!r.ok) return json(401, { error: 'Tu sesión venció. Vuelve a iniciar sesión.' });
  return { user: await r.json(), token };
}

async function rest(path, token, init = {}) {
  return fetch(`${SB_URL()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_KEY(), authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers || {}) }
  });
}

/* ¿La cuenta ya usó todas las consultas de hoy según su plan (gratis o Pro)? */
export async function overLimit(token, kind) {
  if (!token) return false;
  try {
    const r = await rest('rpc/ia_permitida', token, { method: 'POST', body: JSON.stringify({ p_kind: kind }) });
    if (!r.ok) return true;                     // si no se puede comprobar, mejor no gastar sin control
    return (await r.json()) === false;
  } catch { return true; }
}

/* Llama una función de la base de datos sin sesión (la función verifica todo por dentro) */
export async function rpcAnon(name, body) {
  return fetch(`${SB_URL()}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SB_KEY(), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function logUsage(token, row) {
  if (!token) return;
  try {
    await rest('ai_requests', token, { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) });
  } catch { /* el registro nunca debe romper la respuesta */ }
}
