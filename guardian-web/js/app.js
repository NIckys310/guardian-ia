/* =========================================================
   GUARDIÁN · Lógica principal
   IA local (en el navegador):
     - MobileNet v2  -> clasifica la especie (1000 clases ImageNet)
     - COCO-SSD      -> detecta objetos con recuadros (animales, personas, vehículos)
   IA avanzada (opcional): Claude con visión identifica cualquier especie.
   ========================================================= */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* Clases de COCO que generan alerta en "zona protegida" */
const THREATS = { person: 'Persona', car: 'Vehículo', truck: 'Camión', motorcycle: 'Motocicleta', knife: 'Arma blanca', boat: 'Embarcación' };
const COCO_ANIMALS = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'];
const SIGHTING_COOLDOWN = 30_000;   // no repetir la misma especie antes de 30 s
const ALERT_COOLDOWN = 20_000;      // no repetir el mismo tipo de alerta antes de 20 s
const SCAN_INTERVAL = 1500;         // escaneo automático cada 1,5 s
const DEFAULT_CENTER = [4.6, -74.08];

/* ---------- Almacenamiento local ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('No se pudo guardar', e); } }
};

const state = {
  sightings: store.get('guardian.sightings', []),
  alerts: store.get('guardian.alerts', []),
  settings: Object.assign(
    { webhook: '', apiKey: '', model: 'claude-sonnet-5-5', minConf: 0.3, notify: true, sound: true },
    store.get('guardian.settings', {})
  ),
  models: { mobilenet: null, coco: null },
  stream: null, source: null, busy: false, timer: null,
  pos: null, lastSeen: {}, lastAlert: {}, current: null, unseen: 0
};

let map, layers = {}, charts = {};

/* =========================================================
   INICIO
   ========================================================= */
document.addEventListener('DOMContentLoaded', init);

/* =========================================================
   APP INSTALABLE (PWA)
   ========================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
}
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btnInstall').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  $('#btnInstall').classList.add('hidden');
  toast('Guardián quedó instalado. Búscalo en el menú Inicio o en el escritorio.', 'ok');
});
document.addEventListener('DOMContentLoaded', () => {
  $('#btnInstall').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#btnInstall').classList.add('hidden');
  });
});

async function init() {
  setupTabs();
  setupSettings();
  setupScanner();
  setupReports();
  initMap();
  initCharts();
  renderAll();
  watchLocation();
  await listCameras();
  await loadModels();
}

async function loadModels() {
  if (typeof tf === 'undefined' || typeof mobilenet === 'undefined' || typeof cocoSsd === 'undefined') {
    setStatus('Sin conexión: no se pudieron descargar los modelos de IA', 'err');
    return;
  }
  try {
    setStatus('Cargando modelos de IA…', 'loading');
    await tf.ready();
    const [mn, coco] = await Promise.all([
      mobilenet.load({ version: 2, alpha: 1.0 }),
      cocoSsd.load({ base: 'lite_mobilenet_v2' })
    ]);
    state.models.mobilenet = mn;
    state.models.coco = coco;
    setStatus(`IA lista (${tf.getBackend()})`, 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Error al cargar la IA: ' + e.message, 'err');
  }
}

/* =========================================================
   PESTAÑAS
   ========================================================= */
function setupTabs() {
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
}
function switchTab(name) {
  $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'map') setTimeout(() => map.invalidateSize(), 60);
  if (name === 'alerts') { state.unseen = 0; renderBadge(); }
  if (name === 'stats') renderStats();
}

/* =========================================================
   CÁMARAS Y FUENTES DE VIDEO
   (un dron conectado por USB/HDMI o capturadora aparece como cámara)
   ========================================================= */
