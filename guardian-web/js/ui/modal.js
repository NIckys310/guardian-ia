/* =========================================================
   GUARDIÁN · Ventanas modales
   - confirmDialog: reemplaza a confirm() con un diseño propio
   - openModal: ventana con contenido libre
   ========================================================= */
import { esc } from '../core/dom.js';
import { icon } from './icons.js';

export function openModal({ title = '', html = '', wide = false, actions = [], onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-backdrop';
  back.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="row between" style="margin-bottom:8px">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="modal-body">${html}</div>
      ${actions.length ? '<div class="modal-actions"></div>' : ''}
    </div>`;
  const close = (v) => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.(v);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(null); });
  document.addEventListener('keydown', onKey);
  const bar = back.querySelector('.modal-actions');
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`;
    b.innerHTML = (a.icon ? icon(a.icon) : '') + esc(a.label);
    b.onclick = async () => {
      if (a.fn) {
        const keep = await a.fn(back);
        if (keep === false) return;
      }
      close(a.value ?? true);
    };
    bar.append(b);
  });
  document.body.append(back);
  setTimeout(() => (back.querySelector('[autofocus]') || back.querySelector('.modal-actions .btn:last-child'))?.focus(), 50);
  return { el: back, close };
}

export function confirmDialog({ title = '¿Seguro?', message = '', confirmLabel = 'Confirmar', danger = false, icon: ic } = {}) {
  return new Promise((resolve) => {
    openModal({
      title,
      html: `<p class="muted">${esc(message)}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', value: false },
        { label: confirmLabel, cls: danger ? 'danger solid' : 'primary', icon: ic, value: true }
      ],
      onClose: (v) => resolve(v === true)
    });
  });
}

/* Pide escribir una palabra para confirmar acciones graves (vaciar papelera) */
export function typeToConfirm({ title, message, word = 'ELIMINAR', confirmLabel = 'Eliminar para siempre' }) {
  return new Promise((resolve) => {
    openModal({
      title,
      html: `<p class="muted" style="margin-bottom:14px">${esc(message)}</p>
        <label class="field">Escribe <b class="mono" style="color:var(--alert)">${word}</b> para confirmar
          <input class="input mono" id="ttc" autocomplete="off" autofocus></label>`,
      actions: [
        { label: 'Cancelar', cls: 'ghost', value: false },
        { label: confirmLabel, cls: 'danger solid', icon: 'trash',
          fn: (el) => {
            const v = el.querySelector('#ttc').value.trim().toUpperCase();
            if (v !== word) { el.querySelector('#ttc').classList.add('invalid', 'shake'); setTimeout(() => el.querySelector('#ttc').classList.remove('shake'), 500); return false; }
          }, value: true }
      ],
      onClose: (v) => resolve(v === true)
    });
  });
}
