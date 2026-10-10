/* =========================================================
   GUARDIÁN · Dispositivos
   Conectar un celular es tan fácil como con Bluetooth:
   se genera un QR, el celular lo escanea y queda vinculado.
   ========================================================= */
import { $, esc, ms, fmtRel, fmtDate } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { confirmDialog, openModal } from '../ui/modal.js';
import { data, loadDevices, active } from '../services/repo.js';
import { sb, friendlyError } from '../services/cloud.js';
import { auth } from '../services/auth.js';
import { geo } from '../services/geo.js';
import { ai } from '../services/ai-local.js';
import { cloudConfigured } from '../config.js';

let countdown = null, pairing = null;
const ONLINE_MS = 5 * 60_000;

export function init() {
  $('#btnPair').addEventListener('click', createCode);
  $('#devList').addEventListener('click', onDevAction);
  bus.on('data:devices', () => { renderDevices(); checkPaired(); });
}

export function show() {
  renderThisDevice();
  renderDevices();
  if (!cloudConfigured()) {
    $('#pairBox').innerHTML = `<div class="empty">${icon('cloudOff')}<strong>Necesita la nube</strong><span>Para conectar celulares, Guardián debe estar conectado a Supabase (ver Ajustes → Datos).</span></div>`;
  } else if (auth.isDevice) {
    $('#pairBox').innerHTML = `<div class="pair-ok"><div class="tick">${icon('check')}</div><b>Este celular ya está vinculado</b></div>`;
  } else loadDevices();
}

export function hide() { /* el código sigue vigente aunque cambies de vista */ }

async function createCode() {
  const btn = $('#btnPair');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generando…';
  try {
    const { data: rows, error } = await sb().rpc('crear_codigo_vinculo');
    if (error) throw error;
    const { code, expires_at } = rows[0];
    pairing = { code, until: ms(expires_at), known: new Set(data.devices.map((d) => d.id)) };
    const url = `${location.origin}${location.pathname}#/vincular/${code}`;
    let qrSvg = '';
    if (typeof qrcode !== 'undefined') { const q = qrcode(0, 'M'); q.addData(url); q.make(); qrSvg = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); }
    $('#pairBox').innerHTML = `
      <div class="pair-qr" aria-label="Código QR para vincular">${qrSvg}</div>
      <div class="pair-code" aria-label="Código">${code.split('').join('')}</div>
      <div class="pair-timer" id="pairTimer">Vence en 10:00</div>
      <div class="row" style="justify-content:center">
        <button class="btn sm" id="pairCopy">${icon('link')}Copiar enlace</button>
        <button class="btn sm ghost" id="pairNew">${icon('refresh')}Nuevo código</button>
      </div>
      <p class="muted" style="font-size:12.5px">Esperando al celular… ${'<span class="typing"><i></i><i></i><i></i></span>'}</p>`;
    $('#pairCopy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado: envíalo al celular por WhatsApp o correo', 'ok'); } catch { toast(url); } };
    $('#pairNew').onclick = createCode;
    clearInterval(countdown);
    countdown = setInterval(tick, 1000);
    tick();
  } catch (e) {
    toast(friendlyError(e), 'err');
    resetPairBox();
  }
}

