/* =========================================================
   GUARDIÁN · Registros de avistamientos
   Buscar, filtrar, ver la foto, ubicar en el mapa y eliminar:
   - uno (botón de la fila), varios (casillas) o todos.
   Todo lo eliminado va a la papelera y se puede deshacer.
   ========================================================= */
import { $, esc, ms, pct, fmtDate, coord } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { openLightbox } from '../ui/lightbox.js';
import { groupBadge } from '../ui/species-ui.js';
import { active, moveToTrash, restore, photoURL, detectionsOf, data } from '../services/repo.js';
import { boxColor, COCO_ES } from '../services/ai-local.js';

const PAGE = 50;
let shown = PAGE, selected = new Set(), filtered = [];
const FUENTES = { camara: 'Cámara', foto: 'Foto', ipcam: 'Cámara IP', celular: 'Celular', dron: 'Dron', ia: 'IA' };

export function init() {
  $('#recSearch').addEventListener('input', () => { shown = PAGE; render(); });
  $('#recSpecies').addEventListener('change', () => { shown = PAGE; render(); });
  $('#recRange').addEventListener('change', () => { shown = PAGE; render(); });
  $('#recMore').addEventListener('click', () => { shown += PAGE; render(); });
  $('#recAll').addEventListener('change', (e) => {
    const page = filtered.slice(0, shown);
    page.forEach((r) => (e.target.checked ? selected.add(r.id) : selected.delete(r.id)));
    render();
  });
  $('#recBody').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-sel]'); if (!cb) return;
    cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel);
    cb.closest('tr').classList.toggle('selected', cb.checked);
    paintSelection();
  });
  $('#recBody').addEventListener('click', onRowAction);
  $('#recDeleteSel').addEventListener('click', deleteSelected);
  $('#recDeleteAll').addEventListener('click', deleteAll);
  bus.on('data:sightings', () => { if ($('#view-registros').classList.contains('active')) render(); });
}

export function show() { fillSpecies(); render(); }

