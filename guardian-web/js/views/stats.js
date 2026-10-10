/* =========================================================
   GUARDIÁN · Estadísticas dinámicas
   - Filtros por rango y grupo; todo se actualiza en vivo.
   - Tocar una barra o una fila filtra por esa especie.
   ========================================================= */
import { $, $$, esc, ms, pct, fmtRel, animateCount, conservClass } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { GROUPS, groupOf } from '../data/groups.js';
import { active } from '../services/repo.js';
import { groupBadge, conservChip, groupOptions, findSpecies } from '../ui/species-ui.js';
import { chartTheme, cssVar } from '../ui/charts.js';

let range = 7, group = '', speciesFilter = '', charts = {};

export function init() {
  $('#statsGroup').insertAdjacentHTML('beforeend', groupOptions());
  $('#statsRange').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    range = +b.dataset.r;
    $$('#statsRange button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  $('#statsGroup').addEventListener('change', (e) => { group = e.target.value; speciesFilter = ''; render(); });
  $('#speciesTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-sp]'); if (!tr) return;
    speciesFilter = speciesFilter === tr.dataset.sp ? '' : tr.dataset.sp;
    render();
  });
  if (typeof Chart === 'undefined') return;
  chartTheme();
  charts.species = new Chart($('#chartSpecies'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderRadius: 6, maxBarThickness: 26 }] },
    options: {
      indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { ticks: { precision: 0 }, grid: { color: cssVar('--line') } }, y: { grid: { display: false } } },
      onClick: (_, els) => { if (els[0]) { const id = charts.species.$ids[els[0].index]; speciesFilter = speciesFilter === id ? '' : id; render(); } }
    }
  });
  charts.days = new Chart($('#chartDays'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Avistamientos', data: [], borderColor: cssVar('--olive'), backgroundColor: hexA(cssVar('--olive'), .18), fill: true, tension: .35, pointRadius: 3 },
      { label: 'Alertas', data: [], borderColor: cssVar('--alert'), backgroundColor: hexA(cssVar('--alert'), .12), fill: true, tension: .35, pointRadius: 3 }
    ] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--line') } }, x: { grid: { display: false } } } }
  });
  charts.status = new Chart($('#chartStatus'), {
    type: 'doughnut',
    data: { labels: ['En peligro / crítico', 'Vulnerable / casi amenazado', 'Preocupación menor', 'Sin evaluar / doméstico'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#e5533d', '#e7a93b', '#8fb35a', '#7a8676'], borderWidth: 0, hoverOffset: 8 }] },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' } } }
  });
  charts.hours = new Chart($('#chartHours'), {
    type: 'bar',
    data: { labels: [...Array(24)].map((_, h) => `${h}h`), datasets: [{ label: 'Avistamientos', data: [], backgroundColor: cssVar('--info'), borderRadius: 4 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: cssVar('--line') } }, x: { grid: { display: false } } } }
  });
  ['data:sightings', 'data:alerts'].forEach((ev) => bus.on(ev, () => { if ($('#view-estadisticas').classList.contains('active')) { render(); flash(); } }));
  bus.on('settings:change', () => { chartTheme(); Object.values(charts).forEach((c) => c.update('none')); });
}

