/* =========================================================
   GUARDIÁN · Alertas de posible caza furtiva
   ========================================================= */
import { $, $$, esc, pct, fmtDate, fmtRel, coord } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { openLightbox } from '../ui/lightbox.js';
import { active, update, moveToTrash, restore, photoURL, data } from '../services/repo.js';
import { raiseAlert } from '../services/events.js';

let filter = 'pending', selected = new Set();

export function init() {
  $('#alertFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    filter = b.dataset.f;
    $$('#alertFilter button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#btnSimulate').addEventListener('click', () => raiseAlert('person', 0.92, { mensaje: 'Alerta simulada: persona detectada en zona protegida.' }));
  $('#alertDeleteSel').addEventListener('click', deleteSelected);
  $('#alertDeleteAll').addEventListener('click', deleteAll);
  $('#alertList').addEventListener('click', onAction);
  $('#alertList').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-sel]'); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    cb.closest('.alert-card').classList.toggle('selected', cb.checked);
    paintSel();
  });
  bus.on('data:alerts', () => { if ($('#view-alertas').classList.contains('active')) render(); });
}

export function show() { render(); }

const list = () => active('alert').filter((a) => filter === 'all' || (filter === 'pending' ? !a.atendida : a.atendida));

async function render() {
  const rows = list();
  selected = new Set([...selected].filter((id) => rows.some((r) => r.id === id)));
  const devName = (id) => data.devices.find((d) => d.id === id)?.nombre;
  $('#alertList').innerHTML = rows.length ? rows.map((a, i) => `
    <article class="alert-card ${a.atendida ? 'done' : ''} ${selected.has(a.id) ? 'selected' : ''}" data-id="${a.id}" style="animation-delay:${Math.min(i, 10) * 40}ms">
      <div class="pic" data-a="photo">${a.photo || a.photo_path ? `<img alt="Captura de la alerta" data-photo="${a.id}">` : `<div style="display:grid;place-items:center;height:100%;color:var(--faint)">${icon('image')}</div>`}
        <input type="checkbox" class="check" data-sel="${a.id}" ${selected.has(a.id) ? 'checked' : ''} aria-label="Seleccionar alerta"></div>
      <div>
        <h4>${a.atendida ? icon('check') : '<span class="live-dot"></span>'}${esc(a.tipo)} <span class="chip ${a.atendida ? 'ok' : 'err'}">${a.atendida ? 'Atendida' : 'Pendiente'}</span></h4>
        <p>${esc(a.mensaje)}</p>
        <div class="meta"><span>${fmtDate(a.created_at)} · ${fmtRel(a.created_at)}</span><span>${coord(a.lat, a.lng)}</span><span>${pct(a.conf)}</span>${devName(a.device_id) ? `<span>${icon('phone')} ${esc(devName(a.device_id))}</span>` : ''}</div>
        <div class="actions">
          <button class="btn sm ${a.atendida ? '' : 'olive'}" data-a="done">${icon(a.atendida ? 'restore' : 'check')}${a.atendida ? 'Reabrir' : 'Marcar atendida'}</button>
          <button class="btn sm" data-a="map">${icon('pin')}Ver en mapa</button>
          <button class="btn sm danger" data-a="del">${icon('trash')}Eliminar</button>
        </div>
      </div>
    </article>`).join('')
    : `<div class="empty" style="grid-column:1/-1">${icon('shield')}<strong>${filter === 'pending' ? 'Sin alertas pendientes' : 'Sin alertas'}</strong><span>Activa "Zona protegida" en el Escáner para detectar personas, vehículos o armas.</span></div>`;
  paintSel();
  for (const a of rows.filter((x) => x.photo || x.photo_path)) {
    const url = await photoURL(a);
    const im = $(`#alertList img[data-photo="${a.id}"]`);
    if (im && url) im.src = url;
  }
}

function paintSel() {
  $('#alertDeleteSel').disabled = !selected.size;
  $('#alertDeleteSel').innerHTML = `${icon('trash')}Eliminar seleccionadas${selected.size ? ` (${selected.size})` : ''}`;
}

async function onAction(e) {
  if (e.target.closest('[data-sel]')) return;
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const a = active('alert').find((x) => x.id === id); if (!a) return;
  switch (b.dataset.a) {
    case 'photo': {
      const url = await photoURL(a);
      if (url) openLightbox([{ src: url, caption: `${a.tipo} · ${fmtDate(a.created_at)}` }]);
      break;
    }
    case 'done':
      await update('alert', [id], { atendida: !a.atendida });
      toast(a.atendida ? 'Alerta reabierta' : 'Alerta marcada como atendida', 'ok');
      break;
    case 'map':
      bus.emit('nav:go', 'mapa');
      bus.emit('map:focus', { lat: a.lat, lng: a.lng, zoom: 16 });
      break;
    case 'del':
      await moveToTrash('alert', [id]);
      toast('Alerta movida a la papelera', 'ok', { action: { label: 'Deshacer', fn: () => restore('alert', [id]) } });
      break;
  }
}

async function deleteSelected() {
  const ids = [...selected];
  if (!ids.length) return;
  if (!await confirmDialog({ title: `¿Eliminar ${ids.length} alerta(s)?`, message: 'Irán a la papelera y podrás recuperarlas durante 30 días.', confirmLabel: 'Mover a la papelera', danger: true, icon: 'trash' })) return;
  await moveToTrash('alert', ids);
  selected.clear();
  toast(`${ids.length} alerta(s) movidas a la papelera`, 'ok', { action: { label: 'Deshacer', fn: () => restore('alert', ids) } });
}

async function deleteAll() {
  const ids = list().map((a) => a.id);
  if (!ids.length) return toast('No hay alertas en esta lista');
  const label = { pending: 'pendientes', done: 'atendidas', all: '' }[filter];
  if (!await confirmDialog({ title: `¿Eliminar todas las alertas ${label}?`, message: `Se moverán ${ids.length} alertas a la papelera. Podrás recuperarlas durante 30 días.`, confirmLabel: 'Eliminar todas', danger: true, icon: 'trash' })) return;
  await moveToTrash('alert', ids);
  selected.clear();
  toast(`${ids.length} alertas movidas a la papelera`, 'ok', { action: { label: 'Deshacer', fn: () => restore('alert', ids) }, ms: 8000 });
}
