/* =========================================================
   GUARDIÁN · Mapa
   - Un pin por avistamiento con el ícono y color de su grupo
   - Guía de íconos: explica cada uno y permite mostrar/ocultar
   - Alertas (triángulo rojo que late si está pendiente)
   - Celulares vinculados y tu ubicación
   - Distribución natural de una especie (círculos punteados)
   ========================================================= */
import { $, esc, fmtDate, pct, ms } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { openLightbox } from '../ui/lightbox.js';
import { GROUPS, MAP_SPECIAL, groupOf, pinSVG, badgeSVG } from '../data/groups.js';
import { active, data, photoURL } from '../services/repo.js';
import { geo, DEFAULT_CENTER } from '../services/geo.js';
import { setMapCenterFn } from '../services/events.js';
import { findSpecies } from '../ui/species-ui.js';

let map, cluster, alertLayer, deviceLayer, rangeLayer, meMarker;
let rangeDays = 30, centeredOnMe = false;
const hidden = new Set(JSON.parse(localStorage.getItem('guardian.mapHidden') || '[]'));
const saveHidden = () => localStorage.setItem('guardian.mapHidden', JSON.stringify([...hidden]));

export function init() {
  if (typeof L === 'undefined') { $('#map').innerHTML = '<div class="empty" style="margin:24px">Sin conexión: el mapa se cargará cuando vuelva internet.</div>'; return; }
  map = L.map('map', { zoomControl: true, preferCanvas: true }).setView(geo.pos ? [geo.pos.lat, geo.pos.lng] : DEFAULT_CENTER, geo.pos ? 11 : 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  setMapCenterFn(() => map.getCenter());

  cluster = L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true,
    iconCreateFunction: (c) => {
      const kids = c.getAllChildMarkers();
      const alert = kids.some((m) => m.options.isAlert);
      const n = c.getChildCount(), size = n < 10 ? 36 : n < 50 ? 44 : 52;
      return L.divIcon({ html: `<div class="cluster ${alert ? 'has-alert' : ''}" style="width:${size}px;height:${size}px">${n}</div>`, className: '', iconSize: [size, size] });
    }
  }).addTo(map);
  alertLayer = cluster;               // las alertas comparten agrupación
  deviceLayer = L.layerGroup().addTo(map);
  rangeLayer = L.layerGroup().addTo(map);

  $('#mapRange').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    rangeDays = +b.dataset.r;
    $('#mapRange').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  });
  $('#btnMapFit').addEventListener('click', fitAll);
  $('#btnMapMe').addEventListener('click', () => {
    if (geo.pos) map.flyTo([geo.pos.lat, geo.pos.lng], 15, { duration: 0.8 });
    else bus.emit('toast', 'Activa la ubicación del navegador para ver dónde estás');
  });
  $('#btnMapLegend').addEventListener('click', () => $('#mapPanel').classList.toggle('open'));
  $('#btnMapPanelClose').addEventListener('click', () => $('#mapPanel').classList.remove('open'));

  bus.on('data:sightings', draw);
  bus.on('data:alerts', draw);
  bus.on('data:devices', drawDevices);
  bus.on('geo:update', drawMe);
  bus.on('map:range', (sp) => drawRange(sp));
  bus.on('map:focus', ({ lat, lng, zoom = 15 }) => setTimeout(() => map.flyTo([lat, lng], zoom, { duration: 0.8 }), 120));
  map.on('popupopen', onPopup);
  draw(); drawDevices(); drawMe();
}

export function show() {
  if (!map) return;
  setTimeout(() => map.invalidateSize(), 80);
}

const inRange = (r) => !rangeDays || ms(r.created_at) >= Date.now() - rangeDays * 864e5;

function draw() {
  if (!map) return;
  cluster.clearLayers();
  const sightings = active('sighting').filter(inRange);
  const alerts = active('alert').filter(inRange);
  const markers = [];
  sightings.forEach((s) => {
    const g = s.grupo || findSpecies(s.species_id)?.grupo || 'mamifero';
    if (hidden.has(g)) return;
    const grp = groupOf(g);
    const m = L.marker([s.lat, s.lng], {
      icon: L.divIcon({ className: 'pin', html: pinSVG(grp.color, grp.svg), iconSize: [38, 46], iconAnchor: [19, 45], popupAnchor: [0, -40] }),
      title: s.nombre, kind: 'sighting', rowId: s.id
    });
    m.bindPopup(popupHTML(s, grp), { maxWidth: 260 });
    markers.push(m);
  });
  if (!hidden.has('alerta')) {
    alerts.forEach((a) => {
      const sp = MAP_SPECIAL.alerta;
      const m = L.marker([a.lat, a.lng], {
        icon: L.divIcon({ className: 'pin' + (a.atendida ? '' : ' pending'), html: pinSVG(a.atendida ? '#7a8676' : sp.color, sp.svg), iconSize: [38, 46], iconAnchor: [19, 45], popupAnchor: [0, -40] }),
        title: a.tipo, kind: 'alert', rowId: a.id, isAlert: !a.atendida, zIndexOffset: 1000
      });
      m.bindPopup(alertPopupHTML(a), { maxWidth: 260 });
      markers.push(m);
    });
  }
  cluster.addLayers(markers);
  renderLegend(sightings, alerts);
}

function popupHTML(s, grp) {
  return `<div class="map-pop">
    ${s.photo || s.photo_path ? '<img alt="Foto del avistamiento" data-photo>' : ''}
    <b>${esc(s.nombre)}</b><i>${esc(s.cientifico)}</i>
    <div class="meta"><span>${badgeSVG(grp.color, grp.svg, 14)} ${esc(grp.nombre)}</span><span>${fmtDate(s.created_at)}</span><span>Confianza ${pct(s.conf)} · IA ${s.ia === 'claude' ? 'avanzada' : 'local'}</span><span>Fuente: ${esc(s.fuente)}</span></div>
    <div class="row"><button class="btn sm" data-range="${esc(s.species_id || '')}">${icon('map')}Distribución</button></div>
  </div>`;
}

