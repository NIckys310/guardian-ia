/* =========================================================
   GUARDIÁN · Guardián Pro
   Plan gratis vs. Pro, consumo de hoy, pago mensual e historial.
   - Pagos reales: Wompi (Nequi, PSE, tarjeta) cuando estén las claves.
   - MODO PRUEBA (mientras tanto): pasarela SIMULADA con un banco ficticio,
     comprobante y correo de prueba. No se mueve dinero real.
   ========================================================= */
import { $, esc, fmtDate } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { plan, isPro, loadPlan, loadPlans, paymentHistory, startCheckout, waitForActivation, simulatePayment, cancelTrial } from '../services/plan.js';
import { TEST_DATA, METHODS, STEPS, methodName, isTestPayment, mask, formatPesos, confirmationEmail } from '../services/pago-prueba.js';
import { auth } from '../services/auth.js';
import { LOCALE } from '../core/i18n.js';

const cop = (n) => '$' + Number(n).toLocaleString(LOCALE);
const STATUS = { APPROVED: ['ok', 'Aprobado'], PENDING: ['warn', 'Pendiente'], DECLINED: ['err', 'Rechazado'], VOIDED: ['err', 'Anulado'], ERROR: ['err', 'Error'] };
const waiting = (ms) => new Promise((r) => setTimeout(r, ms));

export function init() {
  bus.on('plan:change', () => { if ($('#view-pro').classList.contains('active')) paintState(); });
}

export async function show() {
  $('#proBody').innerHTML = `<div class="empty"><span class="spinner"></span><p class="muted">Cargando tu plan…</p></div>`;
  try {
    // ¿Volvió de pagar en Wompi?
    const ref = sessionStorage.getItem('guardian.pago');
    if (ref && /[?&]id=/.test(location.href + location.hash)) {
      sessionStorage.removeItem('guardian.pago');
      toast('Verificando tu pago con Wompi…', 'warn', { ms: 8000 });
      const ok = await waitForActivation();
      toast(ok ? '¡Guardián Pro activado! Gracias por apoyar la conservación.' : 'Aún no recibimos la confirmación. Si pagaste, se activará en unos minutos.', ok ? 'ok' : 'warn', { ms: 9000 });
    }
    await loadPlan();
    await paintState();
  } catch (e) {
    showError(e);
  }
}

/* Si la nube falla, nunca se queda cargando: explica y deja reintentar */
function showError(e) {
  $('#proBody').innerHTML = `
    <div class="card empty reveal">
      ${icon('cloudOff')}
      <h4>No se pudo cargar Guardián Pro</h4>
      <p class="muted">${esc(e?.message || 'Error desconocido')}</p>
      <button class="btn primary" data-reintentar>${icon('refresh')}Reintentar</button>
    </div>`;
  $('#proBody').querySelector('[data-reintentar]').addEventListener('click', show);
}

async function paintState() {
  try { await render(); } catch (e) { showError(e); }
}

