/* =========================================================
   GUARDIÁN · Pantalla de inicio de sesión
   Entrar · Crear cuenta · Recuperar contraseña · Código de 2 pasos
   ========================================================= */
import { $, esc } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { signIn, signUp, verifyMfa, resetPassword, passwordScore, PASSWORD_RULES, passwordOk } from '../services/auth.js';

const el = () => $('#authScreen');
let lockTimer = null;

const TOPO = `<svg class="topo" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M-20 ${120 + i * 60} C 120 ${70 + i * 60}, 240 ${190 + i * 60}, 380 ${130 + i * 60} S 600 ${90 + i * 60}, 640 ${140 + i * 60}"/>`).join('')}
</svg>`;

export function showAuth(mode = 'login') {
  const root = el();
  root.classList.remove('hidden');
  root.innerHTML = `
    <section class="auth-art">
      ${TOPO}<div class="radar-big"></div>
      <div class="brand-big"><img src="assets/guardian.svg" alt=""><div><b>Guardián</b><span>Estación de fauna</span></div></div>
      <div>
        <h2>Vigila, identifica y protege la fauna con IA.</h2>
        <ul>
          <li>${icon('scan')}Reconocimiento de especies con la cámara del PC o del celular</li>
          <li>${icon('alert')}Alertas automáticas ante posible caza furtiva</li>
          <li>${icon('map')}Mapa de avistamientos con íconos por especie</li>
          <li>${icon('spark')}Asistente con IA para resolver tus dudas</li>
        </ul>
      </div>
      <span class="foot">Datos protegidos con cifrado y reglas de acceso por cuenta</span>
    </section>
    <section class="auth-panel"><div class="auth-card" id="authCard"></div></section>`;
  render(mode);
}

export function hideAuth() {
  clearInterval(lockTimer);
  el().classList.add('hidden');
  el().innerHTML = '';
}

function render(mode, extra = {}) {
  const card = $('#authCard');
  clearInterval(lockTimer);
  if (mode === 'mfa') return renderMfa(card);
  if (mode === 'forgot') return renderForgot(card, extra.email);
  const isLogin = mode === 'login';
  card.innerHTML = `
    <h3>${isLogin ? 'Bienvenida de nuevo' : 'Crea tu cuenta'}</h3>
    <p>${isLogin ? 'Inicia sesión para entrar a la estación.' : 'La primera cuenta que se registra queda como administradora.'}</p>
    <div class="segmented auth-tabs"><button data-m="login" class="${isLogin ? 'active' : ''}">Iniciar sesión</button><button data-m="signup" class="${isLogin ? '' : 'active'}">Crear cuenta</button></div>
    <form class="auth-form" novalidate>
      ${isLogin ? '' : '<label class="field">Nombre completo<input class="input" name="name" autocomplete="name" required maxlength="80"></label>'}
      <label class="field">Correo electrónico<input class="input" name="email" type="email" autocomplete="email" required value="${esc(extra.email || '')}"></label>
      <label class="field">Contraseña
        <span class="input-wrap"><input class="input" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required maxlength="128">
        <button type="button" class="icon-btn" data-eye aria-label="Mostrar contraseña">${icon('eye')}</button></span>
      </label>
      ${isLogin ? '' : `<div class="strength" data-s="0">${'<i></i>'.repeat(6)}</div>
        <ul class="rules">${PASSWORD_RULES.map((r) => `<li data-r="${r.id}">${r.label}</li>`).join('')}</ul>
        <label class="field">Repite la contraseña<input class="input" name="password2" type="password" autocomplete="new-password" required></label>`}
      <div class="auth-msg" role="alert"></div>
      <button class="btn primary lg block" type="submit">${icon(isLogin ? 'lock' : 'user')}${isLogin ? 'Entrar' : 'Crear cuenta'}</button>
      ${isLogin ? '<div class="auth-alt"><button type="button" data-forgot>¿Olvidaste tu contraseña?</button></div>' : ''}
    </form>
    <div class="auth-secure">${icon('shield')}<span>Por seguridad, tras 5 intentos fallidos la cuenta se bloquea 15 minutos. Puedes activar la verificación en dos pasos en Ajustes.</span></div>`;

  card.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => render(b.dataset.m, { email: card.querySelector('[name=email]').value }));
  card.querySelector('[data-forgot]')?.addEventListener('click', () => render('forgot', { email: card.querySelector('[name=email]').value }));
  const pass = card.querySelector('[name=password]');
  card.querySelector('[data-eye]').onclick = (e) => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = icon(show ? 'eyeOff' : 'eye');
  };
  if (!isLogin) {
    pass.addEventListener('input', () => {
      card.querySelector('.strength').dataset.s = passwordScore(pass.value);
      PASSWORD_RULES.forEach((r) => card.querySelector(`[data-r="${r.id}"]`).classList.toggle('ok', r.test(pass.value)));
    });
  }
  const form = card.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const msg = card.querySelector('.auth-msg');
    const btn = form.querySelector('[type=submit]');
    msg.className = 'auth-msg'; msg.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return fail(msg, form, 'Escribe un correo válido.');
    if (!isLogin) {
      if (!f.name.trim()) return fail(msg, form, 'Escribe tu nombre.');
      if (!passwordOk(f.password)) return fail(msg, form, 'La contraseña no cumple todos los requisitos.');
      if (f.password !== f.password2) return fail(msg, form, 'Las contraseñas no coinciden.');
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verificando…';
    const r = isLogin ? await signIn(f.email.trim(), f.password) : await signUp(f.email.trim(), f.password, f.name.trim());
    btn.disabled = false;
    btn.innerHTML = `${icon(isLogin ? 'lock' : 'user')}${isLogin ? 'Entrar' : 'Crear cuenta'}`;
    if (!r.ok) {
      if (r.locked) return renderLocked(r.locked, f.email);
      return fail(msg, form, r.error);
    }
    if (r.mfa) return render('mfa');
    if (r.confirm) { msg.className = 'auth-msg ok'; msg.textContent = 'Te enviamos un correo para confirmar la cuenta.'; return; }
    bus.emit('auth:signedIn');
  });
}

function fail(msg, form, text) {
  msg.className = 'auth-msg err';
  msg.textContent = text;
  form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
}

function renderLocked(seconds, email) {
  const card = $('#authCard');
  let left = seconds;
  card.innerHTML = `
    <h3>Cuenta bloqueada temporalmente</h3>
    <p>Hubo demasiados intentos fallidos. Por seguridad, espera para volver a intentar.</p>
    <div class="lock-timer" id="lockT">--:--</div>
    <div class="auth-alt" style="margin-top:20px"><button type="button" data-forgot>Recuperar contraseña</button><button type="button" data-back>Volver</button></div>`;
  const paint = () => {
    const m = Math.floor(left / 60), s = left % 60;
    $('#lockT').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (left-- <= 0) render('login', { email });
  };
  paint();
  lockTimer = setInterval(paint, 1000);
  card.querySelector('[data-forgot]').onclick = () => render('forgot', { email });
  card.querySelector('[data-back]').onclick = () => render('login', { email });
}

function renderMfa(card) {
  card.innerHTML = `
    <h3>Verificación en dos pasos</h3>
    <p>Abre tu app autenticadora y escribe el código de 6 dígitos.</p>
    <form class="auth-form">
      <div class="otp">${'<input class="input" inputmode="numeric" maxlength="1" autocomplete="one-time-code">'.repeat(6)}</div>
      <div class="auth-msg" role="alert"></div>
      <button class="btn primary lg block" type="submit">${icon('shield')}Verificar</button>
    </form>`;
  const inputs = [...card.querySelectorAll('.otp input')];
  inputs[0].focus();
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '').slice(-1);
      if (inp.value && inputs[i + 1]) inputs[i + 1].focus();
      if (inputs.every((x) => x.value)) card.querySelector('form').requestSubmit();
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && inputs[i - 1]) inputs[i - 1].focus(); });
    inp.addEventListener('paste', (e) => {
      const d = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (d.length === 6) { e.preventDefault(); d.split('').forEach((c, k) => { inputs[k].value = c; }); card.querySelector('form').requestSubmit(); }
    });
  });
  card.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = inputs.map((x) => x.value).join('');
    const msg = card.querySelector('.auth-msg');
    if (code.length !== 6) return;
    const r = await verifyMfa(code);
    if (!r.ok) { fail(msg, card.querySelector('form'), r.error); inputs.forEach((x) => { x.value = ''; }); inputs[0].focus(); return; }
    bus.emit('auth:signedIn');
  });
}

function renderForgot(card, email = '') {
  card.innerHTML = `
    <h3>Recuperar contraseña</h3>
    <p>Te enviaremos un enlace para crear una contraseña nueva.</p>
    <form class="auth-form">
      <label class="field">Correo electrónico<input class="input" name="email" type="email" required value="${esc(email)}"></label>
      <div class="auth-msg" role="alert"></div>
      <button class="btn primary lg block" type="submit">${icon('send')}Enviar enlace</button>
      <div class="auth-alt"><button type="button" data-back>Volver a iniciar sesión</button></div>
    </form>`;
  card.querySelector('[data-back]').onclick = () => render('login', { email: card.querySelector('[name=email]').value });
  card.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = card.querySelector('.auth-msg');
    const r = await resetPassword(card.querySelector('[name=email]').value.trim());
    msg.className = 'auth-msg ' + (r.ok ? 'ok' : 'err');
    msg.textContent = r.ok ? 'Si el correo existe, te llegará el enlace en unos minutos.' : r.error;
  });
}