async function listCameras() {
  const sel = $('#sourceSelect');
  const prev = sel.value;
  let cams = [];
  try {
    cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch { /* sin permisos todavía */ }
  sel.innerHTML = '';
  if (!cams.length) sel.append(new Option('Cámara predeterminada', ''));
  cams.forEach((c, i) => sel.append(new Option(c.label || `Cámara ${i + 1}`, c.deviceId)));
  sel.append(new Option('Cámara IP / dron (URL)', 'ipcam'));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function setupScanner() {
  $('#sourceSelect').addEventListener('change', () => {
    const isIp = $('#sourceSelect').value === 'ipcam';
    $('#ipcamRow').classList.toggle('hidden', !isIp);
    if (!isIp && state.stream) startCamera();
  });
  $('#btnStart').addEventListener('click', startCamera);
  $('#btnStop').addEventListener('click', stopCamera);
  $('#btnIpcam').addEventListener('click', connectIpcam);
  $('#fileInput').addEventListener('change', loadPhoto);
  $('#btnSnap').addEventListener('click', () => analyze(false));
  $('#btnClaude').addEventListener('click', identifyWithClaude);
  $('#autoScan').addEventListener('change', updateScanningIndicator);
}

async function startCamera() {
  const val = $('#sourceSelect').value;
  if (val === 'ipcam') { $('#ipcamRow').classList.remove('hidden'); $('#ipcamUrl').focus(); return; }
  stopCamera();
  askNotificationPermission();
  try {
    const video = val
      ? { deviceId: { exact: val }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } };
    state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const v = $('#video');
    v.srcObject = state.stream;
    await v.play();
    showMedia('video');
    await listCameras();
    startLoop();
    toast('Cámara encendida', 'ok');
  } catch (e) {
    toast('No se pudo abrir la cámara: ' + e.message + '. Revisa los permisos del navegador.', 'err');
  }
}

function stopCamera() {
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  $('#video').srcObject = null;
  if (state.source === 'ipcam') $('#ipcam').src = '';
  if (state.source === 'video' || state.source === 'ipcam') {
    state.source = null;
    ['video', 'ipcam'].forEach((id) => $('#' + id).classList.add('hidden'));
    $('#placeholder').classList.remove('hidden');
    clearOverlay();
  }
  clearInterval(state.timer);
  updateScanningIndicator();
}

function connectIpcam() {
  const url = $('#ipcamUrl').value.trim();
  if (!url) return toast('Escribe la URL de la cámara', 'err');
  stopCamera();
  const img = $('#ipcam');
  img.onerror = () => toast('No se pudo conectar. Verifica la URL y que el equipo esté en la misma red.', 'err');
  img.src = url;
  showMedia('ipcam');
  startLoop();
  toast('Conectando con la cámara remota…');
}

function loadPhoto(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const img = $('#photo');
  img.onload = () => { showMedia('photo'); analyze(false); };
  img.src = URL.createObjectURL(file);
  ev.target.value = '';
}

function showMedia(kind) {
  ['video', 'photo', 'ipcam'].forEach((id) => $('#' + id).classList.toggle('hidden', id !== kind));
  $('#placeholder').classList.add('hidden');
  state.source = kind;
  clearOverlay();
  updateScanningIndicator();
}

function getSourceEl() {
  return state.source ? $('#' + state.source) : null;
}

function startLoop() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    if ($('#autoScan').checked && (state.source === 'video' || state.source === 'ipcam')) analyze(true);
  }, SCAN_INTERVAL);
  updateScanningIndicator();
}

function updateScanningIndicator() {
  const live = state.source === 'video' || state.source === 'ipcam';
  $('#viewer').classList.toggle('scanning', live && $('#autoScan').checked);
}

/* =========================================================
   RECONOCIMIENTO CON IA
   ========================================================= */
