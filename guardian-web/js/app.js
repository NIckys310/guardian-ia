/* =========================================================
   GUARDIÁN · Arranque y navegación
   1. Carga ajustes y sesión.
   2. Si hay nube y no hay sesión → pantalla de inicio de sesión.
   3. Si la dirección trae #/vincular/CÓDIGO → vinculación del celular.
   4. Muestra la app; la IA se descarga en segundo plano.
   ========================================================= */
import { $, $$, enableRipples, stagger } from './core/dom.js';
import { bus } from './core/bus.js';
import { hydrateIcons, icon } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { openModal } from './ui/modal.js';
import { cloudConfigured } from './config.js';
import { auth, initAuth, signOut } from './services/auth.js';
import { loadSettings, saveSettings, settings } from './services/settings.js';
import { loadData, resetData, active, trashed, data, outboxCount } from './services/repo.js';
import { loadModels } from './services/ai-local.js';
import { checkClaude } from './services/ai-cloud.js';
import { watchLocation } from './services/geo.js';
import { showAuth, hideAuth } from './views/auth.js';
import { showPairing } from './views/pair.js';

import * as panel from './views/panel.js';
import * as escaner from './views/scanner.js';
import * as mapa from './views/map.js';
import * as estadisticas from './views/stats.js';
import * as registros from './views/records.js';
import * as alertas from './views/alerts.js';
import * as reportes from './views/reports.js';
import * as asistente from './views/chat.js';
import * as dispositivos from './views/devices.js';
import * as papelera from './views/trash.js';
import * as ajustes from './views/settings.js';

const VIEWS = { panel, escaner, mapa, estadisticas, registros, alertas, reportes, asistente, dispositivos, papelera, ajustes };
const DEVICE_VIEWS = ['panel', 'escaner', 'mapa', 'registros', 'alertas', 'ajustes'];
const inited = new Set();
let current = null, started = false;

/* ---------- Arranque ---------- */
async function boot() {
  hydrateIcons();
  enableRipples();
  registerSW();
  await loadSettings();
  try { await initAuth(); } catch (e) { console.error(e); toast('No se pudo conectar con la nube. Revisa tu internet.', 'err'); }
  if (auth.user) await loadSettings();   // ahora con los ajustes de la cuenta

  const pairCode = location.hash.match(/^#\/vincular\/([A-Za-z0-9]{6})/)?.[1];
  finishBoot();
  if (pairCode && cloudConfigured()) { showPairing(pairCode.toUpperCase(), startApp); return; }
  if (cloudConfigured() && !auth.user) { showAuth(); return; }
  startApp();
}

function finishBoot() {
  const b = $('#boot');
  if (!b) return;
  b.classList.add('done');
  setTimeout(() => b.remove(), 500);
}

async function startApp() {
  hideAuth();
  $('#pairScreen').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  renderUser();
  if (started) {
    applyDeviceRestrictions();
    await loadSettings();
    await loadData();
    go(currentFromHash(), true);
    return;
  }
  started = true;

  setupNav();
  setupTopbar();
  go(currentFromHash(), true);
  await loadData();
  watchLocation();
  // La IA pesa: se descarga cuando el navegador está libre
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(() => loadModels());
  checkClaude().then(() => bus.emit('claude:status'));
  updateBadges();
}

/* ---------- Navegación ---------- */
function currentFromHash() {
  const v = location.hash.replace(/^#\/?/, '').split('/')[0];
  return VIEWS[v] ? v : 'panel';
}

export function go(name, first = false) {
  if (!VIEWS[name]) name = 'panel';
  if (auth.isDevice && !DEVICE_VIEWS.includes(name)) name = 'escaner';
  if (name === current && !first) return;
  const swap = () => {
    if (current && current !== name) VIEWS[current].hide?.();
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    const sec = $('#view-' + name);
    $('#pageTitle').textContent = sec.dataset.title;
    $('#pageKicker').textContent = sec.dataset.kicker;
    document.title = `${sec.dataset.title} · Guardián`;
    if (!inited.has(name)) { hydrateIcons(sec); VIEWS[name].init?.(); inited.add(name); }
    stagger(sec);
    VIEWS[name].show?.();
    current = name;
    $('#main').scrollTop = 0;
  };
  if (document.startViewTransition && !first && settings.motion) document.startViewTransition(swap);
  else swap();
  if (location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
}
bus.on('nav:go', (v) => go(v));
addEventListener('hashchange', () => { if (started && !location.hash.startsWith('#/vincular')) go(currentFromHash()); });

function setupNav() {
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) go(g.dataset.go);
  });
  $('.bottomnav [data-more]').addEventListener('click', openMoreSheet);
  applyDeviceRestrictions();
}

function applyDeviceRestrictions() {
  $$('#nav [data-view], .bottomnav [data-view]').forEach((b) => {
    b.classList.toggle('hidden', auth.isDevice && !DEVICE_VIEWS.includes(b.dataset.view));
  });
}

