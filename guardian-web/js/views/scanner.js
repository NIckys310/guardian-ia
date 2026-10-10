/* =========================================================
   GUARDIÁN · Escáner
   Fuentes: cámaras del equipo (un dron por USB/HDMI aparece como cámara),
   cámara IP / dron por URL MJPEG, o foto subida.
   ========================================================= */
import { $, esc, pct, snapshotOf, slug, fmtRel, coord } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openLightbox } from '../ui/lightbox.js';
import { plateHTML, groupBadge } from '../ui/species-ui.js';
import { settings, saveSettings } from '../services/settings.js';
import { ai, analyzeFrame, modelsReady, loadModels, boxesFor, COCO_ES, THREATS, ALL_SPECIES } from '../services/ai-local.js';
import { claude, identifyWithClaude, AIError } from '../services/ai-cloud.js';
import { recordSighting, raiseAlert } from '../services/events.js';
import { askNotificationPermission } from '../services/notify.js';
import { active, photoURL } from '../services/repo.js';
import { geo } from '../services/geo.js';
import { auth } from '../services/auth.js';
import { plan, countUse } from '../services/plan.js';

const S = { stream: null, source: null, busy: false, timer: null, last: null, current: null, wakeLock: null,
  autoClaudeCount: 0, lastAutoClaude: 0, claudeBusy: false, hud: null };

export function init() {
  $('#autoScan').checked = settings.autoScan;
  $('#protectedMode').checked = settings.protectedMode;
  $('#sourceSelect').addEventListener('change', onSourceChange);
  $('#btnStart').addEventListener('click', startCamera);
  $('#btnStop').addEventListener('click', stopAll);
  $('#btnIpcam').addEventListener('click', connectIpcam);
  $('#fileInput').addEventListener('change', loadPhoto);
  $('#btnSnap').addEventListener('click', () => analyze(false));
  $('#btnClaude').addEventListener('click', () => identifyAdvanced(false));
  $('#btnExpand').addEventListener('click', (e) => { e.stopPropagation(); expand(); });
  $('#viewer').addEventListener('click', (e) => { if (!e.target.closest('button')) expand(); });
  $('#viewer').addEventListener('keydown', (e) => { if (e.key === 'Enter') expand(); });
  $('#autoScan').addEventListener('change', (e) => { saveSettings({ autoScan: e.target.checked }); paintLive(); scheduleLoop(); });
  $('#protectedMode').addEventListener('change', (e) => {
    saveSettings({ protectedMode: e.target.checked });
    if (e.target.checked) { askNotificationPermission(); toast('Zona protegida activada: se alertará ante personas, vehículos o armas.', 'warn'); }
  });
  new ResizeObserver(fitStage).observe($('#viewer'));
  bus.on('data:sightings', renderCaptures);
  bus.on('ai:status', ({ status }) => { if (status === 'ok' && S.source) scheduleLoop(); });
  listCameras();
  renderCaptures();
  if (auth.isDevice) $('#fileInput').setAttribute('capture', 'environment');
}

export function show() {
  if (!modelsReady()) loadModels();
  clearInterval(S.hud);
  const tick = () => {
    $('#hudTime').textContent = new Date().toLocaleTimeString('es-CO', { hour12: false });
    $('#hudCoords').textContent = geo.pos ? `${coord(geo.pos.lat, geo.pos.lng)} ±${geo.accuracy ?? '?'} m` : 'sin GPS';
  };
  tick(); S.hud = setInterval(tick, 1000);
  fitStage();
}
export function hide() { clearInterval(S.hud); }

