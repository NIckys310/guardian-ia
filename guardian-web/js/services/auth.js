/* =========================================================
   GUARDIÁN · Cuentas y seguridad
   - Contraseña fuerte (10+ caracteres, mayúscula, minúscula, número y símbolo)
   - Bloqueo de 15 min tras 5 intentos fallidos (en la base de datos)
   - Verificación en dos pasos (TOTP: Google Authenticator, Microsoft Authenticator…)
   - Cierre de sesión automático por inactividad
   - Bitácora de auditoría
   ========================================================= */
import { CONFIG, cloudConfigured } from '../config.js';
import { getClient, sb, friendlyError } from './cloud.js';
import { bus } from '../core/bus.js';

export const auth = {
  session: null,
  user: null,
  profile: null,
  get isCloud() { return cloudConfigured(); },
  get isDevice() { return Boolean(this.user?.is_anonymous || this.profile?.is_device); },
  get displayName() { return this.profile?.full_name || this.user?.email?.split('@')[0] || (this.isDevice ? 'Celular vinculado' : 'Modo local'); },
  get role() { return this.profile?.role || (this.isCloud ? 'guardaparques' : 'local'); }
};

/* ---------- Contraseñas ---------- */
export const PASSWORD_RULES = [
  { id: 'len', label: 'Al menos 10 caracteres', test: (p) => p.length >= 10 },
  { id: 'low', label: 'Una letra minúscula', test: (p) => /[a-zñ]/.test(p) },
  { id: 'up', label: 'Una letra mayúscula', test: (p) => /[A-ZÑ]/.test(p) },
  { id: 'num', label: 'Un número', test: (p) => /\d/.test(p) },
  { id: 'sym', label: 'Un símbolo (!@#$…)', test: (p) => /[^A-Za-z0-9ñÑ]/.test(p) }
];
export function passwordScore(p = '') {
  let s = PASSWORD_RULES.filter((r) => r.test(p)).length;
  if (p.length >= 14) s += 1;
  if (/(.)\1{2,}/.test(p) || /^(123|abc|qwe|password|contraseña)/i.test(p)) s -= 2;
  return Math.max(0, Math.min(6, s));
}
export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p));

/* ---------- Sesión ---------- */
export async function initAuth() {
  if (!cloudConfigured()) { bus.emit('auth:change', auth); return auth; }
  const c = await getClient();
  const { data } = await c.auth.getSession();
  await setSession(data.session);
  c.auth.onAuthStateChange(async (event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') { auth.session = session; return; }
    await setSession(session);
  });
  return auth;
}

async function setSession(session) {
  auth.session = session;
  auth.user = session?.user || null;
  auth.profile = null;
  if (auth.user) {
    const { data } = await sb().from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
    auth.profile = data;
    sb().from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', auth.user.id).then(() => {});
    startInactivityTimer();
  } else {
    stopInactivityTimer();
  }
  bus.emit('auth:change', auth);
}