async function render() {
  const [plans, history] = await Promise.all([loadPlans(), paymentHistory()]);
  const free = plans.find((p) => p.id === 'free') || { id: 'free', nombre: 'Guardián', precio_cop: 0, beneficios: ['IA local ilimitada (sin internet)', '20 consultas automáticas a Claude por día', '30 identificaciones avanzadas y 40 mensajes al asistente por día', 'Celulares vinculados, mapa, reportes y papelera'] };
  const pro = plans.find((p) => p.id === 'pro') || { id: 'pro', nombre: 'Guardián Pro', precio_cop: 14900, beneficios: ['Todo lo del plan gratis', '300 consultas automáticas a Claude por día', '300 identificaciones avanzadas y 500 mensajes al asistente por día', 'Acceso primero a las nuevas actualizaciones', 'Soporte prioritario'] };
  const trial = plan.modo_prueba !== false && !plan.pagos_activos;
  const u = plan.uso_hoy || {};
  const bar = (label, used, max) => `
    <div class="usage"><div class="row between"><span>${label}</span><span class="mono">${used} / ${max}</span></div>
      <div class="progress"><i style="--p:${Math.min(100, (used / Math.max(1, max)) * 100)}%"></i></div></div>`;
  const card = (p, current, cta) => `
    <article class="card plan-card reveal ${p.id === 'pro' ? 'pro' : ''} ${current ? 'current' : ''}">
      ${p.id === 'pro' ? `<span class="plan-ribbon">${icon('spark')} Recomendado</span>` : ''}
      <h4>${esc(p.nombre)}</h4>
      <div class="plan-price"><b>${p.precio_cop ? cop(p.precio_cop) : 'Gratis'}</b>${p.precio_cop ? `<span>COP / mes${trial ? ' · simulado' : ''}</span>` : '<span>para siempre</span>'}</div>
      <ul class="plan-list">${(p.beneficios || []).map((b) => `<li>${icon('check')}${esc(b)}</li>`).join('')}</ul>
      <div class="plan-cta">${cta}</div>
    </article>`;

  const withoutAccount = !auth.isCloud || !auth.user;
  const proCta = withoutAccount ? '<p class="muted">Inicia sesión para suscribirte.</p>'
    : auth.isDevice ? '<p class="muted">La suscripción se hace desde el computador principal.</p>'
    : trial ? (isPro()
        ? `<span class="chip ok"><i></i>Activo (prueba) hasta ${fmtDate(plan.vence, { dateStyle: 'long' })}</span>
           <button class="btn olive block" data-simular>${icon('restore')}Renovar un mes más (simulado)</button>
           <button class="btn ghost sm" data-cancelar-prueba>${icon('x')}Volver al plan gratis (prueba)</button>`
        : `<button class="btn primary lg block" data-simular>${icon('spark')}Suscribirme · pago de prueba</button>
           <small class="muted">Pasarela simulada: no se cobra dinero real.</small>`)
    : isPro() ? `<span class="chip ok"><i></i>Activo hasta ${fmtDate(plan.vence, { dateStyle: 'long' })}</span>
        <button class="btn olive block" data-pay>${icon('restore')}Renovar un mes más con Nequi</button>`
    : `<button class="btn primary lg block" data-pay>${icon('spark')}Suscribirme con Nequi</button>
        <small class="muted">También puedes pagar con PSE, tarjeta o botón Bancolombia.</small>`;

  $('#proBody').innerHTML = `
    ${trial ? `<div class="test-banner reveal" role="status">
      <span class="test-badge">${icon('alert')} MODO PRUEBA</span>
      <div><b>Los pagos de esta pantalla son simulados.</b> No se cobra ni se mueve dinero real: el banco, la cuenta y el
      correo son ficticios. Los pagos reales se activarán con la autorización del profesor y esta sección se irá actualizando.</div>
    </div>` : ''}
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
          ${trial ? `<li>${icon('info')}Ahora mismo todo es una simulación: puedes probar el pago completo sin riesgo.</li>` : ''}
          <li>${icon('lock')}Los pagos reales se harán en la página oficial de Wompi. Guardián nunca ve tu número de Nequi ni tus tarjetas.</li>
          <li>${icon('eyeOff')}No guardamos tu dirección IP ni datos del celular con el que pagas.</li>
          <li>${icon('calendar')}Cada pago activa Pro por 30 días. No hay cobros automáticos: renuevas cuando quieras.</li>
          <li>${icon('check')}Cada pago se verifica antes de activar el plan.</li>
        </ul>
      </div>
    </div>
    ${history.length ? `<div class="card reveal" style="margin-top:var(--gap)">
      <div class="card-head"><h4>${icon('list')}Historial de pagos</h4></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Fecha</th><th>Referencia</th><th>Medio</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>
      ${history.map((p) => `<tr><td>${fmtDate(p.created_at)}</td><td class="mono">${esc(p.reference)}</td>
        <td>${isTestPayment(p) ? `${esc(methodName(p.metodo))} <span class="chip warn">prueba</span>` : esc(p.metodo || '—')}</td>
        <td class="num">${cop(p.amount_cents / 100)}</td>
        <td><span class="chip ${STATUS[p.status]?.[0] || ''}">${STATUS[p.status]?.[1] || esc(p.status)}</span></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}`;
  $('#proBody').querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));

  $('#proBody').querySelector('[data-pay]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.innerHTML = '<span class="spinner"></span> Abriendo Wompi…';
    try { await startCheckout('pro'); }
    catch (err) { toast(err.message, 'err'); paintState(); }
  });
  $('#proBody').querySelector('[data-simular]')?.addEventListener('click', () => testGateway(pro));
  $('#proBody').querySelector('[data-cancelar-prueba]')?.addEventListener('click', async () => {
    if (!await confirmDialog({ title: '¿Volver al plan gratis?', message: 'Es solo para repetir la demostración: se quita el Pro de prueba.', confirmLabel: 'Volver al gratis' })) return;
    try { await cancelTrial(); toast('Volviste al plan gratis (prueba).', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
  });
}

/* =========================================================
   PASARELA DE PRUEBA: elegir medio → datos ficticios → procesando → comprobante
   ========================================================= */
function testGateway(pro) {
  let methodValue = METHODS[0].id;
  const valueText = pro.precio_cop * 100;
  const m = openModal({ title: 'Pago de prueba · Guardián Pro', wide: true, html: '' });
  const requestBody = m.el.querySelector('.modal-body');
  const notice = `<div class="test-banner slim"><span class="test-badge">${icon('alert')} MODO PRUEBA</span>
    <div>Simulación: no escribas datos reales. No se cobra dinero.</div></div>`;

  const dataOf = (id) => id === 'TRANSFERENCIA_PRUEBA'
    ? [['Banco', TEST_DATA.banco], ['Titular', TEST_DATA.titular], ['Cuenta de ahorros', TEST_DATA.cuenta], ['Documento', TEST_DATA.documento], ['Correo', TEST_DATA.correo]]
    : id === 'BILLETERA_PRUEBA'
      ? [['Billetera', 'Billetera de Prueba (ficticia)'], ['Titular', TEST_DATA.titular], ['Celular', TEST_DATA.celular], ['Correo', TEST_DATA.correo]]
      : [['Tarjeta', TEST_DATA.tarjeta], ['Titular', TEST_DATA.titular], ['Vence', '12/30'], ['Código', '000'], ['Correo', TEST_DATA.correo]];

  const step1 = () => {
    requestBody.innerHTML = `${notice}
      <div class="pay-summary"><span>Guardián Pro · 1 mes</span><b>${formatPesos(valueText)} COP</b></div>
      <p class="muted">1. Elige cómo pagar (todos son de prueba):</p>
      <div class="pay-methods">${METHODS.map((x) => `
        <button class="pay-method ${x.id === methodValue ? 'active' : ''}" data-metodo="${x.id}">
          ${icon(x.icono)}<span><b>${esc(x.nombre)}</b><small>${esc(x.detalle)}</small></span></button>`).join('')}</div>
      <p class="muted">2. Datos ficticios (no se pueden cambiar):</p>
      <div class="pay-fields">${dataOf(methodValue).map(([k, v]) => `
        <label><span>${esc(k)}</span><input class="input mono" value="${esc(v)}" readonly tabindex="-1"></label>`).join('')}</div>
      <button class="btn primary lg block" data-pagar>${icon('lock')}Pagar ${formatPesos(valueText)} (simulado)</button>`;
    requestBody.querySelectorAll('[data-metodo]').forEach((b) => b.addEventListener('click', () => { methodValue = b.dataset.metodo; step1(); }));
    requestBody.querySelector('[data-pagar]').addEventListener('click', handleRequest);
  };

  const handleRequest = async () => {
    requestBody.innerHTML = `${notice}
      <div class="pay-steps">${STEPS.map(([t], i) => `<div class="pay-step" data-i="${i}"><span class="dot"></span>${esc(t)}</div>`).join('')}</div>`;
    const mark = (i, statusValue) => requestBody.querySelector(`[data-i="${i}"]`)?.classList.add(statusValue);
    try {
      for (let i = 0; i < STEPS.length - 1; i++) { mark(i, 'doing'); await waiting(STEPS[i][1]); mark(i, 'done'); }
      mark(STEPS.length - 1, 'doing');
      const receipt = await simulatePayment(methodValue);
      mark(STEPS.length - 1, 'done');
      await waiting(400);
      receiptValue(receipt);
      paintState();
    } catch (err) {
      requestBody.innerHTML = `${notice}<div class="empty">${icon('alert')}<h4>No se pudo completar la prueba</h4>
        <p class="muted">${esc(err.message)}</p><button class="btn" data-otra>${icon('restore')}Intentar de nuevo</button></div>`;
      requestBody.querySelector('[data-otra]').addEventListener('click', step1);
    }
  };

  const receiptValue = (r) => {
    const emailAddress = confirmationEmail(r, auth.user?.user_metadata?.name || TEST_DATA.titular);
    requestBody.innerHTML = `${notice}
      <div class="receipt">
        <div class="receipt-ok">${icon('check')}</div>
        <h4>¡Pago de prueba aprobado!</h4>
        <p class="muted">Guardián Pro quedó activo hasta el ${esc(fmtDate(r.vence, { dateStyle: 'long' }))}.</p>
        <dl>
          <dt>Referencia</dt><dd class="mono">${esc(r.reference)}</dd>
          <dt>Valor</dt><dd>${formatPesos(r.amount_cents)} COP <span class="chip warn">simulado</span></dd>
          <dt>Medio</dt><dd>${esc(methodName(r.metodo))} · ${esc(TEST_DATA.banco)}</dd>
          <dt>Cuenta</dt><dd class="mono">${esc(mask(TEST_DATA.cuenta))}</dd>
          <dt>Fecha</dt><dd>${esc(fmtDate(r.aprobado))}</dd>
        </dl>
      </div>
      <div class="mail-preview">
        <div class="mail-head">${icon('send')}<div><b>Correo de confirmación (simulado)</b>
          <small>Para: ${esc(emailAddress.para)} · no se envía a ningún correo real</small></div></div>
        <div class="mail-subject">${esc(emailAddress.asunto)}</div>
        <pre class="mail-body">${esc(emailAddress.cuerpo)}</pre>
      </div>
      <button class="btn primary block" data-cerrar>${icon('check')}Listo</button>`;
    requestBody.querySelector('[data-cerrar]').addEventListener('click', () => m.close(true));
    toast('Guardián Pro activado (modo prueba).', 'ok');
  };

  step1();
}
