/* =========================================================
   GUARDIÁN · Guardián Pro
   Plan gratis vs. Pro, consumo de hoy, pago mensual con Nequi
   (a través de Wompi) e historial de pagos.
   ========================================================= */
import { $, esc, fmtDate } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { plan, isPro, loadPlan, loadPlans, paymentHistory, startCheckout, waitForActivation } from '../services/plan.js';
import { auth } from '../services/auth.js';

const cop = (n) => '$' + Number(n).toLocaleString('es-CO');
const STATUS = { APPROVED: ['ok', 'Aprobado'], PENDING: ['warn', 'Pendiente'], DECLINED: ['err', 'Rechazado'], VOIDED: ['err', 'Anulado'], ERROR: ['err', 'Error'] };

export function init() {
  bus.on('plan:change', () => { if ($('#view-pro').classList.contains('active')) render(); });
}

export async function show() {
  $('#proBody').innerHTML = `<div class="empty"><span class="spinner"></span></div>`;
  // ¿Volvió de pagar en Wompi?
  const ref = sessionStorage.getItem('guardian.pago');
  if (ref && /[?&]id=/.test(location.href + location.hash)) {
    sessionStorage.removeItem('guardian.pago');
    toast('Verificando tu pago con Wompi…', 'warn', { ms: 8000 });
    const ok = await waitForActivation();
    toast(ok ? '¡Guardián Pro activado! Gracias por apoyar la conservación.' : 'Aún no recibimos la confirmación. Si pagaste, se activará en unos minutos.', ok ? 'ok' : 'warn', { ms: 9000 });
  }
  await loadPlan();
  render();
}

