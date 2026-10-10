/* =========================================================
   GUARDIÁN · Cápsula de reportes
   Los reportes NO se descargan: se guardan en el sistema como una
   foto fija del período y se abren dentro de la app cuando quieras.
   ========================================================= */
import { $, esc, ms, fmtDate, fmtDay, conservClass, pct } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { active, insert, moveToTrash, restore } from '../services/repo.js';
import { auth } from '../services/auth.js';
import { sb } from '../services/cloud.js';
import { groupOf } from '../data/groups.js';

const iso = (d) => d.toISOString().slice(0, 10);

export function init() {
  preset(7);
  $('#repPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) preset(b.dataset.p); });
  ['#repFrom', '#repTo'].forEach((s) => $(s).addEventListener('change', preview));
  $('#btnSaveReport').addEventListener('click', save);
  $('#repList').addEventListener('click', onAction);
  bus.on('data:reports', () => { if ($('#view-reportes').classList.contains('active')) renderList(); });
  bus.on('data:sightings', () => { if ($('#view-reportes').classList.contains('active')) preview(); });
}

export function show() { preview(); renderList(); }

function preset(p) {
  const to = new Date(), from = new Date();
  if (p === 'm') from.setDate(1);
  else from.setDate(from.getDate() - (+p - 1));
  $('#repFrom').value = iso(from);
  $('#repTo').value = iso(to);
  const label = { 1: 'diario', 7: 'semanal', 30: 'mensual', m: 'del mes' }[p];
  if (!$('#repTitle').dataset.touched) $('#repTitle').value = `Reporte ambiental ${label} · ${to.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  preview();
}
document.addEventListener('input', (e) => { if (e.target.id === 'repTitle') e.target.dataset.touched = '1'; });

function period() {
  const from = new Date($('#repFrom').value + 'T00:00:00');
  const to = new Date($('#repTo').value + 'T23:59:59');
  return { from, to };
}

function collect() {
  const { from, to } = period();
  const inP = (r) => ms(r.created_at) >= from.getTime() && ms(r.created_at) <= to.getTime();
  const sightings = active('sighting').filter(inP);
  const alerts = active('alert').filter(inP);
  const g = {};
  sightings.forEach((s) => {
    const e = g[s.species_id || s.nombre] ||= { id: s.species_id || s.nombre, nombre: s.nombre, cientifico: s.cientifico, estado: s.estado, grupo: s.grupo, n: 0, max: 0 };
    e.n++; e.max = Math.max(e.max, +s.conf);
  });
  const species = Object.values(g).sort((a, b) => b.n - a.n);
  return { from, to, sightings, alerts, species, threatened: species.filter((s) => ['cr', 'vu'].includes(conservClass(s.estado))) };
}

function preview() {
  const c = collect();
  $('#repPreview').innerHTML = `
    <div><b>${c.sightings.length}</b><span>avistamientos</span></div>
    <div><b>${c.species.length}</b><span>especies</span></div>
    <div><b>${c.threatened.length}</b><span>amenazadas</span></div>
    <div><b>${c.alerts.length}</b><span>alertas</span></div>`;
}

async function save() {
  const c = collect();
  if (c.to < c.from) return toast('La fecha "hasta" debe ser posterior a "desde"', 'err');
  const titulo = $('#repTitle').value.trim() || 'Reporte ambiental';
  const notas = $('#repNotes').value.trim();
  const resumen = {
    avistamientos: c.sightings.length, especies: c.species.length, amenazadas: c.threatened.length,
    alertas: c.alerts.length, pendientes: c.alerts.filter((a) => !a.atendida).length,
    top: c.species.slice(0, 5).map((s) => ({ nombre: s.nombre, n: s.n })), autor: auth.displayName
  };
  const html = buildHTML(titulo, notas, c);
  const btn = $('#btnSaveReport');
  btn.disabled = true;
  const row = await insert('report', { titulo, desde: c.from.toISOString(), hasta: c.to.toISOString(), notas, resumen, html });
  if (sb() && auth.user && c.species.length) {
    sb().from('report_species').insert(c.species.map((s) => ({ report_id: row.id, species_id: s.id, nombre: s.nombre, estado: s.estado || '', n: s.n }))).then(() => {});
  }
  btn.disabled = false;
  $('#repNotes').value = '';
  toast('Reporte guardado en la cápsula', 'ok', { action: { label: 'Abrir', fn: () => openReport(row) } });
}

function renderList() {
  const rows = active('report');
  $('#repCount').textContent = `${rows.length} guardado${rows.length === 1 ? '' : 's'}`;
  $('#repList').innerHTML = rows.length ? rows.map((r, i) => `
    <article class="capsule" data-id="${r.id}" style="animation-delay:${Math.min(i, 10) * 50}ms">
      <span class="stamp">${icon('clock')} Guardado ${fmtDate(r.created_at)}</span>
      <h5>${esc(r.titulo)}</h5>
      <div class="nums"><span>${fmtDay(r.desde)} → ${fmtDay(r.hasta)}</span></div>
      <div class="nums" style="margin-top:6px"><span><b>${r.resumen?.avistamientos ?? 0}</b> avistamientos</span><span><b>${r.resumen?.especies ?? 0}</b> especies</span><span><b>${r.resumen?.alertas ?? 0}</b> alertas</span></div>
      <div class="actions">
        <button class="btn sm primary" data-a="open">${icon('eye')}Abrir</button>
        <button class="btn sm" data-a="print">${icon('print')}Imprimir</button>
        <button class="btn sm danger" data-a="del">${icon('trash')}Eliminar</button>
      </div>
    </article>`).join('')
    : `<div class="empty">${icon('capsule')}<strong>La cápsula está vacía</strong><span>Genera tu primer reporte: quedará guardado aquí con su fecha.</span></div>`;
}

async function onAction(e) {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  const r = active('report').find((x) => x.id === id); if (!r) return;
  if (b.dataset.a === 'open') openReport(r);
  if (b.dataset.a === 'print') openReport(r, true);
  if (b.dataset.a === 'del') {
    if (!await confirmDialog({ title: '¿Eliminar este reporte?', message: 'Irá a la papelera y podrás recuperarlo durante 30 días.', confirmLabel: 'Mover a la papelera', danger: true })) return;
    await moveToTrash('report', [id]);
    toast('Reporte movido a la papelera', 'ok', { action: { label: 'Deshacer', fn: () => restore('report', [id]) } });
  }
}

function openReport(r, print = false) {
  const m = openModal({
    title: r.titulo, wide: true,
    html: `<iframe class="report-frame" title="Reporte" sandbox="allow-modals allow-same-origin"></iframe>`,
    actions: [{ label: 'Imprimir', icon: 'print', cls: 'primary', fn: () => { m.el.querySelector('iframe').contentWindow.print(); return false; } }]
  });
  const frame = m.el.querySelector('iframe');
  frame.srcdoc = r.html;
  if (print) frame.onload = () => frame.contentWindow.print();
}

/* Reporte autónomo (se ve igual dentro de años) */
function buildHTML(titulo, notas, c) {
  const rowS = c.species.map((s) => `<tr><td><span class="dot" style="background:${groupOf(s.grupo).color}"></span>${esc(s.nombre)}</td><td><i>${esc(s.cientifico)}</i></td><td>${esc(s.estado)}</td><td class="n">${s.n}</td><td class="n">${pct(s.max)}</td></tr>`).join('');
  const rowA = c.alerts.map((a) => `<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.tipo)}</td><td>${esc(a.mensaje)}</td><td>${(+a.lat).toFixed(4)}, ${(+a.lng).toFixed(4)}</td><td>${a.atendida ? 'Atendida' : '<b style="color:#c8361f">Pendiente</b>'}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1b241d;max-width:860px;margin:0 auto;padding:36px 28px;background:#fbfaf5}
  header{border-bottom:3px solid #557a2a;padding-bottom:14px;margin-bottom:22px}
  .k{font:600 11px ui-monospace,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:#557a2a}
  h1{margin:6px 0 4px;font-size:30px} h2{font-size:19px;margin:28px 0 10px;border-bottom:1px solid #d3d9c8;padding-bottom:6px}
  .m{color:#56634f;font-size:14px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
  .kpis div{background:#fff;border:1px solid #d3d9c8;border-radius:10px;padding:12px}
  .kpis b{display:block;font:700 26px ui-monospace,Consolas,monospace} .kpis span{font-size:12px;color:#56634f}
  table{width:100%;border-collapse:collapse;font-size:13.5px;background:#fff}
  th,td{border-bottom:1px solid #e3e8da;padding:7px 8px;text-align:left;vertical-align:top} th{font:600 11px ui-monospace,Consolas,monospace;text-transform:uppercase;color:#56634f;background:#f3f5ee}
  td.n{text-align:right;font-family:ui-monospace,Consolas,monospace}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}
  .notes{white-space:pre-wrap;background:#fff;border-left:3px solid #c9861a;padding:12px 14px}
  footer{margin-top:34px;font:500 11px ui-monospace,Consolas,monospace;color:#8a9584}
  @media print{body{background:#fff;padding:0}}
</style></head><body>
<header><div class="k">Guardián · Estación de fauna · Reporte ambiental</div><h1>${esc(titulo)}</h1>
<div class="m">Período: ${fmtDay(c.from)} — ${fmtDay(c.to)} · Generado el ${fmtDate(Date.now())} por ${esc(auth.displayName)}</div></header>
<div class="kpis"><div><b>${c.sightings.length}</b><span>avistamientos</span></div><div><b>${c.species.length}</b><span>especies</span></div><div><b>${c.threatened.length}</b><span>especies amenazadas</span></div><div><b>${c.alerts.length}</b><span>alertas (${c.alerts.filter((a) => !a.atendida).length} pendientes)</span></div></div>
<h2>Resumen</h2>
<p>Durante el período se registraron <b>${c.sightings.length}</b> avistamientos de <b>${c.species.length}</b> especies${c.species[0] ? `; la más observada fue <b>${esc(c.species[0].nombre)}</b> (${c.species[0].n})` : ''}. ${c.threatened.length ? `Se observaron <b>${c.threatened.length}</b> especies con algún grado de amenaza: ${c.threatened.map((s) => esc(s.nombre)).join(', ')}.` : 'No se observaron especies amenazadas.'} Se generaron <b>${c.alerts.length}</b> alertas de posible caza furtiva.</p>
${notas ? `<h2>Notas del guardaparques</h2><div class="notes">${esc(notas)}</div>` : ''}
<h2>Especies observadas</h2>
${c.species.length ? `<table><tr><th>Especie</th><th>Nombre científico</th><th>Estado UICN</th><th>Avist.</th><th>Conf. máx.</th></tr>${rowS}</table>` : '<p class="m">Sin avistamientos en el período.</p>'}
<h2>Alertas</h2>
${c.alerts.length ? `<table><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Ubicación</th><th>Estado</th></tr>${rowA}</table>` : '<p class="m">Sin alertas en el período.</p>'}
<footer>Documento generado automáticamente por Guardián. Identificación por IA: verificar en campo las especies de interés.</footer>
</body></html>`;
}