function tick() {
  if (!pairing) return;
  const left = Math.max(0, Math.round((pairing.until - Date.now()) / 1000));
  const t = $('#pairTimer');
  if (t) { t.textContent = `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; t.classList.toggle('soon', left < 60); }
  if (!left) { clearInterval(countdown); pairing = null; resetPairBox(); toast('El código venció. Genera uno nuevo cuando quieras.', 'warn'); }
  if (left % 5 === 0) loadDevices();   // por si el tiempo real no está disponible
}

function checkPaired() {
  if (!pairing) return;
  const nuevo = data.devices.find((d) => !pairing.known.has(d.id));
  if (!nuevo) return;
  clearInterval(countdown); pairing = null;
  $('#pairBox').innerHTML = `<div class="pair-ok"><div class="tick">${icon('check')}</div><h4>¡${esc(nuevo.nombre)} quedó conectado!</h4><p class="muted">Lo que detecte llegará aquí al instante.</p><button class="btn sm" id="pairAgain">${icon('plus')}Conectar otro</button></div>`;
  $('#pairAgain').onclick = createCode;
  toast(`${nuevo.nombre} se vinculó a tu cuenta`, 'ok');
}

function resetPairBox() {
  $('#pairBox').innerHTML = `<button class="btn primary lg" id="btnPair">${icon('qr')}Generar código</button>`;
  $('#btnPair').addEventListener('click', createCode);
}

function renderThisDevice() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : 'Otro';
  const chip = $('#thisDeviceChip');
  chip.className = 'chip ' + (navigator.onLine ? 'ok' : 'err');
  chip.innerHTML = `<i></i>${navigator.onLine ? 'En línea' : 'Sin internet'}`;
  $('#thisDevice').innerHTML = `
    <dt>Equipo</dt><dd>${esc(os)} · ${esc(browser)}</dd>
    <dt>Cuenta</dt><dd>${esc(auth.displayName)}${auth.isDevice ? ' (celular vinculado)' : ''}</dd>
    <dt>Modo</dt><dd>${cloudConfigured() ? 'Nube (datos compartidos)' : 'Local (solo este equipo)'}</dd>
    <dt>IA local</dt><dd>${ai.status === 'ok' ? `Lista · ${esc(ai.backend.toUpperCase())}` : 'Cargando…'}</dd>
    <dt>GPS</dt><dd>${geo.pos ? `Activo · ±${geo.accuracy} m` : 'Sin permiso o sin señal'}</dd>
    <dt>Pantalla</dt><dd>${innerWidth} × ${innerHeight}</dd>`;
}

function renderDevices() {
  if (!$('#devList')) return;
  const list = data.devices;
  $('#devCount').textContent = `${list.filter((d) => !d.revoked_at).length} activo(s)`;
  if (!list.length) {
    $('#devList').innerHTML = `<div class="empty">${icon('phone')}<strong>Sin dispositivos vinculados</strong><span>Genera un código y escanéalo con el celular.</span></div>`;
    return;
  }
  $('#devList').innerHTML = `<div class="dev-list">${list.map((d, i) => {
    const on = !d.revoked_at && d.last_seen_at && Date.now() - ms(d.last_seen_at) < ONLINE_MS;
    const n = active('sighting').filter((s) => s.device_id === d.id).length;
    return `<div class="dev ${d.revoked_at ? 'revoked' : ''}" data-id="${d.id}" style="animation-delay:${i * 50}ms">
      <div class="ico-box">${icon(d.tipo === 'pc' ? 'panel' : d.tipo === 'dron' ? 'camera' : 'phone')}</div>
      <div><b>${esc(d.nombre)}</b>
        <small>${d.revoked_at ? 'Desvinculado' : `<span class="online ${on ? 'on' : ''}"><i></i>${on ? 'En línea' : d.last_seen_at ? 'Visto ' + fmtRel(d.last_seen_at) : 'Sin conexión aún'}</span>`}</small>
        <small>${n} avistamiento(s) · desde ${fmtDate(d.created_at, { dateStyle: 'medium' })}</small></div>
      <div class="row-actions">${d.revoked_at ? '' : `
        <button class="icon-btn" data-a="rename" title="Cambiar nombre" aria-label="Cambiar nombre">${icon('settings')}</button>
        <button class="icon-btn del" data-a="unlink" title="Desvincular" aria-label="Desvincular">${icon('unlink')}</button>`}</div>
    </div>`;
  }).join('')}</div>`;
}

async function onDevAction(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const d = data.devices.find((x) => x.id === b.closest('[data-id]').dataset.id); if (!d) return;
  if (b.dataset.a === 'unlink') {
    if (!await confirmDialog({ title: `¿Desvincular ${d.nombre}?`, message: 'Dejará de enviar fotos y no podrá ver tus datos. Sus avistamientos anteriores se conservan.', confirmLabel: 'Desvincular', danger: true, icon: 'unlink' })) return;
    const { error } = await sb().from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', d.id);
    if (error) return toast(friendlyError(error), 'err');
    toast(`${d.nombre} fue desvinculado`, 'ok');
    loadDevices();
  }
  if (b.dataset.a === 'rename') {
    openModal({
      title: 'Cambiar nombre', html: `<label class="field">Nombre<input class="input" id="devName" maxlength="60" value="${esc(d.nombre)}" autofocus></label>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Guardar', cls: 'primary', fn: async (el) => {
        const nombre = el.querySelector('#devName').value.trim();
        if (!nombre) return false;
        const { error } = await sb().from('devices').update({ nombre }).eq('id', d.id);
        if (error) { toast(friendlyError(error), 'err'); return false; }
        loadDevices();
      } }]
    });
  }
}

/* Un celular vinculado avisa cada minuto que sigue conectado (y su ubicación) */
let beat = null;
bus.on('data:ready', () => {
  clearInterval(beat);
  if (!auth.isDevice || !sb()) return;
  const send = () => sb().rpc('latido_dispositivo', { p_lat: geo.pos?.lat ?? null, p_lng: geo.pos?.lng ?? null }).then(() => {});
  send();
  beat = setInterval(send, 60_000);
});
