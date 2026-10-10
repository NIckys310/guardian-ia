/* =========================================================
   GUARDIÁN · Ajustes
   Se guardan en este equipo y, con nube, también en la cuenta.
   ========================================================= */
import { ldb } from '../core/local-db.js';
import { bus } from '../core/bus.js';
import { sb } from './cloud.js';
import { auth } from './auth.js';

export const DEFAULTS = {
  theme: 'dark',            // dark | light | system
  motion: true,             // animaciones
  minConf: 0.3,             // confianza mínima de MobileNet
  autoScan: true,           // escaneo automático
  scanMs: 1500,             // cada cuánto se analiza la cámara
  protectedMode: false,     // zona protegida (detectar personas y vehículos)
  autoClaude: true,         // consultar a Claude si la IA local duda
  autoClaudeMax: 20,        // máximo de consultas automáticas por sesión
  notify: true,
  sound: true,
  webhook: '',
  idleMin: 30
};

export const settings = { ...DEFAULTS };

export async function loadSettings() {
  Object.assign(settings, DEFAULTS, (await ldb.getKV('settings')) || {});
  if (auth.isCloud && sb() && auth.user && !auth.isDevice) {
    const { data } = await sb().from('user_settings').select('settings').eq('user_id', auth.user.id).maybeSingle();
    if (data?.settings && Object.keys(data.settings).length) Object.assign(settings, data.settings);
  }
  delete settings.apiKey;
  delete settings.model;
  applyAppearance();
  localStorage.setItem('guardian.idleMin', settings.idleMin);
  bus.emit('settings:change', settings);
  return settings;
}

let t = null;
export function saveSettings(patch) {
  Object.assign(settings, patch);
  applyAppearance();
  localStorage.setItem('guardian.idleMin', settings.idleMin);
  bus.emit('settings:change', settings);
  clearTimeout(t);
  t = setTimeout(async () => {
    await ldb.setKV('settings', { ...settings });
    if (auth.isCloud && sb() && auth.user && !auth.isDevice) {
      await sb().from('user_settings').upsert({ user_id: auth.user.id, settings: { ...settings } });
    }
  }, 400);
}

export function applyAppearance() {
  const root = document.documentElement;
  const dark = settings.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : settings.theme !== 'light';
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.motion = settings.motion ? 'on' : 'off';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0d0b' : '#eef0e8');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => settings.theme === 'system' && applyAppearance());