async function analyze(auto = false) {
  const el = getSourceEl();
  const { mobilenet: mn, coco } = state.models;
  if (!el) { if (!auto) toast('Enciende la cámara o sube una foto primero'); return; }
  if (!mn || !coco) { if (!auto) toast('La IA todavía se está cargando'); return; }
  if (state.busy) return;
  const w = el.videoWidth || el.naturalWidth;
  if (!w) return;

  state.busy = true;
  try {
    const [preds, dets] = await Promise.all([mn.classify(el, 5), coco.detect(el, 20, 0.45)]);
    drawBoxes(el, dets);
    renderPredictions(preds, dets);

    // 1) Detección de posibles cazadores furtivos
    if ($('#protectedMode').checked) {
      const threat = dets.filter((d) => THREATS[d.class] && d.score >= 0.6).sort((a, b) => b.score - a.score)[0];
      if (threat) raiseAlert(threat.class, threat.score);
    }

    // 2) Identificación de la especie
    let sp = null, conf = 0;
    for (const p of preds) {
      if (p.probability < state.settings.minConf) break;
      const m = matchSpecies(p.className);
      if (m) { sp = m; conf = p.probability; break; }
    }
    if (!sp) {
      const a = dets.filter((d) => COCO_ANIMALS.includes(d.class)).sort((x, y) => y.score - x.score)[0];
      if (a) { sp = SPECIES.find((s) => s.coco === a.class) || null; conf = a.score; }
    }

    if (sp) {
      if (!auto || state.current?.id !== sp.id) showSpecies(sp, conf, 'IA local');
      recordSighting(sp, conf);
    } else if (!auto) {
      showUnknown(preds[0]);
    }
  } catch (e) {
    console.error(e);
    if (!auto) {
      const msg = e.name === 'SecurityError'
        ? 'La cámara remota no permite leer sus imágenes (CORS). Usa una app de cámara IP que habilite CORS.'
        : 'Error al analizar: ' + e.message;
      toast(msg, 'err');
    }
  } finally {
    state.busy = false;
  }
}

function matchSpecies(className) {
  const name = className.toLowerCase();
  return SPECIES.find((sp) => sp.match.some((k) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(name))) || null;
}

function drawBoxes(el, dets) {
  const c = $('#overlay');
  const ctx = c.getContext('2d');
  const w = el.videoWidth || el.naturalWidth;
  const h = el.videoHeight || el.naturalHeight;
  c.width = w; c.height = h;
  ctx.clearRect(0, 0, w, h);
  const fs = Math.max(14, Math.round(w / 48));
  ctx.font = `600 ${fs}px Archivo, sans-serif`;
  ctx.lineWidth = Math.max(2, w / 320);
  dets.forEach((d) => {
    const [x, y, bw, bh] = d.bbox;
    const color = THREATS[d.class] ? '#ef5b4c' : COCO_ANIMALS.includes(d.class) ? '#6cc596' : '#e9a23b';
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, bw, bh);
    const label = `${COCO_ES[d.class] || d.class} ${Math.round(d.score * 100)}%`;
    const tw = ctx.measureText(label).width + 12;
    const ty = y > fs + 10 ? y - fs - 8 : y;
    ctx.fillStyle = color;
    ctx.fillRect(x, ty, tw, fs + 8);
    ctx.fillStyle = '#10292c';
    ctx.fillText(label, x + 6, ty + fs + 1);
  });
}

function clearOverlay() {
  const c = $('#overlay');
  c.getContext('2d').clearRect(0, 0, c.width, c.height);
}

function renderPredictions(preds, dets) {
  const chips = preds.slice(0, 3).map((p) =>
    `<span class="pred"><b>${esc(p.className.split(',')[0])}</b> ${Math.round(p.probability * 100)}%</span>`);
  const threats = dets.filter((d) => THREATS[d.class]).length;
  if (threats) chips.push(`<span class="pred" style="color:var(--alert)"><b>${threats}</b> persona(s)/vehículo(s) en escena</span>`);
  $('#predictions').innerHTML = chips.join('');
}

/* =========================================================
   FICHA DE ESPECIE
   ========================================================= */
function conservClass(estado = '') {
  if (/\((CR|EN|EW|EX)\)|crítico|peligro/i.test(estado)) return 'cr';
  if (/\((VU|NT)\)|amenazad/i.test(estado)) return 'vu';
  if (/\(LC\)/.test(estado)) return 'lc';
  return 'na';
}