/* ¿La sesión necesita el segundo paso (código de la app autenticadora)? */
export async function needsMfa() {
  if (!sb() || !auth.user || auth.user.is_anonymous) return false;
  const { data } = await sb().auth.mfa.getAuthenticatorAssuranceLevel();
  return data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

export async function lockoutSeconds(email) {
  try {
    const { data } = await sb().rpc('login_bloqueo', { p_email: email });
    return data || 0;
  } catch { return 0; }
}

export async function signIn(email, password) {
  const c = await getClient();
  const wait = await lockoutSeconds(email);
  if (wait > 0) return { ok: false, locked: wait, error: `Cuenta bloqueada temporalmente por seguridad. Intenta en ${Math.ceil(wait / 60)} min.` };
  const { error } = await c.auth.signInWithPassword({ email, password });
  const { data: left } = await c.rpc('login_registrar', { p_email: email, p_ok: !error });
  if (error) {
    return { ok: false, locked: left || 0, error: left > 0 ? 'Demasiados intentos fallidos. Tu cuenta quedó bloqueada 15 minutos.' : friendlyError(error) };
  }
  if (await needsMfa()) return { ok: true, mfa: true };
  audit('inicio_sesion');
  return { ok: true };
}

export async function verifyMfa(code) {
  const c = sb();
  const { data: f } = await c.auth.mfa.listFactors();
  const factor = f?.totp?.find((x) => x.status === 'verified');
  if (!factor) return { ok: false, error: 'No hay una app autenticadora registrada.' };
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
  if (error) return { ok: false, error: friendlyError(error) };
  await setSession((await c.auth.getSession()).data.session);
  audit('inicio_sesion_2fa');
  return { ok: true };
}

export async function signUp(email, password, fullName) {
  if (!passwordOk(password)) return { ok: false, error: 'La contraseña no cumple los requisitos.' };
  const c = await getClient();
  const { data, error } = await c.auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: location.origin + location.pathname }
  });
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data.session) return { ok: true, confirm: true };
  audit('registro');
  return { ok: true };
}

export async function resetPassword(email) {
  const c = await getClient();
  const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '#/ajustes' });
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

export async function changePassword(newPass) {
  if (!passwordOk(newPass)) return { ok: false, error: 'La contraseña no cumple los requisitos.' };
  const { error } = await sb().auth.updateUser({ password: newPass });
  if (!error) audit('cambio_contrasena');
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

export async function signOut(everywhere = false) {
  if (!sb()) return;
  await audit('cierre_sesion', { todos: everywhere });
  await sb().auth.signOut({ scope: everywhere ? 'global' : 'local' });
}

/* Celular vinculado: entra con una cuenta anónima propia del dispositivo */
export async function signInDevice() {
  const c = await getClient();
  if (auth.user) return { ok: true };
  const { error } = await c.auth.signInAnonymously();
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

/* ---------- Verificación en dos pasos ---------- */
export async function mfaStatus() {
  if (!sb() || !auth.user) return { enabled: false };
  const { data } = await sb().auth.mfa.listFactors();
  const f = data?.totp?.find((x) => x.status === 'verified');
  return { enabled: Boolean(f), factorId: f?.id };
}

export async function mfaEnroll() {
  const c = sb();
  // Limpia intentos de registro que quedaron a medias
  const { data: list } = await c.auth.mfa.listFactors();
  for (const f of (list?.all || []).filter((x) => x.status !== 'verified')) await c.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Guardián ' + new Date().toLocaleDateString('es-CO') });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function mfaConfirm(factorId, code) {
  const { error } = await sb().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') });
  if (!error) audit('2fa_activada');
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

export async function mfaDisable(factorId) {
  const { error } = await sb().auth.mfa.unenroll({ factorId });
  if (!error) audit('2fa_desactivada');
  return error ? { ok: false, error: friendlyError(error) } : { ok: true };
}

/* ---------- Auditoría ---------- */
export async function audit(accion, detalle = {}) {
  if (!sb() || !auth.user) return;
  try {
    await sb().from('audit_log').insert({ accion, detalle, user_agent: navigator.userAgent.slice(0, 250) });
  } catch { /* la auditoría nunca debe frenar la app */ }
}

/* ---------- Cierre por inactividad ---------- */
let idleTimer = null, idleBound = false;
function resetIdle() {
  clearTimeout(idleTimer);
  if (!auth.user || auth.isDevice) return;
  const min = Number(localStorage.getItem('guardian.idleMin')) || CONFIG.inactividadMin;
  if (!min) return;
  idleTimer = setTimeout(async () => {
    await signOut();
    bus.emit('auth:idle');
  }, min * 60_000);
}
function startInactivityTimer() {
  if (!idleBound) {
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => addEventListener(e, resetIdle, { passive: true }));
    idleBound = true;
  }
  resetIdle();
}
function stopInactivityTimer() { clearTimeout(idleTimer); }