function alertPopupHTML(a) {
  return `<div class="map-pop">
    ${a.photo || a.photo_path ? '<img alt="Foto de la alerta" data-photo>' : ''}
    <b style="color:var(--alert)">${esc(a.tipo)}</b><i>${esc(a.mensaje)}</i>
    <div class="meta"><span>${fmtDate(a.created_at)}</span><span>${a.atendida ? 'Atendida' : 'Pendiente'} · ${pct(a.conf)}</span></div>
  </div>`;
}

async function onPopup(e) {
  const mk = e.popup._source;
  const el = e.popup.getElement();
  const list = mk.options.kind === 'alert' ? active('alert') : active('sighting');
  const row = list.find((r) => r.id === mk.options.rowId);
  const img = el.querySelector('[data-photo]');
  if (img && row) {
    const url = await photoURL(row);
    if (url) { img.src = url; img.onclick = () => openLightbox([{ src: url, caption: row.nombre || row.tipo }]); }
    else img.remove();
  }
  el.querySelector('[data-range]')?.addEventListener('click', (ev) => {
    const sp = findSpecies(ev.currentTarget.dataset.range);
    if (sp) drawRange(sp); else bus.emit('toast', 'No hay datos de distribución para esta especie');
  });
}

/* ---------- Guía de íconos ---------- */
function renderLegend(sightings, alerts) {
  const counts = {};
  sightings.forEach((s) => { const g = s.grupo || findSpecies(s.species_id)?.grupo || 'mamifero'; counts[g] = (counts[g] || 0) + 1; });
  const item = (id, g, desc, n, toggle = true) => `
    <button class="legend-item ${hidden.has(id) ? 'off' : ''}" ${toggle ? `data-g="${id}"` : 'disabled'} title="${toggle ? 'Toca para mostrar u ocultar' : ''}">
      ${badgeSVG(g.color === '#ffffff' ? '#4aa3ff' : g.color, g.svg, 30)}
      <span><b>${esc(g.nombre)}</b><small>${esc(desc)}</small></span>
      <span class="count">${n ?? ''}</span>
    </button>`;
  const pending = alerts.filter((a) => !a.atendida).length;
  $('#mapLegend').innerHTML = `
    <div class="legend-sep">Animales (color por grupo)</div>
    ${Object.entries(GROUPS).map(([id, g]) => item(id, g, g.ejemplo, counts[id] || 0)).join('')}
    <div class="legend-sep">Otros íconos</div>
    ${item('alerta', MAP_SPECIAL.alerta, `${pending} pendiente(s) · gris = atendida`, alerts.length)}
    ${item('dispositivo', MAP_SPECIAL.dispositivo, MAP_SPECIAL.dispositivo.descripcion, data.devices.filter((d) => d.last_lat).length, false)}
    ${item('yo', MAP_SPECIAL.yo, MAP_SPECIAL.yo.descripcion, null, false)}
    <div class="legend-item" style="cursor:default"><svg width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="12" fill="rgba(231,169,59,.18)" stroke="#e7a93b" stroke-dasharray="4 3" stroke-width="2"/></svg><span><b>Distribución natural</b><small>Dónde vive la especie elegida</small></span><span></span></div>`;
  $('#mapLegend').onclick = (e) => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const g = b.dataset.g;
    hidden.has(g) ? hidden.delete(g) : hidden.add(g);
    saveHidden(); draw();
  };
}

function drawDevices() {
  if (!map) return;
  deviceLayer.clearLayers();
  const sp = MAP_SPECIAL.dispositivo;
  data.devices.filter((d) => d.last_lat && !d.revoked_at).forEach((d) => {
    L.marker([d.last_lat, d.last_lng], { icon: L.divIcon({ className: 'pin', html: pinSVG(sp.color, sp.svg, 32), iconSize: [32, 38], iconAnchor: [16, 37], popupAnchor: [0, -32] }) })
      .bindPopup(`<div class="map-pop"><b>${esc(d.nombre)}</b><div class="meta"><span>Último contacto: ${fmtDate(d.last_seen_at)}</span></div></div>`)
      .addTo(deviceLayer);
  });
}

function drawMe() {
  if (!map || !geo.pos) return;
  const ll = [geo.pos.lat, geo.pos.lng];
  if (!meMarker) meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }), zIndexOffset: 2000, title: 'Tu ubicación' }).addTo(map);
  else meMarker.setLatLng(ll);
  if (!centeredOnMe) { centeredOnMe = true; if (!active('sighting').length) map.setView(ll, 12); }
}

function drawRange(sp) {
  if (!map || !sp) return;
  rangeLayer.clearLayers();
  if (!sp.zonas?.length) { bus.emit('toast', 'No hay datos de distribución para ' + sp.nombre); return; }
  const circles = sp.zonas.map(([lat, lng, km]) => L.circle([lat, lng], { radius: km * 1000, color: '#e7a93b', weight: 2, dashArray: '6 6', fillColor: '#e7a93b', fillOpacity: 0.12 })
    .bindTooltip(`Distribución de ${esc(sp.nombre)}`).addTo(rangeLayer));
  setTimeout(() => { map.invalidateSize(); map.flyToBounds(L.featureGroup(circles).getBounds(), { padding: [40, 40], duration: 0.9 }); }, 150);
}

function fitAll() {
  if (!map) return;
  const b = cluster.getBounds();
  if (b.isValid()) map.flyToBounds(b, { padding: [40, 40], duration: 0.8 });
}