export function show() { render(); }

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}
function flash() { const l = $('#statsLive'); l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash'); }

const gOf = (s) => s.grupo || findSpecies(s.species_id)?.grupo || 'mamifero';

function render() {
  const from = range ? Date.now() - range * 864e5 : 0;
  const prevFrom = range ? from - range * 864e5 : 0;
  let sightings = active('sighting').filter((s) => ms(s.created_at) >= from && (!group || gOf(s) === group));
  const prev = range ? active('sighting').filter((s) => ms(s.created_at) >= prevFrom && ms(s.created_at) < from && (!group || gOf(s) === group)) : [];
  if (speciesFilter) sightings = sightings.filter((s) => s.species_id === speciesFilter);
  const alerts = active('alert').filter((a) => ms(a.created_at) >= from);

  const groups = bySpecies(sightings);
  const threatN = sightings.filter((s) => ['cr', 'vu'].includes(conservClass(s.estado))).length;
  setKpi('total', sightings.length, trend(sightings.length, prev.length));
  setKpi('species', groups.length, speciesFilter ? `Filtrando: ${esc(findSpecies(speciesFilter)?.nombre || speciesFilter)}` : `${Object.keys(GROUPS).filter((g) => sightings.some((s) => gOf(s) === g)).length} grupos`);
  setKpi('threat', threatN, sightings.length ? `${pct(threatN / sightings.length)} del total` : '—');
  setKpi('alerts', alerts.length, `${alerts.filter((a) => !a.atendida).length} pendientes`);

  if (charts.species) {
    const top = groups.slice(0, 12);
    charts.species.$ids = top.map((g) => g.id);
    charts.species.data.labels = top.map((g) => g.nombre);
    charts.species.data.datasets[0].data = top.map((g) => g.n);
    charts.species.data.datasets[0].backgroundColor = top.map((g) => groupOf(g.grupo).color + (speciesFilter && speciesFilter !== g.id ? '55' : ''));
    charts.species.update();

    const days = timeBuckets(range);
    $('#chartDaysSub').textContent = days.label;
    charts.days.data.labels = days.labels;
    charts.days.data.datasets[0].data = days.count(sightings);
    charts.days.data.datasets[1].data = days.count(alerts);
    charts.days.update();

    const st = [0, 0, 0, 0];
    sightings.forEach((s) => { st[{ cr: 0, vu: 1, lc: 2, na: 3 }[conservClass(s.estado)]]++; });
    charts.status.data.datasets[0].data = st;
    charts.status.update();

    const hours = Array(24).fill(0);
    sightings.forEach((s) => { hours[new Date(ms(s.created_at)).getHours()]++; });
    charts.hours.data.datasets[0].data = hours;
    charts.hours.update();
  }

  const max = Math.max(1, ...groups.map((g) => g.n));
  $('#statsTableSub').textContent = `${groups.length} especies`;
  $('#speciesTable').innerHTML = groups.length ? groups.map((g) => `
    <tr data-sp="${esc(g.id)}" class="${speciesFilter === g.id ? 'selected' : ''}">
      <td><div class="sp">${groupBadge(g.grupo, 26)}<div><b>${esc(g.nombre)}</b> <i>${esc(g.cientifico)}</i><span class="bar" style="width:${(g.n / max) * 100}%;background:${groupOf(g.grupo).color}"></span></div></div></td>
      <td>${esc(groupOf(g.grupo).nombre)}</td><td>${conservChip(g.estado)}</td>
      <td class="num">${g.n}</td><td class="num">${pct(g.max)}</td><td>${fmtRel(g.last)}</td>
    </tr>`).join('')
    : '<tr><td colspan="6" class="muted">No hay avistamientos en este período. Prueba otro rango o enciende el Escáner.</td></tr>';
}

function setKpi(k, v, foot) {
  const el = $(`[data-s="${k}"]`);
  const before = el.dataset.v;
  animateCount(el, v);
  if (before !== undefined && +before !== v) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  $(`[data-sf="${k}"]`).innerHTML = foot;
}

function trend(now, before) {
  if (!range) return 'desde el inicio';
  if (!before) return now ? '<span class="trend up">▲ nuevo</span> vs. período anterior' : 'sin datos en el período anterior';
  const d = Math.round(((now - before) / before) * 100);
  return `<span class="trend ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</span> vs. período anterior`;
}

function bySpecies(rows) {
  const g = {};
  rows.forEach((s) => {
    const e = g[s.species_id || s.nombre] ||= { id: s.species_id || s.nombre, nombre: s.nombre, cientifico: s.cientifico, estado: s.estado, grupo: gOf(s), n: 0, max: 0, last: 0 };
    e.n++; e.max = Math.max(e.max, +s.conf); e.last = Math.max(e.last, ms(s.created_at));
  });
  return Object.values(g).sort((a, b) => b.n - a.n);
}

/* Agrupa por hora (24 h), por día (7/30 días) o por mes (1 año / todo) */
function timeBuckets(days) {
  const now = new Date();
  if (days === 1) {
    const start = new Date(now); start.setMinutes(0, 0, 0); start.setHours(start.getHours() - 23);
    const labels = [...Array(24)].map((_, i) => new Date(start.getTime() + i * 36e5).getHours() + 'h');
    return { label: 'por hora', labels, count: (arr) => labels.map((_, i) => arr.filter((x) => { const t = ms(x.created_at) - start.getTime(); return t >= i * 36e5 && t < (i + 1) * 36e5; }).length) };
  }
  if (days && days <= 31) {
    const ds = [...Array(days)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1 - i)); return d; });
    return { label: 'por día', labels: ds.map((d) => d.toLocaleDateString('es-CO', days <= 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' })),
      count: (arr) => ds.map((d) => arr.filter((x) => ms(x.created_at) >= d.getTime() && ms(x.created_at) < d.getTime() + 864e5).length) };
  }
  const n = days ? 12 : 24;
  const ms0 = [...Array(n)].map((_, i) => new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1));
  return { label: 'por mes', labels: ms0.map((d) => d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })),
    count: (arr) => ms0.map((d, i) => { const end = ms0[i + 1]?.getTime() ?? Infinity; return arr.filter((x) => ms(x.created_at) >= d.getTime() && ms(x.created_at) < end).length; }) };
}
