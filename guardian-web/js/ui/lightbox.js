/* =========================================================
   GUARDIÁN · Visor de imagen ampliada
   Al tocar una foto se abre a pantalla completa con:
   zoom (rueda, botones o pellizco), arrastrar para mover,
   doble clic para volver al tamaño normal y flechas para pasar fotos.
   items: [{ src, caption, boxes:[{bbox:[x,y,w,h], label, color}] }]
   ========================================================= */
import { esc } from '../core/dom.js';
import { icon } from './icons.js';

export function openLightbox(items, start = 0) {
  if (!items?.length) return;
  let i = start, scale = 1, tx = 0, ty = 0;
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `
    <div class="lb-bar">
      <span class="mono lb-count"></span>
      <span class="spacer"></span>
      <button class="icon-btn" data-a="out" aria-label="Alejar">${icon('zoomOut')}</button>
      <button class="icon-btn" data-a="in" aria-label="Acercar">${icon('zoomIn')}</button>
      <button class="icon-btn" data-a="reset" aria-label="Tamaño normal">${icon('expand')}</button>
      <button class="icon-btn" data-a="close" aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="lb-stage">
      <div class="lb-content"><img alt=""><canvas></canvas></div>
    </div>
    <div class="lb-foot"></div>`;
  const stage = el.querySelector('.lb-stage');
  const content = el.querySelector('.lb-content');
  const img = el.querySelector('img');
  const canvas = el.querySelector('canvas');

  const apply = () => { content.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const zoom = (k) => { scale = Math.min(6, Math.max(1, scale * k)); if (scale === 1) { tx = 0; ty = 0; } apply(); };
  const reset = () => { scale = 1; tx = 0; ty = 0; apply(); };

  function show() {
    const it = items[i];
    reset();
    img.src = it.src;
    el.querySelector('.lb-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
    el.querySelector('.lb-foot').innerHTML = esc(it.caption || '');
    img.onload = () => drawBoxes(it.boxes || []);
  }
  function drawBoxes(boxes) {
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fs = Math.max(12, Math.round(canvas.width / 50));
    ctx.font = `600 ${fs}px "JetBrains Mono", monospace`;
    ctx.lineWidth = Math.max(2, canvas.width / 360);
    boxes.forEach((b) => {
      const [x, y, w, h] = b.bbox;
      ctx.strokeStyle = b.color; ctx.strokeRect(x, y, w, h);
      const tw = ctx.measureText(b.label).width + 10;
      ctx.fillStyle = b.color; ctx.fillRect(x, Math.max(0, y - fs - 8), tw, fs + 8);
      ctx.fillStyle = '#0a0d0b'; ctx.fillText(b.label, x + 5, Math.max(fs, y - 6));
    });
  }
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const go = (d) => { if (items.length > 1) { i = (i + d + items.length) % items.length; show(); } };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === '+') zoom(1.25);
    else if (e.key === '-') zoom(0.8);
  };

  el.querySelector('.lb-bar').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'in') zoom(1.3); else if (a === 'out') zoom(0.77); else if (a === 'reset') reset(); else if (a === 'close') close();
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 0.87); }, { passive: false });
  stage.addEventListener('dblclick', () => (scale > 1 ? reset() : zoom(2)));
  stage.addEventListener('click', (e) => { if (e.target === stage && scale === 1) close(); });

  /* Arrastrar y pellizcar */
  const pts = new Map(); let last = null, pinch0 = 0, scale0 = 1, swipeX = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, e);
    last = { x: e.clientX, y: e.clientY }; swipeX = e.clientX;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); scale0 = scale; }
    stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      scale = Math.min(6, Math.max(1, scale0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch0)); apply();
    } else if (scale > 1 && last) {
      tx += e.clientX - last.x; ty += e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; apply();
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId); stage.classList.remove('dragging');
    if (scale === 1 && swipeX != null && Math.abs(e.clientX - swipeX) > 60) go(e.clientX < swipeX ? 1 : -1);
    swipeX = null; last = null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);

  document.addEventListener('keydown', onKey);
  document.body.append(el);
  show();
  return close;
}
