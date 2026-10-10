/* =========================================================
   GUARDIÁN · Avisos flotantes
   toast('Texto', 'ok' | 'err' | 'warn', { action: { label, fn } })
   ========================================================= */
import { icon } from './icons.js';

const ICONS = { ok: 'check', err: 'alert', warn: 'info', '': 'info' };

export function toast(msg, cls = '', { action, ms = 4500 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.setAttribute('role', cls === 'err' ? 'alert' : 'status');
  t.innerHTML = `${icon(ICONS[cls] || 'info')}<span></span>`;
  t.querySelector('span').textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn sm ghost';
    b.textContent = action.label;
    b.onclick = () => { action.fn(); close(); };
    t.append(b);
  }
  box.append(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  setTimeout(close, ms);
  return close;
}