function fillSpecies() {
  const sel = $('#recSpecies'), cur = sel.value;
  const names = [...new Map(active('sighting').map((s) => [s.species_id || s.nombre, s.nombre])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  sel.innerHTML = '<option value="">Todas las especies</option>' + names.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('');
  sel.value = names.some(([id]) => id === cur) ? cur : '';
}

function applyFilters() {
  const q = $('#recSearch').value.trim().toLowerCase();
  const sp = $('#recSpecies').value;
  const days = +$('#recRange').value;
  const from = days ? Date.now() - days * 864e5 : 0;
  const devName = (id) => data.devices.find((d) => d.id === id)?.nombre || '';
  filtered = active('sighting').filter((s) =>
    (!sp || (s.species_id || s.nombre) === sp) &&
    ms(s.created_at) >= from &&
    (!q || `${s.nombre} ${s.cientifico} ${s.fuente} ${devName(s.device_id)}`.toLowerCase().includes(q)));
  // Quita de la selección lo que ya no existe
  selected = new Set([...selected].filter((id) => filtered.some((r) => r.id === id)));
}

async function render() {
  applyFilters();
  const page = filtered.slice(0, shown);
  $('#recCount').textContent = `${filtered.length} registro${filtered.length === 1 ? '' : 's'}`;
  $('#recMore').classList.toggle('hidden', filtered.length <= shown);
  const devName = (id) => data.devices.find((d) => d.id === id)?.nombre;
  $('#recBody').innerHTML = page.length ? page.map((s) => `
    <tr data-id="${s.id}" class="${selected.has(s.id) ? 'selected' : ''}">
      <td><input type="checkbox" class="check" data-sel="${s.id}" ${selected.has(s.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(s.nombre)}"></td>
      <td>${s.photo || s.photo_path ? `<img class="thumb" data-photo="${s.id}" alt="">` : `<span class="thumb" style="display:grid;place-items:center">${groupBadge(s.grupo, 22)}</span>`}</td>
      <td class="sp"><b>${esc(s.nombre)}</b><small>${esc(s.cientifico)}</small></td>
      <td class="mono" style="white-space:nowrap">${fmtDate(s.created_at)}</td>
      <td class="num">${pct(s.conf)}</td>
      <td>${esc(devName(s.device_id) || FUENTES[s.fuente] || s.fuente)}${s.ia === 'claude' ? ` <span class="chip info" title="Identificado con IA avanzada">${icon('spark')}</span>` : ''}</td>
      <td class="mono" style="white-space:nowrap">${coord(s.lat, s.lng)}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-a="photo" title="Ver foto" aria-label="Ver foto">${icon('image')}</button>
        <button class="icon-btn" data-a="map" title="Ver en el mapa" aria-label="Ver en el mapa">${icon('pin')}</button>
        <button class="icon-btn del" data-a="del" title="Eliminar este registro" aria-label="Eliminar">${icon('trash')}</button>
      </div></td>
    </tr>`).join('')
    : `<tr><td colspan="8"><div class="empty">${icon('list')}<strong>Sin registros</strong><span>Cuando la IA reconozca un animal, el avistamiento aparecerá aquí.</span></div></td></tr>`;
  paintSelection();
  // Fotos en miniatura (las de la nube llegan con enlace firmado)
  for (const s of page.filter((x) => x.photo || x.photo_path)) {
    const url = await photoURL(s);
    const im = $(`#recBody img[data-photo="${s.id}"]`);
    if (im && url) im.src = url;
  }
}

function paintSelection() {
  const n = selected.size;
  $('#recDeleteSel').disabled = !n;
  $('#recDeleteSel').innerHTML = `${icon('trash')}Eliminar seleccionados${n ? ` (${n})` : ''}`;
  $('#recSelBar').classList.toggle('has-sel', n > 0);
  const page = filtered.slice(0, shown);
  $('#recAll').checked = page.length > 0 && page.every((r) => selected.has(r.id));
  $('#recAll').indeterminate = n > 0 && !$('#recAll').checked;
}

async function onRowAction(e) {
  const b = e.target.closest('[data-a]') || (e.target.matches('img.thumb') ? e.target : null);
  if (!b) return;
  const id = b.closest('tr').dataset.id;
  const s = active('sighting').find((r) => r.id === id);
  if (!s) return;
  const a = b.dataset.a || 'photo';
  if (a === 'photo') {
    const url = await photoURL(s);
    if (!url) return toast('Este registro no tiene foto', 'warn');
    const dets = await detectionsOf(s.id);
    openLightbox([{ src: url, caption: `${s.nombre} · ${pct(s.conf)} · ${fmtDate(s.created_at)}`,
      boxes: dets.map((d) => ({ bbox: d.bbox, color: boxColor(d.clase), label: `${COCO_ES[d.clase] || d.clase} ${pct(d.score)}` })) }]);
  } else if (a === 'map') {
    bus.emit('nav:go', 'mapa');
    bus.emit('map:focus', { lat: s.lat, lng: s.lng, zoom: 16 });
  } else if (a === 'del') {
    const tr = b.closest('tr'); tr.classList.add('leaving');
    await moveToTrash('sighting', [id]);
    selected.delete(id);
    toast(`"${s.nombre}" se movió a la papelera`, 'ok', { action: { label: 'Deshacer', fn: () => restore('sighting', [id]) } });
  }
}

async function deleteSelected() {
  const ids = [...selected];
  if (!ids.length) return;
  const ok = await confirmDialog({ title: `¿Eliminar ${ids.length} registro${ids.length === 1 ? '' : 's'}?`, message: 'Irán a la papelera. Podrás recuperarlos durante 30 días.', confirmLabel: 'Mover a la papelera', danger: true, icon: 'trash' });
  if (!ok) return;
  await moveToTrash('sighting', ids);
  selected.clear();
  toast(`${ids.length} registro(s) movidos a la papelera`, 'ok', { action: { label: 'Deshacer', fn: () => restore('sighting', ids) } });
}

async function deleteAll() {
  const ids = active('sighting').map((r) => r.id);
  if (!ids.length) return toast('No hay registros para eliminar');
  const ok = await confirmDialog({ title: '¿Eliminar TODOS los registros?', message: `Se moverán ${ids.length} avistamientos a la papelera. Podrás recuperarlos desde la Papelera durante 30 días.`, confirmLabel: 'Eliminar todo', danger: true, icon: 'trash' });
  if (!ok) return;
  await moveToTrash('sighting', ids);
  selected.clear();
  toast(`${ids.length} registros movidos a la papelera`, 'ok', { action: { label: 'Deshacer', fn: () => restore('sighting', ids) }, ms: 8000 });
}
