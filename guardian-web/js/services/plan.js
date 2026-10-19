/* =========================================================
   GUARDIÁN · Plan (gratis o Pro) y pago mensual con Wompi / Nequi
   El pago se hace en la página segura de Wompi (checkout.wompi.co):
   Guardián nunca ve datos de Nequi ni de tarjetas.
   Mientras no estén las claves reales, funciona el MODO PRUEBA
   (pagos simulados, ver pago-prueba.js).
   ========================================================= */
import { bus } from '../core/bus.js';
import { sb, friendlyError } from './cloud.js';
import { auth } from './auth.js';

export const FREE_DEFAULT = { plan: 'free', nombre: 'Guardián', precio_cop: 0, limite_auto: 20, limite_ident: 30, limite_chat: 40, vence: null, pagos_activos: false, modo_prueba: true, uso_hoy: { auto: 0, identify: 0, chat: 0 } };
export const plan = { ...FREE_DEFAULT, loaded: false };
export const isPro = () => plan.plan === 'pro';

/** Ninguna consulta puede dejar la pantalla cargando para siempre: a los 12 s se rinde. */
export function conLimite(promesa, ms = 12_000) {
  let t;
  const tiempo = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('La nube tardó demasiado en responder. Revisa tu internet y vuelve a intentar.')), ms); });
  return Promise.race([promesa, tiempo]).finally(() => clearTimeout(t));
}

export async function loadPlan() {
  if (!sb() || !auth.user) { Object.assign(plan, FREE_DEFAULT, { loaded: true }); bus.emit('plan:change', plan); return plan; }
  const { data, error } = await conLimite(sb().rpc('mi_plan'));
  if (error) throw new Error(friendlyError(error));
  if (data) Object.assign(plan, FREE_DEFAULT, data, { loaded: true });
  bus.emit('plan:change', plan);
  return plan;
}

export async function loadPlans() {
  if (!sb() || !auth.user) return [];
  const { data } = await conLimite(sb().from('plans').select('*').eq('activo', true).order('precio_cop'));
  return data || [];
}

export async function paymentHistory() {
  if (!sb() || !auth.user || auth.isDevice) return [];
  const { data } = await conLimite(sb().from('payments').select('reference, amount_cents, status, metodo, provider, created_at').order('created_at', { ascending: false }).limit(12));
  return data || [];
}

/* Abre la página de pago de Wompi (Nequi, PSE, tarjeta, Bancolombia) */
export async function startCheckout(planId = 'pro') {
  const { data, error } = await sb().rpc('crear_pago', { p_plan: planId });
  if (error) throw new Error(friendlyError(error));
  const q = new URLSearchParams({
    'public-key': data.public_key,
    currency: data.currency,
    'amount-in-cents': data.amount_in_cents,
    reference: data.reference,
    'signature:integrity': data.signature,
    'redirect-url': data.redirect_url
  });
  sessionStorage.setItem('guardian.pago', data.reference);
  location.href = `https://checkout.wompi.co/p/?${q}`;
}

/* MODO PRUEBA: pago simulado (no mueve dinero). Activa Pro por 30 días. */
export async function simularPago(metodo) {
  const { data, error } = await conLimite(sb().rpc('simular_pago', { p_metodo: metodo }));
  if (error) throw new Error(friendlyError(error));
  await loadPlan();
  return data;
}

/* MODO PRUEBA: volver al plan gratis para repetir la demostración */
export async function cancelarPrueba() {
  const { error } = await conLimite(sb().rpc('cancelar_prueba'));
  if (error) throw new Error(friendlyError(error));
  await loadPlan();
}

/* Al volver de Wompi, espera unos segundos la confirmación */
export async function waitForActivation(maxMs = 45_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await loadPlan().catch(() => {});      // un fallo de red no corta la espera
    if (isPro()) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

/* Cuenta una consulta hecha (para mostrar el consumo sin recargar) */
export function countUse(kind) {
  plan.uso_hoy[kind] = (plan.uso_hoy[kind] || 0) + 1;
  bus.emit('plan:change', plan);
}