async function render() {
  const plans = await loadPlans();
  const free = plans.find((p) => p.id === 'free') || { id: 'free', nombre: 'Guardián', precio_cop: 0, beneficios: ['IA local ilimitada (sin internet)', '20 consultas automáticas a Claude por día', '30 identificaciones avanzadas y 40 mensajes al asistente por día', 'Celulares vinculados, mapa, reportes y papelera'] };
  const pro = plans.find((p) => p.id === 'pro') || { id: 'pro', nombre: 'Guardián Pro', precio_cop: 14900, beneficios: ['Todo lo del plan gratis', '300 consultas automáticas a Claude por día', '300 identificaciones avanzadas y 500 mensajes al asistente por día', 'Acceso primero a las nuevas actualizaciones', 'Soporte prioritario'] };
  const history = await paymentHistory();
  const u = plan.uso_hoy || {};
  const bar = (label, used, max) => `
    <div class="usage"><div class="row between"><span>${label}</span><span class="mono">${used} / ${max}</span></div>
      <div class="progress"><i style="--p:${Math.min(100, (used / Math.max(1, max)) * 100)}%"></i></div></div>`;
  const card = (p, current, cta) => `
    <article class="card plan-card reveal ${p.id === 'pro' ? 'pro' : ''} ${current ? 'current' : ''}">
      ${p.id === 'pro' ? `<span class="plan-ribbon">${icon('spark')} Recomendado</span>` : ''}
      <h4>${esc(p.nombre)}</h4>
      <div class="plan-price"><b>${p.precio_cop ? cop(p.precio_cop) : 'Gratis'}</b>${p.precio_cop ? '<span>COP / mes</span>' : '<span>para siempre</span>'}</div>
      <ul class="plan-list">${(p.beneficios || []).map((b) => `<li>${icon('check')}${esc(b)}</li>`).join('')}</ul>
      <div class="plan-cta">${cta}</div>
    </article>`;

  const proCta = !auth.isCloud || !auth.user ? '<p class="muted">Inicia sesión para suscribirte.</p>'
    : auth.isDevice ? '<p class="muted">La suscripción se hace desde el computador principal.</p>'
    : isPro() ? `<span class="chip ok"><i></i>Activo hasta ${fmtDate(plan.vence, { dateStyle: 'long' })}</span>
        <button class="btn olive block" data-pay>${icon('restore')}Renovar un mes más con Nequi</button>`
    : plan.pagos_activos ? `<button class="btn primary lg block" data-pay>${icon('spark')}Suscribirme con Nequi</button>
        <small class="muted">También puedes pagar con PSE, tarjeta o botón Bancolombia.</small>`
    : `<button class="btn primary lg block" disabled>${icon('clock')}Muy pronto</button>
        <small class="muted">${auth.role === 'admin' ? 'Falta conectar tu cuenta de Wompi (ver instrucciones abajo).' : 'Los pagos se activarán pronto.'}</small>`;

  $('#proBody').innerHTML = `
    <div class="grid grid-2 collapse-md plans">
      ${card(free, !isPro(), !isPro() ? '<span class="chip"><i></i>Tu plan actual</span>' : '')}
      ${card(pro, isPro(), proCta)}
    </div>
    <div class="grid grid-2 collapse-md" style="margin-top:var(--gap)">
      <div class="card reveal">
        <div class="card-head"><h4>${icon('activity')}Tu consumo de IA hoy</h4><span class="sub">se reinicia cada 24 h</span></div>
        <div class="stack">
          ${bar('Consultas automáticas (escáner)', u.auto || 0, plan.limite_auto)}
          ${bar('Identificaciones con IA avanzada', u.identify || 0, plan.limite_ident)}
          ${bar('Mensajes al asistente', u.chat || 0, plan.limite_chat)}
          <small class="muted">La IA local (sin internet) no tiene límite en ningún plan.</small>
        </div>
      </div>
      <div class="card reveal">
        <div class="card-head"><h4>${icon('shield')}Pagos seguros y privados</h4></div>
        <ul class="plan-list">
          <li>${icon('lock')}Pagas en la página oficial de Wompi (Bancolombia). Guardián nunca ve tu número de Nequi ni tus tarjetas.</li>
          <li>${icon('eyeOff')}No guardamos tu dirección IP ni datos del celular con el que pagas.</li>
          <li>${icon('calendar')}Cada pago activa Pro por 30 días. No hay cobros automáticos: renuevas cuando quieras.</li>
          <li>${icon('check')}Cada pago se verifica con firma digital antes de activar el plan.</li>
        </ul>
      </div>
    </div>
    ${history.length ? `<div class="card reveal" style="margin-top:var(--gap)">
      <div class="card-head"><h4>${icon('list')}Historial de pagos</h4></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Fecha</th><th>Referencia</th><th>Medio</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>
      ${history.map((p) => `<tr><td>${fmtDate(p.created_at)}</td><td class="mono">${esc(p.reference)}</td><td>${esc(p.metodo || '—')}</td><td class="num">${cop(p.amount_cents / 100)}</td><td><span class="chip ${STATUS[p.status]?.[0] || ''}">${STATUS[p.status]?.[1] || esc(p.status)}</span></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
    ${auth.role === 'admin' && !plan.pagos_activos ? `<div class="card reveal" style="margin-top:var(--gap)">
      <div class="card-head"><h4>${icon('key')}Para recibir pagos en tu Nequi (solo administradora)</h4></div>
      <ol class="steps">
        <li><b>Crea tu cuenta de comercio en wompi.co</b> y registra tu cuenta de Nequi o Bancolombia para recibir el dinero.</li>
        <li><b>En Wompi → Desarrolladores</b> copia la llave pública, el secreto de integridad y el secreto de eventos.</li>
        <li><b>En Wompi → URL de eventos</b> pega: <code>${esc(location.origin)}/.netlify/functions/wompi</code></li>
        <li><b>Guarda las llaves en Supabase</b> (SQL Editor) con el comando que te dio tu asistente. Nunca las pegues en la app ni en el chat.</li>
      </ol></div>` : ''}`;
  $('#proBody').querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
  $('#proBody').querySelector('[data-pay]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.innerHTML = '<span class="spinner"></span> Abriendo Wompi…';
    try { await startCheckout('pro'); }
    catch (err) { toast(err.message, 'err'); render(); }
  });
}