function showSpecies(sp, conf, fuente) {
  state.current = sp;
  const count = state.sightings.filter((s) => s.speciesId === sp.id).length;
  $('#infoPanel').innerHTML = `
    <article class="plate">
      <div class="src"><span>Identificado con ${esc(fuente)}</span><span>Confianza ${Math.round(conf * 100)}%</span></div>
      <h2>${esc(sp.nombre)}</h2>
      <div class="sci">${esc(sp.cientifico)}</div>
      <span class="conserv ${conservClass(sp.estado)}">${esc(sp.estado)}</span>
      <dl>
        <div><dt>Hábitat</dt><dd>${esc(sp.habitat)}</dd></div>
        <div><dt>Reproducción</dt><dd>${esc(sp.reproduccion)}</dd></div>
        <div><dt>Alimentación</dt><dd>${esc(sp.dieta)}</dd></div>
        <div><dt>Distribución</dt><dd>${esc(sp.distribucion)}</dd></div>
      </dl>
      <div class="plate-actions">
        <button class="btn primary" id="btnRange">Ver distribución en el mapa</button>
        <button class="btn" id="btnStatsSp">Ver estadísticas</button>
      </div>
      <div class="meta">Avistamientos registrados de esta especie: ${count}</div>
    </article>`;
  $('#btnRange').onclick = () => { drawRange(sp); switchTab('map'); };
  $('#btnStatsSp').onclick = () => switchTab('stats');
  drawRange(sp, false);
}

async function showUnknown(pred) {
  state.current = null;
  if (!pred) return;
  const term = pred.className.split(',')[0];
  $('#infoPanel').innerHTML = `
    <article class="plate">
      <div class="src"><span>Sin ficha local</span><span>${Math.round(pred.probability * 100)}%</span></div>
      <h2>${esc(term)}</h2>
      <p id="wikiText" class="meta">Buscando información…</p>
      <div class="plate-actions"><button class="btn primary" id="btnClaude2">Identificar con IA avanzada</button></div>
    </article>`;
  $('#btnClaude2').onclick = identifyWithClaude;
  const txt = await fetchWiki(term);
  const p = $('#wikiText');
  if (p) p.textContent = txt || 'No hay información disponible. Prueba la IA avanzada para identificar la especie exacta.';
}

/* Resumen de Wikipedia en español (gratis, sin clave) */
async function fetchWiki(term) {
  try {
    const s = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*&srlimit=1`).then((r) => r.json());
    const title = s?.query?.search?.[0]?.title;
    if (!title) return '';
    const sum = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).then((r) => r.json());
    return sum.extract || '';
  } catch { return ''; }
}

/* IA avanzada: Claude con visión identifica la especie y genera la ficha */
async function identifyWithClaude() {
  const { apiKey, model } = state.settings;
  if (!apiKey) { toast('Agrega tu API key de Anthropic en Ajustes', 'err'); switchTab('settings'); return; }
  if (!getSourceEl()) return toast('Enciende la cámara o sube una foto primero');
  const img = snapshot(1024, 0.85);
  if (!img) return toast('No se puede leer la imagen de esta cámara (CORS)', 'err');

  $('#infoPanel').innerHTML = '<div class="plate"><p class="loading-line" style="color:#4a5a55">Consultando a la IA avanzada…</p></div>';
  const prompt = `Eres un biólogo experto en fauna silvestre. Analiza la imagen.
Responde SOLO con JSON válido, sin texto adicional ni bloques de código, con esta forma exacta:
{"es_animal":true,"nombre":"nombre común en español","cientifico":"nombre científico","confianza":0.0,
"estado":"categoría UICN en español con su sigla, ej. Vulnerable (VU)","habitat":"","reproduccion":"","dieta":"","distribucion":"",
"lat":0,"lng":0,"amenaza_humana":false,"motivo_amenaza":""}
lat/lng: un punto representativo de su distribución natural.
amenaza_humana: true solo si ves armas, trampas, animales cazados o personas cazando.
Si no hay ningún animal, responde es_animal=false.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model, max_tokens: 1000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.split(',')[1] } },
          { type: 'text', text: prompt }
        ] }]
      })
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const j = JSON.parse(text.replace(/```json|```/g, '').trim());

    if (j.amenaza_humana) raiseAlert('ia', 0.9, j.motivo_amenaza || 'Posible actividad de caza detectada por IA');
    if (!j.es_animal) {
      $('#infoPanel').innerHTML = '<div class="plate"><h2>Sin animales</h2><p class="meta">La IA no encontró ningún animal en la imagen.</p></div>';
      return;
    }
    const local = SPECIES.find((s) => s.cientifico.toLowerCase() === (j.cientifico || '').toLowerCase());
    const sp = local || {
      id: 'ia-' + slug(j.cientifico || j.nombre),
      nombre: j.nombre, cientifico: j.cientifico, estado: j.estado,
      habitat: j.habitat, reproduccion: j.reproduccion, dieta: j.dieta, distribucion: j.distribucion,
      zonas: (j.lat || j.lng) ? [[j.lat, j.lng, 600]] : [], match: []
    };
    const conf = Number(j.confianza) || 0.8;
    showSpecies(sp, conf, 'IA avanzada');
    state.lastSeen[sp.id] = 0;
    recordSighting(sp, conf);
  } catch (e) {
    console.error(e);
    $('#infoPanel').innerHTML = `<div class="plate"><h2>No se pudo identificar</h2><p class="meta">${esc(e.message)}</p></div>`;
  }
}

