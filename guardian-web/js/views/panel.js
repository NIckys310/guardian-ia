/* =========================================================
   GUARDIÁN · Panel de inicio
   ========================================================= */
import { $, esc, ms, fmtRel, pct, animateCount, conservClass } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { openLightbox } from '../ui/lightbox.js';
import { groupBadge, conservChip } from '../ui/species-ui.js';
import { active, data, photoURL } from '../services/repo.js';
import { auth } from '../services/auth.js';
import { chartTheme, cssVar } from '../ui/charts.js';

let chart = null;

export function init() {
  if (typeof Chart !== 'undefined') {
    chartTheme();
    chart = new Chart($('#panelChart'), {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Avistamientos', data: [], backgroundColor: cssVar('--olive'), borderRadius: 6, maxBarThickness: 28 },
        { label: 'Alertas', data: [], backgroundColor: cssVar('--alert'), borderRadius: 6, maxBarThickness: 28 }
      ] },
      options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    });
  }
  ['data:sightings', 'data:alerts', 'data:devices'].forEach((e) => bus.on(e, () => { if ($('#view-panel').classList.contains('active')) render(); }));
}

export function show() { render(); }

async function render() {
  const now = new Date();
  const h = now.getHours();
  $('#heroDate').textContent = now.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#heroHello').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}, ${auth.displayName.split(' ')[0]}`;

  const sightings = active('sighting'), alerts = active('alert');
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const yest0 = today0.getTime() - 864e5;
  const today = sightings.filter((s) => ms(s.created_at) >= today0.getTime());
  const yest = sightings.filter((s) => ms(s.created_at) >= yest0 && ms(s.created_at) < today0.getTime());
  const species = new Set(sightings.map((s) => s.species_id || s.nombre));
  const pending = alerts.filter((a) => !a.atendida);
  const online = data.devices.filter((d) => !d.revoked_at && d.last_seen_at && Date.now() - ms(d.last_seen_at) < 5 * 60_000);

  animateCount($('[data-kpi="today"]'), today.length);
  animateCount($('[data-kpi="species"]'), species.size);
  animateCount($('[data-kpi="pending"]'), pending.length);
  animateCount($('[data-kpi="devices"]'), online.length);
  $('[data-kpi-foot="today"]').textContent = `Ayer: ${yest.length}`;
  $('[data-kpi-foot="species"]').textContent = `${sightings.length} avistamientos en total`;
  $('[data-kpi-foot="pending"]').textContent = pending.length ? `Última ${fmtRel(pending[0].created_at)}` : 'Todo en orden';
  $('[data-kpi-foot="devices"]').textContent = `${data.devices.filter((d) => !d.revoked_at).length} vinculados`;
  $('#heroSummary').textContent = pending.length
    ? `Tienes ${pending.length} alerta(s) pendiente(s). Hoy se registraron ${today.length} avistamientos.`
    : today.length ? `Hoy se registraron ${today.length} avistamientos de ${new Set(today.map((s) => s.nombre)).size} especies. Sin alertas pendientes.`
    : 'Todo tranquilo por ahora. Abre el escáner o conecta un celular para empezar a vigilar.';

  if (chart) {
    const days = [...Array(7)].map((_, i) => { const d = new Date(today0); d.setDate(d.getDate() - (6 - i)); return d; });
    const cnt = (arr, d) => arr.filter((x) => ms(x.created_at) >= d.getTime() && ms(x.created_at) < d.getTime() + 864e5).length;
    chart.data.labels = days.map((d) => d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }));
    chart.data.datasets[0].data = days.map((d) => cnt(sightings, d));
    chart.data.datasets[1].data = days.map((d) => cnt(alerts, d));
    chart.update();
  }

  $('#panelAlerts').innerHTML = alerts.slice(0, 4).map((a) => `
    <div class="mini-item alert" data-go="alertas"><span class="ph" style="color:var(--alert)">${icon('alert')}</span>
      <div><b>${esc(a.tipo)}${a.atendida ? ' · atendida' : ''}</b><small>${fmtRel(a.created_at)} · ${pct(a.conf)}</small></div><span>${icon('chevron')}</span></div>`).join('')
    || `<div class="empty">${icon('shield')}<span>Sin alertas.</span></div>`;

  const threatened = [...new Map(sightings.filter((s) => ['cr', 'vu'].includes(conservClass(s.estado))).map((s) => [s.species_id || s.nombre, s])).values()].slice(0, 4);
  $('#panelThreatened').innerHTML = threatened.map((s) => `
    <div class="mini-item" data-go="estadisticas"><span class="ph">${groupBadge(s.grupo, 30)}</span>
      <div><b>${esc(s.nombre)}</b><small>${fmtRel(s.created_at)}</small></div>${conservChip(s.estado)}</div>`).join('')
    || `<div class="empty">${icon('leaf')}<span>Aún no se registran especies amenazadas.</span></div>`;

  const last = sightings[0];
  if (!last) { $('#panelLast').innerHTML = `<div class="empty">${icon('paw')}<span>Aún no hay avistamientos.</span></div>`; return; }
  $('#panelLast').innerHTML = `
    <div class="last-sighting">
      <img class="thumb" alt="Foto de ${esc(last.nombre)}">
      <div>${groupBadge(last.grupo, 28)}<h5>${esc(last.nombre)}</h5><div class="sci">${esc(last.cientifico)}</div>
        <div class="row" style="margin-top:10px">${conservChip(last.estado)}<span class="chip">${pct(last.conf)}</span><span class="chip">${fmtRel(last.created_at)}</span></div></div>
    </div>`;
  const url = await photoURL(last);
  const im = $('#panelLast img');
  if (url && im) { im.src = url; im.onclick = () => openLightbox([{ src: url, caption: last.nombre }]); }
  else im?.remove();
}
