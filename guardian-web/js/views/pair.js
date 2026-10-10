/* =========================================================
   GUARDIÁN · Vincular este celular (se abre desde el QR)
   El celular entra con una cuenta anónima propia y se une
   a la cuenta del PC con el código de 6 letras.
   ========================================================= */
import { $, esc } from '../core/dom.js';
import { icon } from '../ui/icons.js';
import { auth, signInDevice } from '../services/auth.js';
import { sb, friendlyError } from '../services/cloud.js';

function guessName() {
  const ua = navigator.userAgent;
  const m = ua.match(/;\s*([^;)]+)\s+Build\//) || ua.match(/\(([^;)]+);/);
  const model = m ? m[1].trim() : '';
  if (/SM-A217/i.test(model)) return 'Galaxy A21s';
  if (/iPhone/.test(ua)) return 'iPhone';
  return model && model.length < 30 ? model : (/Android/.test(ua) ? 'Celular Android' : 'Dispositivo');
}

export function showPairing(code, onDone) {
  const root = $('#pairScreen');
  root.classList.remove('hidden');
  const isMain = auth.user && !auth.isDevice;
  root.innerHTML = `
    <section class="auth-art"><div class="radar-big"></div>
      <div class="brand-big"><img src="assets/guardian.svg" alt=""><div><b>Guardián</b><span>Vincular dispositivo</span></div></div>
      <div><h2>Convierte este celular en una cámara de la estación.</h2></div>
      <span class="foot">Código ${esc(code)}</span>
    </section>
    <section class="auth-panel"><div class="auth-card">
      <h3>Vincular este celular</h3>
      ${isMain
        ? `<p>Este equipo ya tiene sesión con la cuenta principal (${esc(auth.displayName)}). No necesitas vincularlo.</p>
           <button class="btn primary lg block" id="pairSkip">${icon('check')}Entrar a Guardián</button>`
        : `<p>Las fotos y los animales que reconozca este celular aparecerán al instante en el computador.</p>
           <form class="auth-form" id="pairForm">
             <label class="field">Código<input class="input mono" name="code" value="${esc(code)}" maxlength="6" style="letter-spacing:.3em;font-size:20px;text-transform:uppercase"></label>
             <label class="field">Nombre de este celular<input class="input" name="name" value="${esc(guessName())}" maxlength="60"></label>
             <div class="auth-msg" role="alert"></div>
             <button class="btn primary lg block" type="submit">${icon('link')}Vincular</button>
           </form>`}
      <div class="auth-secure">${icon('shield')}<span>El código vence en 10 minutos y solo funciona una vez. Puedes desvincular el celular cuando quieras desde el computador.</span></div>
    </div></section>`;

  const done = () => { history.replaceState(null, '', '#/escaner'); root.classList.add('hidden'); root.innerHTML = ''; onDone(); };
  $('#pairSkip')?.addEventListener('click', done);
  const form = $('#pairForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const msg = form.querySelector('.auth-msg');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Vinculando…';
    try {
      const s = await signInDevice();
      if (!s.ok) throw new Error(s.error);
      const tipo = /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'celular';
      const { data, error } = await sb().rpc('vincular_dispositivo', { p_code: f.code.trim().toUpperCase(), p_nombre: f.name.trim(), p_tipo: tipo, p_user_agent: navigator.userAgent });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo vincular');
      await sb().auth.refreshSession();
      form.innerHTML = `<div class="pair-ok"><div class="tick">${icon('check')}</div><h3>¡Celular vinculado!</h3><p class="muted">Abriendo el escáner…</p></div>`;
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      msg.className = 'auth-msg err';
      msg.textContent = friendlyError(err);
      btn.disabled = false; btn.innerHTML = `${icon('link')}Vincular`;
    }
  });
}