/* =========================================================
   AVISTAMIENTOS Y ALERTAS
   ========================================================= */
function currentPos() {
  if (state.pos) return state.pos;
  const c = map ? map.getCenter() : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
  return { lat: c.lat, lng: c.lng, aprox: true };
}

function recordSighting(sp, conf) {
  const now = Date.now();
  if (now - (state.lastSeen[sp.id] || 0) < SIGHTING_COOLDOWN) return;
  state.lastSeen[sp.id] = now;
  const pos = currentPos();
  const s = {
    id: uid(), speciesId: sp.id, nombre: sp.nombre, cientifico: sp.cientifico, estado: sp.estado,
    conf: +conf.toFixed(3), lat: pos.lat, lng: pos.lng, time: now, fuente: state.source || 'foto'
  };
  state.sightings.push(s);
  store.set('guardian.sightings', state.sightings);
  addSightingMarker(s);
  renderStats();
  toast(`Avistamiento registrado: ${sp.nombre}`, 'ok');
}

function raiseAlert(cls, conf, customMsg) {
  const now = Date.now();
  if (now - (state.lastAlert[cls] || 0) < ALERT_COOLDOWN) return;
  state.lastAlert[cls] = now;
  const pos = currentPos();
  const tipo = THREATS[cls] || 'Amenaza';
  const a = {
    id: uid(), tipo, clase: cls, conf: +conf.toFixed(3), lat: pos.lat, lng: pos.lng, time: now,
    mensaje: customMsg || `Se detectó: ${tipo.toLowerCase()} en zona protegida. Posible caza furtiva.`,
    foto: snapshot(320, 0.6), atendida: false
  };
  state.alerts.unshift(a);
  if (state.alerts.length > 60) state.alerts.length = 60;   // límite para no llenar el almacenamiento
  store.set('guardian.alerts', state.alerts);
  addAlertMarker(a);
  renderAlerts();
  renderStats();
  state.unseen++;
  renderBadge();
  if (state.settings.sound) beep();
  notify('Guardián: alerta', a.mensaje);
  sendWebhook({ evento: 'alerta', ...a, foto: undefined });
  toast(a.mensaje, 'err');
}

function snapshot(maxW = 640, quality = 0.7) {
  const el = getSourceEl();
  if (!el) return null;
  const w = el.videoWidth || el.naturalWidth, h = el.videoHeight || el.naturalHeight;
  if (!w) return null;
  const scale = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  try {
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch { return null; }
}

/* ---------- Integración con otros dispositivos ---------- */
function sendWebhook(payload) {
  const url = state.settings.webhook;
  if (!url) return;
  // text/plain + no-cors evita bloqueos CORS en servidores sencillos
  fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) })
    .catch((e) => console.warn('Webhook falló', e));
}

function askNotificationPermission() {
  if (state.settings.notify && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: 'assets/guardian.svg' }); } catch { /* algunos navegadores lo bloquean */ }
}

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch { /* sin audio */ }
}

