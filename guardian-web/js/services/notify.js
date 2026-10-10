/* =========================================================
   GUARDIÁN · Sonido y notificaciones del sistema
   ========================================================= */
import { settings } from './settings.js';

let audioCtx = null;
export function beep(kind = 'alert') {
  if (!settings.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const tones = kind === 'alert' ? [[880, 0], [660, .22], [880, .44]] : [[660, 0], [990, .12]];
    tones.forEach(([f, t]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'alert' ? 'square' : 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(kind === 'alert' ? 0.07 : 0.05, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.2);
    });
  } catch { /* sin audio */ }
}

export function askNotificationPermission() {
  if (settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

export async function systemNotify(title, body, tag) {
  if (!settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, tag, icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', vibrate: [200, 100, 200] });
    else new Notification(title, { body, tag, icon: 'assets/icon-192.png' });
  } catch { /* algunos navegadores lo bloquean */ }
}
