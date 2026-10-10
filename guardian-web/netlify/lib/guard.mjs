/* =========================================================
   GUARDIÁN · Protección de las funciones del servidor
   - Exige una sesión válida de Supabase (si la nube está configurada)
   - Limita las consultas de IA por hora y por cuenta
   - Registra cada consulta en la tabla ai_requests
   Variables de entorno en Netlify:
     ANTHROPIC_API_KEY  (secreta)   · ANTHROPIC_MODEL (opcional)
     SUPABASE_URL · SUPABASE_ANON_KEY · AI_LIMITE_HORA (opcional, 60)
   ========================================================= */
export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_ANON_KEY;
const LIMIT = () => Number(process.env.AI_LIMITE_HORA || 60);

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

/* ¿La cuenta superó el límite de consultas por hora? */
export async function overLimit(token) {
  if (!token) return false;
  try {
    const r = await rest('rpc/uso_ia_ultima_hora', token, { method: 'POST', body: '{}' });
    if (!r.ok) return false;
    return (await r.json()) >= LIMIT();
  } catch { return false; }
}

export async function logUsage(token, row) {
  if (!token) return;
  try {
    await rest('ai_requests', token, { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(row) });
  } catch { /* el registro nunca debe romper la respuesta */ }
}