/* =========================================================
   MAPA
   ========================================================= */
function initMap() {
  map = L.map('map').setView(DEFAULT_CENTER, 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap'
  }).addTo(map);
  layers.sight = L.layerGroup().addTo(map);
  layers.alerts = L.layerGroup().addTo(map);
  layers.range = L.layerGroup().addTo(map);
  L.control.layers(null, { 'Avistamientos': layers.sight, 'Alertas': layers.alerts, 'Distribución': layers.range }).addTo(map);
  state.sightings.forEach(addSightingMarker);
  state.alerts.forEach(addAlertMarker);
}

function addSightingMarker(s) {
  L.circleMarker([s.lat, s.lng], { radius: 8, color: '#6cc596', fillColor: '#6cc596', fillOpacity: 0.7, weight: 2 })
    .bindPopup(`<b>${esc(s.nombre)}</b><br><i>${esc(s.cientifico)}</i><br>${fmtDate(s.time)}<br>Confianza ${Math.round(s.conf * 100)}%`)
    .addTo(layers.sight);
}
function addAlertMarker(a) {
  L.circleMarker([a.lat, a.lng], { radius: 10, color: '#ef5b4c', fillColor: '#ef5b4c', fillOpacity: 0.8, weight: 2 })
    .bindPopup(`<b>${esc(a.tipo)}</b><br>${esc(a.mensaje)}<br>${fmtDate(a.time)}`)
    .addTo(layers.alerts);
}
function drawRange(sp, fit = true) {
  layers.range.clearLayers();
  if (!sp.zonas?.length) return;
  const circles = sp.zonas.map(([lat, lng, km]) =>
    L.circle([lat, lng], { radius: km * 1000, color: '#e9a23b', fillColor: '#e9a23b', fillOpacity: 0.18, weight: 1 })
      .bindPopup(`Distribución aproximada de ${esc(sp.nombre)}`).addTo(layers.range));
  if (fit) setTimeout(() => map.fitBounds(L.featureGroup(circles).getBounds(), { padding: [30, 30] }), 80);
}

function watchLocation() {
  if (!('geolocation' in navigator)) return;
  let centered = false;
  navigator.geolocation.watchPosition((p) => {
    state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    if (!centered) { map.setView([state.pos.lat, state.pos.lng], 12); centered = true; }
  }, () => { /* sin permiso: se usa el centro del mapa */ }, { enableHighAccuracy: true });
}

/* =========================================================
   ESTADÍSTICAS Y REPORTES
   ========================================================= */
function initCharts() {
  Chart.defaults.color = '#a3bcb6';
  Chart.defaults.font.family = 'Archivo, sans-serif';
  Chart.defaults.borderColor = 'rgba(163,188,182,.15)';
  charts.species = new Chart($('#chartSpecies'), {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Avistamientos', data: [], backgroundColor: '#6cc596', borderRadius: 6 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } }
  });
  charts.days = new Chart($('#chartDays'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Avistamientos', data: [], borderColor: '#6cc596', backgroundColor: '#6cc596', cubicInterpolationMode: 'monotone' },
      { label: 'Alertas', data: [], borderColor: '#ef5b4c', backgroundColor: '#ef5b4c', cubicInterpolationMode: 'monotone' }
    ] },
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

function groupBySpecies() {
  const g = {};
  state.sightings.forEach((s) => {
    const e = g[s.speciesId] ||= { nombre: s.nombre, cientifico: s.cientifico, estado: s.estado, n: 0, max: 0, last: 0 };
    e.n++; e.max = Math.max(e.max, s.conf); e.last = Math.max(e.last, s.time);
  });
  return Object.values(g).sort((a, b) => b.n - a.n);
}

function renderStats() {
  const groups = groupBySpecies();
  $('#cTotal').textContent = state.sightings.length;
  $('#cSpecies').textContent = groups.length;
  $('#cThreat').textContent = state.sightings.filter((s) => ['cr', 'vu'].includes(conservClass(s.estado))).length;
  $('#cAlerts').textContent = state.alerts.length;

  charts.species.data.labels = groups.map((g) => g.nombre);
  charts.species.data.datasets[0].data = groups.map((g) => g.n);
  charts.species.update();

  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const countDay = (arr, d) => arr.filter((x) => x.time >= d.getTime() && x.time < d.getTime() + 864e5).length;
  charts.days.data.labels = days.map((d) => d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }));
  charts.days.data.datasets[0].data = days.map((d) => countDay(state.sightings, d));
  charts.days.data.datasets[1].data = days.map((d) => countDay(state.alerts, d));
  charts.days.update();

  $('#speciesTable').innerHTML = groups.length
    ? groups.map((g) => `<tr><td><b>${esc(g.nombre)}</b> <i style="color:var(--muted)">${esc(g.cientifico)}</i></td>
        <td>${esc(g.estado)}</td><td>${g.n}</td><td>${Math.round(g.max * 100)}%</td><td>${fmtDate(g.last)}</td></tr>`).join('')
    : '<tr><td colspan="5" style="color:var(--muted)">Aún no hay avistamientos. Enciende la cámara en la pestaña Escáner.</td></tr>';
}

