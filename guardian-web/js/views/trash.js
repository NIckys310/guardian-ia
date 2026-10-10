/* =========================================================
   GUARDIÁN · Papelera
   Recuperar uno, varios o todo. Borrar para siempre solo desde aquí,
   y para vaciarla hay que escribir ELIMINAR.
   ========================================================= */
import { $, $$, esc, ms, fmtDate, fmtRel } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { confirmDialog, typeToConfirm } from '../ui/modal.js';
import { trashed, restore, restoreAll, purge, emptyTrash, TYPES } from '../services/repo.js';
import { auth } from '../services/auth.js';
import { CONFIG } from '../config.js';

const TYPE_ICON = { sighting: 'paw', alert: 'alert', report: 'capsule', conversation: 'chat' };
let filter = '', selected = new Set();
const key = (type, id) => `${type}:${id}`;

export function init() {
  $('#trashFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    filter = b.dataset.t;
    $$('#trashFilter button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#trashAll').addEventListener('change', (e) => { items().forEach((it) => (e.target.checked ? selected.add(key(it.type, it.row.id)) : selected.delete(key(it.type, it.row.id)))); render(); });
  $('#trashBody').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-sel]'); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    cb.closest('tr').classList.toggle('selected', cb.checked);
    paintSel();
  });
  $('#trashBody').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const [type, id] = b.closest('tr').dataset.k.split(':');
    if (b.dataset.a === 'restore') { await restore(type, [id]); toast(`${TYPES[type].label} recuperado`, 'ok'); }
    if (b.dataset.a === 'purge') {
      if (!await confirmDialog({ title: '¿Borrar para siempre?', message: 'Este elemento no se podrá recuperar.', confirmLabel: 'Borrar para siempre', danger: true, icon: 'trash' })) return;
      await purge(type, [id]); toast('Borrado definitivamente', 'ok');
    }
  });
  $('#trashRestoreSel').addEventListener('click', async () => {
    const n = await forSelected(restore);
    toast(`${n} elemento(s) recuperados`, 'ok');
  });
  $('#trashRestoreAll').addEventListener('click', async () => {
    if (!trashed().length) return toast('La papelera está vacía');
    const n = await restoreAll();
    toast(`${n} elemento(s) recuperados`, 'ok');
  });
  $('#trashPurgeSel').addEventListener('click', async () => {
    if (!await confirmDialog({ title: `¿Borrar ${selected.size} elemento(s) para siempre?`, message: 'No se podrán recuperar.', confirmLabel: 'Borrar para siempre', danger: true, icon: 'trash' })) return;
    const n = await forSelected(purge);
    toast(`${n} elemento(s) borrados definitivamente`, 'ok');
  });
  $('#trashEmpty').addEventListener('click', async () => {
    const n = trashed().length;
    if (!n) return toast('La papelera ya está vacía');
    if (!await typeToConfirm({ title: 'Vaciar la papelera', message: `Se borrarán para siempre ${n} elemento(s), incluidas sus fotos. Esta acción no se puede deshacer.` })) return;
    const done = await emptyTrash();
    selected.clear();
    toast(`Papelera vaciada: ${done} elemento(s) borrados`, 'ok');
  });
  bus.on('data:any', () => { if ($('#view-papelera').classList.contains('active')) render(); });
}

export function show() {
  // Un celular vinculado puede recuperar, pero no borrar para siempre
  ['#trashPurgeSel', '#trashEmpty'].forEach((s) => $(s).classList.toggle('hidden', auth.isDevice));
  render();
}

const items = () => trashed().filter((it) => !filter || it.type === filter);

async function forSelected(fn) {
  const byType = {};
  [...selected].forEach((k) => { const [t, id] = k.split(':'); (byType[t] ||= []).push(id); });
  let n = 0;
  for (const [t, ids] of Object.entries(byType)) { await fn(t, ids); n += ids.length; }
  selected.clear();
  return n;
}

function render() {
  const list = items();
  selected = new Set([...selected].filter((k) => list.some((it) => key(it.type, it.row.id) === k)));
  $('#trashCount').textContent = `${list.length} elemento${list.length === 1 ? '' : 's'}`;
  $('#trashBody').innerHTML = list.length ? list.map(({ type, row }) => {
    const k = key(type, row.id);
    const left = Math.max(0, Math.ceil((ms(row.deleted_at) + CONFIG.papeleraDias * 864e5 - Date.now()) / 864e5));
    const title = row.nombre || row.titulo || (row.tipo ? `${row.tipo} · ${row.mensaje}` : 'Sin título');
    return `<tr data-k="${k}" class="${selected.has(k) ? 'selected' : ''}">
      <td><input type="checkbox" class="check" data-sel="${k}" ${selected.has(k) ? 'checked' : ''} aria-label="Seleccionar"></td>
      <td><span class="type-tag">${icon(TYPE_ICON[type])}${TYPES[type].label}</span></td>
      <td><b>${esc(title.slice(0, 90))}</b></td>
      <td class="mono">${fmtDate(row.created_at)}</td>
      <td class="mono">${fmtRel(row.deleted_at)}</td>
      <td><span class="days-left ${left <= 3 ? 'soon' : ''}">${left} día${left === 1 ? '' : 's'}</span></td>
      <td><div class="row-actions">
        <button class="btn sm olive" data-a="restore">${icon('restore')}Recuperar</button>
        ${auth.isDevice ? '' : `<button class="icon-btn del" data-a="purge" title="Borrar para siempre" aria-label="Borrar para siempre">${icon('trash')}</button>`}
      </div></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty">${icon('trash')}<strong>La papelera está vacía</strong><span>Lo que elimines aparecerá aquí durante ${CONFIG.papeleraDias} días.</span></div></td></tr>`;
  paintSel();
}

function paintSel() {
  const n = selected.size;
  $('#trashRestoreSel').disabled = !n;
  $('#trashPurgeSel').disabled = !n;
  $('#trashRestoreSel').innerHTML = `${icon('restore')}Recuperar seleccionados${n ? ` (${n})` : ''}`;
  const list = items();
  $('#trashAll').checked = list.length > 0 && list.every((it) => selected.has(key(it.type, it.row.id)));
}