function openMoreSheet() {
  const items = Object.keys(VIEWS)
    .filter((v) => !auth.isDevice || DEVICE_VIEWS.includes(v))
    .map((v) => {
      const b = $(`#nav [data-view="${v}"]`);
      return `<button class="nav-btn" data-sheet="${v}">${b.querySelector('svg').outerHTML}<span>${b.querySelector('.label').textContent}</span></button>`;
    }).join('');
  const m = openModal({ title: 'Secciones', html: `<div class="grid grid-2">${items}</div>` });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sheet]');
    if (b) { m.close(); go(b.dataset.sheet); }
  });
}

/* ---------- Barra superior ---------- */
function setupTopbar() {
  const themeBtn = $('#btnTheme');
  const paintTheme = () => { themeBtn.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'); };
  paintTheme();
  bus.on('settings:change', paintTheme);
  themeBtn.addEventListener('click', () => {
    saveSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' });
  });

  const net = $('#netStatus');
  const paintNet = async () => {
    const online = navigator.onLine;
    const pending = await outboxCount();
    net.className = 'status-pill hide-sm ' + (!cloudConfigured() ? '' : online ? 'ok' : 'err');
    net.querySelector('span').textContent = !cloudConfigured() ? 'Modo local' : online ? (pending ? `Subiendo ${pending}…` : 'Nube conectada') : 'Sin internet';
  };
  addEventListener('online', paintNet); addEventListener('offline', paintNet);
  bus.on('outbox:flushed', (n) => { toast(`${n} registro(s) guardados sin internet ya se subieron a la nube`, 'ok'); paintNet(); });
  bus.on('data:any', paintNet);
  paintNet();

  const ai = $('#aiStatus');
  bus.on('ai:status', ({ status, text }) => {
    ai.className = 'status-pill ' + status;
    ai.querySelector('span').textContent = text;
  });

  $('#userChip').addEventListener('click', openUserMenu);
}

function renderUser() {
  $('#userName').textContent = auth.displayName;
  $('#userRole').textContent = auth.isDevice ? 'celular vinculado' : auth.isCloud ? (auth.role === 'admin' ? 'administrador' : 'guardaparques') : 'solo este equipo';
  $('#userAvatar').textContent = (auth.displayName[0] || 'G').toUpperCase();
}

function openUserMenu(e) {
  e.stopPropagation();
  $('.menu')?.remove();
  const m = document.createElement('div');
  m.className = 'menu';
  m.style.cssText = 'left:0;right:auto;bottom:calc(100% + 8px);top:auto';
  m.innerHTML = `
    <button data-a="ajustes">${icon('settings')}Ajustes y seguridad</button>
    ${auth.isCloud && auth.user ? `<hr><button data-a="out">${icon('logout')}Cerrar sesión</button><button data-a="all">${icon('shield')}Cerrar sesión en todos los equipos</button>` : ''}`;
  const foot = $('.sidebar-foot');
  foot.style.position = 'relative';
  foot.append(m);
  const close = () => { m.remove(); document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
  m.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    close();
    if (a === 'ajustes') go('ajustes');
    if (a === 'out' || a === 'all') await signOut(a === 'all');
  });
}

/* ---------- Insignias del menú ---------- */
function updateBadges() {
  const pending = active('alert').filter((a) => !a.atendida).length;
  $$('[data-badge="alerts"]').forEach((b) => { b.textContent = pending; b.classList.toggle('hidden', !pending); });
  const t = trashed().length;
  $$('[data-badge="trash"]').forEach((b) => { b.textContent = t; b.classList.toggle('hidden', !t); });
}
bus.on('data:any', updateBadges);

/* ---------- Sesión ---------- */
bus.on('auth:change', () => {
  if (!started) return;
  renderUser();
  applyDeviceRestrictions();
  if (cloudConfigured() && !auth.user) {
    VIEWS[current]?.hide?.();
    resetData();
    $('#shell').classList.add('hidden');
    showAuth();
  }
});
bus.on('auth:idle', () => toast('Cerramos tu sesión por inactividad, para proteger tus datos.', 'warn', { ms: 8000 }));
bus.on('auth:signedIn', () => startApp());

/* Avisos de lo que llega desde otros dispositivos */
bus.on('remote:new', ({ type, row }) => {
  const dev = data.devices.find((d) => d.id === row.device_id);
  const from = dev ? dev.nombre : 'Otro dispositivo';
  if (type === 'sighting') toast(`${from}: ${row.nombre} detectado`, 'ok', { action: { label: 'Ver', fn: () => go('registros') } });
  if (type === 'alert') toast(`${from}: ${row.mensaje}`, 'err', { action: { label: 'Ver', fn: () => go('alertas') } });
});

/* ---------- App instalable (PWA) ---------- */
function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#btnInstall')?.classList.remove('hidden');
});
addEventListener('appinstalled', () => {
  $('#btnInstall')?.classList.add('hidden');
  toast('Guardián quedó instalado. Búscalo en el menú Inicio o en el escritorio.', 'ok');
});
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#btnInstall') || !installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#btnInstall').classList.add('hidden');
});

boot();