function renderAlerts() {
  const list = $('#alertList');
  if (!state.alerts.length) {
    list.innerHTML = '<div class="empty-state">Sin alertas. Activa "Zona protegida" en el Escáner para detectar personas y vehículos.</div>';
    return;
  }
  list.innerHTML = state.alerts.map((a) => `
    <div class="alert-item ${a.atendida ? 'done' : ''}">
      ${a.foto ? `<img src="${a.foto}" alt="Captura de la alerta">` : '<img alt="">'}
      <div>
        <h4>${esc(a.tipo)} · ${Math.round(a.conf * 100)}%</h4>
        <p>${esc(a.mensaje)}</p>
        <p>${fmtDate(a.time)} · ${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}</p>
      </div>
      <div class="row">
        <button class="btn" data-map="${a.id}">Ver en mapa</button>
        <button class="btn" data-done="${a.id}">${a.atendida ? 'Reabrir' : 'Marcar atendida'}</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-map]').forEach((b) => b.onclick = () => {
    const a = state.alerts.find((x) => x.id === b.dataset.map);
    switchTab('map'); setTimeout(() => map.setView([a.lat, a.lng], 15), 100);
  });
  list.querySelectorAll('[data-done]').forEach((b) => b.onclick = () => {
    const a = state.alerts.find((x) => x.id === b.dataset.done);
    a.atendida = !a.atendida; store.set('guardian.alerts', state.alerts); renderAlerts();
  });
}

function renderBadge() {
  const b = $('#alertBadge');
  b.textContent = state.unseen;
  b.classList.toggle('hidden', !state.unseen);
}

function renderAll() { renderStats(); renderAlerts(); renderBadge(); }

function setupReports() {
  $('#btnCsv').onclick = () => download('avistamientos.csv', toCSV(state.sightings, ['nombre', 'cientifico', 'estado', 'conf', 'lat', 'lng', 'time', 'fuente']), 'text/csv');
  $('#btnAlertsCsv').onclick = () => download('alertas.csv', toCSV(state.alerts, ['tipo', 'mensaje', 'conf', 'lat', 'lng', 'time', 'atendida']), 'text/csv');
  $('#btnJson').onclick = () => download('guardian-datos.json', JSON.stringify({ avistamientos: state.sightings, alertas: state.alerts.map(({ foto, ...r }) => r) }, null, 2), 'application/json');
  $('#btnReport').onclick = generateReport;
  $('#btnSimulate').onclick = () => { state.lastAlert.person = 0; raiseAlert('person', 0.92, 'Alerta simulada: persona detectada en zona protegida.'); };
}

function toCSV(rows, cols) {
  const cell = (v, c) => `"${String(c === 'time' ? new Date(v).toISOString() : v ?? '').replace(/"/g, '""')}"`;
  return '\uFEFF' + [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c], c)).join(','))].join('\n');
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function generateReport() {
  const groups = groupBySpecies();
  const threatened = groups.filter((g) => ['cr', 'vu'].includes(conservClass(g.estado)));
  const w = window.open('', '_blank');
  if (!w) return toast('Permite las ventanas emergentes para generar el reporte', 'err');
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte ambiental · Guardián</title>
  <style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1d2b27}
  h1{margin-bottom:0}table{width:100%;border-collapse:collapse;margin:12px 0 28px}
  th,td{border-bottom:1px solid #ccc;padding:6px 8px;text-align:left;font-size:14px}.m{color:#666}</style></head><body>
  <h1>Reporte ambiental</h1><p class="m">Generado por Guardián el ${fmtDate(Date.now())}</p>
  <h2>Resumen</h2>
  <p>Se registraron <b>${state.sightings.length}</b> avistamientos de <b>${groups.length}</b> especies.
  ${threatened.length} especies tienen algún grado de amenaza. Se generaron <b>${state.alerts.length}</b> alertas
  de posible caza furtiva, de las cuales ${state.alerts.filter((a) => !a.atendida).length} siguen sin atender.</p>
  <h2>Especies observadas</h2>
  <table><tr><th>Especie</th><th>Nombre científico</th><th>Estado</th><th>Avistamientos</th></tr>
  ${groups.map((g) => `<tr><td>${esc(g.nombre)}</td><td><i>${esc(g.cientifico)}</i></td><td>${esc(g.estado)}</td><td>${g.n}</td></tr>`).join('')}</table>
  <h2>Alertas</h2>
  <table><tr><th>Fecha</th><th>Tipo</th><th>Ubicación</th><th>Estado</th></tr>
  ${state.alerts.map((a) => `<tr><td>${fmtDate(a.time)}</td><td>${esc(a.tipo)}</td><td>${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}</td><td>${a.atendida ? 'Atendida' : 'Pendiente'}</td></tr>`).join('')}</table>
  <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

/* =========================================================
   AJUSTES
   ========================================================= */
function setupSettings() {
  const s = state.settings;
  $('#setWebhook').value = s.webhook;
  $('#setKey').value = s.apiKey;
  $('#setModel').value = s.model;
  $('#setConf').value = s.minConf;
  $('#confVal').textContent = Math.round(s.minConf * 100) + '%';
  $('#setNotify').checked = s.notify;
  $('#setSound').checked = s.sound;

  const save = () => {
    Object.assign(s, {
      webhook: $('#setWebhook').value.trim(), apiKey: $('#setKey').value.trim(),
      model: $('#setModel').value.trim() || 'claude-sonnet-5-5',
      minConf: parseFloat($('#setConf').value), notify: $('#setNotify').checked, sound: $('#setSound').checked
    });
    $('#confVal').textContent = Math.round(s.minConf * 100) + '%';
    store.set('guardian.settings', s);
  };
  ['#setWebhook', '#setKey', '#setModel', '#setConf', '#setNotify', '#setSound'].forEach((id) => {
    $(id).addEventListener('input', save);
    $(id).addEventListener('change', save);
  });
  $('#setNotify').addEventListener('change', askNotificationPermission);
  $('#btnTestHook').onclick = () => {
    if (!s.webhook) return toast('Escribe primero la URL del webhook', 'err');
    sendWebhook({ evento: 'prueba', mensaje: 'Conexión de prueba desde Guardián', time: Date.now() });
    toast('Alerta de prueba enviada', 'ok');
  };
  $('#btnClear').onclick = () => {
    if (!confirm('¿Borrar todos los avistamientos y alertas?')) return;
    state.sightings = []; state.alerts = [];
    store.set('guardian.sightings', []); store.set('guardian.alerts', []);
    Object.values(layers).forEach((l) => l.clearLayers());
    renderAll(); toast('Datos borrados', 'ok');
  };
}

/* =========================================================
   UTILIDADES
   ========================================================= */
function setStatus(text, cls) { const s = $('#status'); s.textContent = text; s.className = 'status ' + (cls || ''); }
function toast(msg, cls = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + cls; t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(t) { return t ? new Date(t).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
function slug(s) { return String(s || 'x').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'); }
