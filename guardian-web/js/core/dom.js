/* =========================================================
   GUARDIÁN · Utilidades generales
   ========================================================= */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function slug(s) {
  return String(s || 'x').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* Fechas: todo se guarda en ISO (como Supabase) y se muestra en español */
export const nowISO = () => new Date().toISOString();
export const ms = (t) => (typeof t === 'number' ? t : Date.parse(t) || 0);
export function fmtDate(t, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  return t ? new Date(ms(t)).toLocaleString('es-CO', opts) : '—';
}
export function fmtDay(t) { return fmtDate(t, { day: 'numeric', month: 'short', year: 'numeric' }); }
export function fmtRel(t) {
  const d = (Date.now() - ms(t)) / 1000;
  if (d < 45) return 'hace un momento';
  if (d < 3600) return `hace ${Math.round(d / 60)} min`;
  if (d < 86400) return `hace ${Math.round(d / 3600)} h`;
  if (d < 86400 * 7) return `hace ${Math.round(d / 86400)} d`;
  return fmtDay(t);
}
export const pct = (v) => `${Math.round((v || 0) * 100)}%`;
export const coord = (lat, lng) => `${(+lat).toFixed(4)}, ${(+lng).toFixed(4)}`;

export function debounce(fn, wait = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
}

/* Clase de color según la categoría UICN */
export function conservClass(estado = '') {
  if (/\((CR|EN|EW|EX)\)|crítico|peligro/i.test(estado)) return 'cr';
  if (/\((VU|NT)\)|amenazad|vulnerable/i.test(estado)) return 'vu';
  if (/\(LC\)|menor/i.test(estado)) return 'lc';
  return 'na';
}
export const isThreatened = (estado) => ['cr', 'vu'].includes(conservClass(estado));

/* Contador que sube animado hasta el valor */
export function animateCount(el, to, dur = 700) {
  if (!el) return;
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString('es-CO'); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString('es-CO');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Efecto de onda al tocar botones */
export function enableRipples() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .nav-btn');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.style.position ||= 'relative';
    b.append(span);
    setTimeout(() => span.remove(), 650);
  }, { passive: true });
}

/* Asigna el índice de animación escalonada a los hijos con .reveal */
export function stagger(root) {
  $$('.reveal', root).forEach((el, i) => el.style.setProperty('--i', i));
}

/* Convierte una imagen/video/canvas en JPEG (dataURL) con ancho máximo */
export function snapshotOf(el, maxW = 640, quality = 0.75) {
  if (!el) return null;
  const w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height;
  if (!w || !h) return null;
  const k = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  try {
    c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch { return null; }   // cámara remota sin CORS
}

export function dataURLtoBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