/* ---------- Fuentes de video ---------- */
async function listCameras() {
  const sel = $('#sourceSelect');
  const prev = sel.value;
  let cams = [];
  try { cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch { /* sin permisos */ }
  sel.innerHTML = '';
  if (!cams.length || !cams[0].label) sel.append(new Option(auth.isDevice ? 'Cámara trasera' : 'Cámara predeterminada', ''));
  cams.filter((c) => c.label).forEach((c, i) => sel.append(new Option(c.label || `Cámara ${i + 1}`, c.deviceId)));
  sel.append(new Option('Cámara IP / dron (URL)', 'ipcam'));
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function onSourceChange() {
  const isIp = $('#sourceSelect').value === 'ipcam';
  $('#ipcamRow').classList.toggle('hidden', !isIp);
  if (!isIp && S.stream) startCamera();
}

async function startCamera() {
  const val = $('#sourceSelect').value;
  if (val === 'ipcam') { $('#ipcamRow').classList.remove('hidden'); $('#ipcamUrl').focus(); return; }
  stopAll();
  askNotificationPermission();
  const btn = $('#btnStart');
  btn.disabled = true;
  try {
    const video = val
      ? { deviceId: { exact: val }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } };
    S.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const v = $('#video');
    v.srcObject = S.stream;
    await v.play();
    v.onloadedmetadata = fitStage;
    showMedia('video', 'Cámara en vivo');
    await listCameras();
    requestWakeLock();
    scheduleLoop();
    toast('Cámara encendida', 'ok');
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el candado de la barra de direcciones.' : 'No se pudo abrir la cámara: ' + e.message, 'err');
  } finally { btn.disabled = false; }
}

function connectIpcam() {
  const url = $('#ipcamUrl').value.trim();
  if (!/^https?:\/\//.test(url)) return toast('Escribe una URL que empiece por http:// o https://', 'err');
  stopAll();
  const img = $('#ipcam');
  img.onerror = () => toast('No se pudo conectar. Verifica la URL y que el equipo esté en la misma red.', 'err');
  img.onload = fitStage;
  img.src = url;
  showMedia('ipcam', 'Cámara IP');
  scheduleLoop();
  toast('Conectando con la cámara remota…');
}

function loadPhoto(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Elige un archivo de imagen', 'err');
  stopAll();
  const img = $('#photo');
  img.onload = () => { showMedia('photo', 'Foto subida'); fitStage(); analyze(false, 'foto'); };
  img.src = URL.createObjectURL(file);
  ev.target.value = '';
}

function stopAll() {
  if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
  S.stream = null;
  $('#video').srcObject = null;
  if (S.source === 'ipcam') $('#ipcam').src = '';
  S.source = null;
  ['video', 'photo', 'ipcam'].forEach((id) => $('#' + id).classList.add('hidden'));
  $('#placeholder').classList.remove('hidden');
  clearTimeout(S.timer);
  clearOverlay();
  S.wakeLock?.release?.(); S.wakeLock = null;
  $('#srcChip').innerHTML = '<i></i>Sin fuente';
  $('#viewer').classList.remove('threat');
  fitStage();
  paintLive();
}

function showMedia(kind, label) {
  ['video', 'photo', 'ipcam'].forEach((id) => $('#' + id).classList.toggle('hidden', id !== kind));
  $('#placeholder').classList.add('hidden');
  S.source = kind;
  clearOverlay();
  $('#srcChip').innerHTML = `<i style="--c:var(--olive)"></i>${esc(label)}`;
  paintLive();
}

const mediaEl = () => (S.source ? $('#' + S.source) : null);
const isLive = () => S.source === 'video' || S.source === 'ipcam';

function paintLive() {
  $('#viewer').classList.toggle('live', isLive());
  $('#viewer').classList.toggle('scanning', isLive() && settings.autoScan);
}

async function requestWakeLock() {
  try { S.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.stream) requestWakeLock(); });

/* El escenario toma el tamaño exacto de la imagen ajustada al visor,
   así los recuadros de la IA quedan alineados y la imagen no se deforma */
function fitStage() {
  const stage = $('#stage'), viewer = $('#viewer'), el = mediaEl();
  const w = el?.videoWidth || el?.naturalWidth, h = el?.videoHeight || el?.naturalHeight;
  if (!w || !h) { stage.style.width = '100%'; stage.style.height = '100%'; return; }
  const cw = viewer.clientWidth, ch = viewer.clientHeight;
  const k = Math.min(cw / w, ch / h);
  stage.style.width = `${Math.floor(w * k)}px`;
  stage.style.height = `${Math.floor(h * k)}px`;
}

/* ---------- Escaneo automático ---------- */
function scheduleLoop() {
  clearTimeout(S.timer);
  if (!isLive() || !settings.autoScan) return;
  S.timer = setTimeout(async () => {
    if (!document.hidden) await analyze(true);
    scheduleLoop();
  }, Math.max(600, settings.scanMs));
}

/* ---------- Análisis con IA local ---------- */
async function analyze(auto = false, fuente) {
  const el = mediaEl();
  if (!el) { if (!auto) toast('Enciende la cámara o sube una foto primero'); return; }
  if (!modelsReady()) { if (!auto) toast('La IA todavía se está cargando…', 'warn'); return; }
  if (S.busy) return;
  const w = el.videoWidth || el.naturalWidth;
  if (!w) return;
  S.busy = true;
  try {
    const r = await analyzeFrame(el, { minConf: settings.minConf, detectThreats: settings.protectedMode });
    S.last = { ...r, w, h: el.videoHeight || el.naturalHeight };
    drawBoxes(r.dets, w, S.last.h);
    renderPredictions(r);
    $('#msChip').textContent = `${r.ms} ms`;
    const src = fuente || (S.source === 'ipcam' ? 'ipcam' : S.source === 'photo' ? 'foto' : auth.isDevice ? 'celular' : 'camara');

    if (r.threat) {
      $('#viewer').classList.add('threat');
      setTimeout(() => $('#viewer').classList.remove('threat'), 4000);
      raiseAlert(r.threat.class, r.threat.score, { photo: snapshotOf(el, 480, 0.7) });
    }
    if (r.species) {
      if (!auto || S.current?.id !== r.species.id) showSpecies(r.species, r.conf, 'IA local');
      const animals = r.dets.filter((d) => !THREATS[d.class]);
      recordSighting(r.species, r.conf, { photo: snapshotOf(el, 960, 0.78), fuente: src, detections: scaleDets(animals, w, 960) });
    } else if (r.animalSeen && settings.autoClaude && claude.configured) {
      maybeAutoClaude();
    } else if (!auto) {
      showUnknown(r.preds[0]);
    }
  } catch (e) {
    console.error(e);
    if (!auto) toast(e.name === 'SecurityError' ? 'La cámara remota no permite leer sus imágenes (CORS). Usa una app de cámara IP que habilite CORS.' : 'Error al analizar: ' + e.message, 'err');
  } finally {
    S.busy = false;
  }
}

/* Los recuadros se guardan en el tamaño de la foto guardada */
function scaleDets(dets, w, maxW) {
  const k = Math.min(1, maxW / w);
  return dets.map((d) => ({ class: d.class, score: d.score, bbox: d.bbox.map((v) => v * k) }));
}

function drawBoxes(dets, w, h) {
  const c = $('#overlay'), ctx = c.getContext('2d');
  c.width = w; c.height = h;
  ctx.clearRect(0, 0, w, h);
  const fs = Math.max(14, Math.round(w / 46));
  ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
  ctx.lineWidth = Math.max(2, w / 300);
  boxesFor(dets).forEach(({ bbox: [x, y, bw, bh], color, label }) => {
    ctx.strokeStyle = color;
    // Esquinas tipo mira en vez de un rectángulo completo
    const k = Math.min(bw, bh) * 0.22;
    ctx.beginPath();
    [[x, y + k, x, y, x + k, y], [x + bw - k, y, x + bw, y, x + bw, y + k], [x, y + bh - k, x, y + bh, x + k, y + bh], [x + bw - k, y + bh, x + bw, y + bh, x + bw, y + bh - k]]
      .forEach(([a, b, c2, d, e, f]) => { ctx.moveTo(a, b); ctx.lineTo(c2, d); ctx.lineTo(e, f); });
    ctx.stroke();
    ctx.globalAlpha = 0.12; ctx.fillStyle = color; ctx.fillRect(x, y, bw, bh); ctx.globalAlpha = 1;
    const tw = ctx.measureText(label).width + 12, ty = y > fs + 10 ? y - fs - 8 : y + 2;
    ctx.fillStyle = color; ctx.fillRect(x, ty, tw, fs + 8);
    ctx.fillStyle = '#0a0d0b'; ctx.fillText(label, x + 6, ty + fs + 1);
  });
}
function clearOverlay() { const c = $('#overlay'); c.getContext('2d').clearRect(0, 0, c.width, c.height); }

function renderPredictions(r) {
  const chips = r.preds.slice(0, 3).map((p) => `<span class="chip pred"><b>${esc(p.className.split(',')[0])}</b> ${pct(p.probability)}</span>`);
  const threats = r.dets.filter((d) => THREATS[d.class]);
  if (threats.length) chips.push(`<span class="chip err pred">${icon('alert')}<b>${threats.length}</b> ${esc(threats.map((d) => COCO_ES[d.class] || d.class).join(', '))}</span>`);
  $('#predictions').innerHTML = chips.join('');
}

/* ---------- Ficha ---------- */
function showSpecies(sp, conf, fuente) {
  S.current = sp;
  const count = active('sighting').filter((s) => s.species_id === sp.id).length + 1;
  const panel = $('#infoPanel');
  panel.innerHTML = plateHTML(sp, conf, fuente, count);
  panel.querySelector('[data-act="range"]').onclick = () => { bus.emit('map:range', sp); bus.emit('nav:go', 'mapa'); };
  panel.querySelector('[data-act="stats"]').onclick = () => bus.emit('nav:go', 'estadisticas');
  panel.querySelector('[data-act="ask"]').onclick = () => { bus.emit('chat:ask', `Cuéntame sobre el ${sp.nombre} (${sp.cientifico}): cómo reconocerlo, sus amenazas en Colombia y qué hacer si lo encuentro.`); bus.emit('nav:go', 'asistente'); };
}

async function showUnknown(pred) {
  S.current = null;
  if (!pred) return;
  const term = pred.className.split(',')[0];
  $('#infoPanel').innerHTML = `
    <article class="plate">
      <div class="src"><span>Sin ficha local</span><span>${pct(pred.probability)}</span></div>
      <div class="head"><div><h2>${esc(term)}</h2><div class="sci">Etiqueta de la IA local</div></div></div>
      <p class="meta" id="wikiText"><span class="spinner"></span> Buscando información…</p>
      <div class="plate-actions"><button class="btn primary sm" id="btnClaude2">${icon('spark')}Identificar con IA avanzada</button></div>
    </article>`;
  $('#btnClaude2').onclick = () => identifyAdvanced(false);
  const txt = await fetchWiki(term);
  const p = $('#wikiText');
  if (p) p.textContent = txt || 'No hay información disponible. Prueba la IA avanzada para identificar la especie exacta.';
}

async function fetchWiki(term) {
  try {
    const s = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&origin=*&srlimit=1`).then((r) => r.json());
    const title = s?.query?.search?.[0]?.title;
    if (!title) return '';
    const sum = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).then((r) => r.json());
    return sum.extract || '';
  } catch { return ''; }
}

/* ---------- IA avanzada (Claude) ---------- */
function maybeAutoClaude() {
  const now = Date.now();
  if (S.claudeBusy || S.limitReached || now - S.lastAutoClaude < 30_000 || (plan.uso_hoy?.auto || 0) >= plan.limite_auto) return;
  S.lastAutoClaude = now;
  S.autoClaudeCount++;
  identifyAdvanced(true);
}

async function identifyAdvanced(auto) {
  const el = mediaEl();
  if (!el) return toast('Enciende la cámara o sube una foto primero');
  if (claude.configured === false) {
    if (!auto) toast('La IA avanzada aún no está configurada: falta agregar la clave de Anthropic en Netlify.', 'warn', { ms: 7000 });
    return;
  }
  const img = snapshotOf(el, 1024, 0.85);
  if (!img) return toast('No se puede leer la imagen de esta cámara (CORS)', 'err');
  S.claudeBusy = true;
  const panel = $('#infoPanel');
  if (!auto) panel.innerHTML = `<div class="plate"><p class="loading-line"><span class="spinner"></span> Consultando a la IA avanzada…</p></div>`;
  try {
    const j = await identifyWithClaude(img, { kind: auto ? 'auto' : 'identify' });
    countUse(auto ? 'auto' : 'identify');
    if (j.amenaza_humana) raiseAlert('ia', 0.9, { mensaje: j.motivo_amenaza || 'Posible actividad de caza detectada por la IA', photo: snapshotOf(el, 480, 0.7) });
    if (!j.es_animal) {
      if (!auto) panel.innerHTML = `<div class="plate"><h2>Sin animales</h2><p class="meta">La IA avanzada no encontró ningún animal en la imagen.</p></div>`;
      return;
    }
    const local = ALL_SPECIES.find((s) => s.cientifico.toLowerCase() === (j.cientifico || '').toLowerCase());
    const sp = local || {
      id: 'ia-' + slug(j.cientifico || j.nombre), grupo: j.grupo, nombre: j.nombre, cientifico: j.cientifico, estado: j.estado,
      habitat: j.habitat, reproduccion: j.reproduccion, dieta: j.dieta, distribucion: j.distribucion,
      zonas: (j.lat || j.lng) ? [[j.lat, j.lng, 600]] : [], match: []
    };
    showSpecies(sp, j.confianza || 0.8, 'IA avanzada');
    recordSighting(sp, j.confianza || 0.8, { photo: snapshotOf(el, 960, 0.78), fuente: S.source === 'photo' ? 'foto' : auth.isDevice ? 'celular' : 'camara', ia: 'claude', force: !auto });
  } catch (e) {
    if (e instanceof AIError && e.code === 503) claude.configured = false;
    if (e instanceof AIError && e.code === 429) {
      S.limitReached = auto;   // en automático deja de intentar por esta sesión
      toast(e.message, 'warn', { action: { label: 'Ver Pro', fn: () => bus.emit('nav:go', 'pro') }, ms: 9000 });
    }
    if (!auto) panel.innerHTML = `<div class="plate"><h2>No se pudo identificar</h2><p class="meta">${esc(e.message)}</p></div>`;
  } finally {
    S.claudeBusy = false;
  }
}

/* ---------- Ampliar la imagen ---------- */
function expand() {
  const el = mediaEl();
  if (!el) return;
  const w = el.videoWidth || el.naturalWidth;
  const src = snapshotOf(el, 1600, 0.9);
  if (!src) return;
  const k = Math.min(1, 1600 / w);
  const boxes = S.last ? boxesFor(S.last.dets).map((b) => ({ ...b, bbox: b.bbox.map((v) => v * k) })) : [];
  openLightbox([{ src, boxes, caption: S.current ? `${S.current.nombre} · ${S.current.cientifico}` : 'Captura actual' }]);
}

/* ---------- Capturas recientes ---------- */
async function renderCaptures() {
  const box = $('#captures');
  if (!box) return;
  const rows = active('sighting').filter((s) => s.photo || s.photo_path).slice(0, 12);
  if (!rows.length) { box.innerHTML = `<div class="empty" style="grid-column:1/-1">${icon('image')}<span>Aquí aparecerán las fotos de cada avistamiento.</span></div>`; return; }
  box.innerHTML = rows.map((s, i) => `<button class="capture" data-i="${i}" style="animation-delay:${i * 40}ms" aria-label="${esc(s.nombre)}"><img alt="" data-id="${s.id}"><span class="grp">${groupBadge(s.grupo, 22)}</span><span>${esc(s.nombre)}<br><small class="mono">${fmtRel(s.created_at)}</small></span></button>`).join('');
  const urls = await Promise.all(rows.map(photoURL));
  rows.forEach((s, i) => { const im = box.querySelector(`img[data-id="${s.id}"]`); if (im && urls[i]) im.src = urls[i]; });
  box.onclick = (e) => {
    const b = e.target.closest('.capture');
    if (!b) return;
    const items = rows.map((s, i) => ({ src: urls[i], caption: `${s.nombre} · ${pct(s.conf)} · ${fmtRel(s.created_at)}` })).filter((x) => x.src);
    openLightbox(items, Math.min(+b.dataset.i, items.length - 1));
  };
}
