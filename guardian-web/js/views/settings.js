/* =========================================================
   GUARDIÁN · Ajustes
   ========================================================= */
import { $, esc, fmtDate, bytes } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { settings, saveSettings } from '../services/settings.js';
import { auth, mfaStatus, mfaEnroll, mfaConfirm, mfaDisable, changePassword, signOut, PASSWORD_RULES, passwordScore } from '../services/auth.js';
import { sb } from '../services/cloud.js';
import { ldb } from '../core/local-db.js';
import { outboxCount, flushOutbox, active } from '../services/repo.js';
import { claude, checkClaude } from '../services/ai-cloud.js';
import { askNotificationPermission, sendWebhook } from '../services/notify.js';
import { cloudConfigured } from '../config.js';

const card = (ic, title, hint, body) => `<div class="card reveal"><h4 class="card-head" style="margin:0 0 4px">${icon(ic)} ${title}</h4><p class="hint">${hint}</p>${body}</div>`;
const sw = (id, label, help, checked, cls = '') => `<label class="switch ${cls}"><span>${label}<small>${help}</small></span><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}></label>`;

export function init() { bus.on('claude:status', () => { if ($('#view-ajustes').classList.contains('active')) render(); }); }
export function show() { render(); }

async function render() {
  const s = settings;
  const cloud = cloudConfigured() && auth.user;
  const isMain = cloud && !auth.isDevice;
  $('#settingsGrid').innerHTML = [
    card('shield', 'Cuenta y seguridad', cloud ? `Sesión iniciada como <b>${esc(auth.user.email || auth.displayName)}</b>.` : 'Modo local: los datos solo están en este equipo.',
      isMain ? `
        <div class="set-row"><div><b>Verificación en dos pasos</b><small>Pide un código de tu app autenticadora al entrar.</small></div><span id="mfaState" class="chip">…</span></div>
        <div id="mfaArea"></div>
        <div class="set-row"><div><b>Contraseña</b><small>Cámbiala si sospechas que alguien la conoce.</small></div><button class="btn sm" id="setPass">${icon('key')}Cambiar</button></div>
        <div class="set-row"><div><b>Cierre por inactividad</b><small>Se cierra la sesión si no usas Guardián.</small></div>
          <select class="input" id="setIdle">${[[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [240, '4 horas'], [0, 'Nunca']].map(([v, l]) => `<option value="${v}" ${+s.idleMin === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="set-row"><div><b>Cerrar sesión en todos los equipos</b><small>Útil si perdiste un equipo.</small></div><button class="btn sm danger" id="setOutAll">${icon('logout')}Cerrar todas</button></div>
        <div class="set-row"><div><b>Actividad reciente</b><small>Inicios de sesión y cambios de seguridad.</small></div><button class="btn sm" id="setAudit">${icon('list')}Ver</button></div>`
      : auth.isDevice ? `<div class="set-row"><div><b>Celular vinculado</b><small>Para desvincularlo, usa el computador principal.</small></div><button class="btn sm danger" id="setOut">${icon('logout')}Salir</button></div>` : ''),
    card('sun', 'Apariencia', 'Elige cómo se ve Guardián.', `
      <div class="set-row"><div><b>Tema</b><small>Oscuro, claro o igual al sistema.</small></div>
        <select class="input" id="setTheme">${[['dark', 'Oscuro'], ['light', 'Claro'], ['system', 'Sistema']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${sw('setMotion', 'Animaciones', 'Desactívalas si el equipo va lento.', s.motion)}`),
    card('ai', 'Reconocimiento con IA', `IA avanzada: ${claude.configured ? `<b style="color:var(--olive)">conectada</b> (${esc(claude.model)})` : claude.configured === false ? '<b style="color:var(--amber)">falta la clave en Netlify</b>' : 'verificando…'}`, `
      <div class="set-row"><div><b>Confianza mínima</b><small>Más alta = menos errores, pero reconoce menos.</small></div><div class="range"><input type="range" id="setConf" min="0.1" max="0.9" step="0.05" value="${s.minConf}"><output id="confOut">${Math.round(s.minConf * 100)}%</output></div></div>
      <div class="set-row"><div><b>Velocidad del escaneo</b><small>Cada cuánto analiza la cámara.</small></div>
        <select class="input" id="setScanMs">${[[800, 'Muy rápido (0,8 s)'], [1500, 'Normal (1,5 s)'], [3000, 'Ahorro (3 s)'], [6000, 'Batería (6 s)']].map(([v, l]) => `<option value="${v}" ${+s.scanMs === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${sw('setAutoClaude', 'IA avanzada automática', 'Si la IA local ve un animal pero no sabe cuál es, consulta a Claude sola (máx. 1 cada 30 s).', s.autoClaude)}
      <div class="set-row"><div><b>Límite automático por sesión</b><small>Para cuidar los créditos de la API.</small></div><select class="input" id="setAutoMax">${[5, 10, 20, 50].map((v) => `<option ${+s.autoClaudeMax === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`),
    card('bell', 'Alertas y conexiones', 'Cómo te avisa Guardián.', `
      ${sw('setNotify', 'Notificaciones del sistema', 'Aunque Guardián esté minimizado.', s.notify)}
      ${sw('setSound', 'Sonido de alerta', 'Pitido corto al detectar algo.', s.sound)}
      <label class="field" style="margin-top:12px">Webhook (otros equipos, bots, drones)<input class="input" id="setWebhook" type="url" placeholder="https://mi-servidor.com/alertas" value="${esc(s.webhook)}"></label>
      <div class="row" style="margin-top:8px"><button class="btn sm" id="setTestHook">${icon('send')}Enviar prueba</button></div>`),
    card('database', 'Datos', cloud ? 'Tus datos están en la nube (Supabase) con copia en este equipo para trabajar sin internet.' : 'Modo local: todo se guarda en este navegador.', `
      <div class="set-row"><div><b>Registros</b><small>Activos en este momento.</small></div><span class="mono">${active('sighting').length} avist. · ${active('alert').length} alertas · ${active('report').length} reportes</span></div>
      <div class="set-row"><div><b>Espacio usado en este equipo</b><small id="storeTxt">Calculando…</small></div><div class="progress storage-bar" style="width:160px"><i id="storeBar"></i></div></div>
      ${cloud ? `<div class="set-row"><div><b>Pendientes por subir</b><small>Se suben solos al volver internet.</small></div><button class="btn sm" id="setFlush">${icon('refresh')}<span id="outboxN">…</span></button></div>` : ''}
      <div class="set-row"><div><b>Papelera</b><small>Recupera lo eliminado (30 días).</small></div><button class="btn sm" data-go="papelera">${icon('trash')}Abrir</button></div>`),
    card('info', 'Acerca de Guardián', 'Vigilancia y conservación de fauna con IA.', `
      <dl class="kv"><dt>Versión</dt><dd>2.0 · estación de guardaparques</dd><dt>IA local</dt><dd>MobileNet v2 + COCO-SSD (en el navegador)</dd><dt>IA avanzada</dt><dd>Claude (por servidor seguro)</dd><dt>Mapas</dt><dd>© OpenStreetMap</dd></dl>`)
  ].join('');
  bind();
  if (isMain) paintMfa();
  paintStorage();
}

function bind() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);
  on('#setTheme', 'change', (e) => saveSettings({ theme: e.target.value }));
  on('#setMotion', 'change', (e) => saveSettings({ motion: e.target.checked }));
  on('#setConf', 'input', (e) => { $('#confOut').textContent = Math.round(e.target.value * 100) + '%'; saveSettings({ minConf: +e.target.value }); });
  on('#setScanMs', 'change', (e) => saveSettings({ scanMs: +e.target.value }));
  on('#setAutoClaude', 'change', (e) => saveSettings({ autoClaude: e.target.checked }));
  on('#setAutoMax', 'change', (e) => saveSettings({ autoClaudeMax: +e.target.value }));
  on('#setNotify', 'change', (e) => { saveSettings({ notify: e.target.checked }); if (e.target.checked) askNotificationPermission(); });
  on('#setSound', 'change', (e) => saveSettings({ sound: e.target.checked }));
  on('#setWebhook', 'change', (e) => {
    const v = e.target.value.trim();
    if (v && !/^https?:\/\//.test(v)) { toast('La URL debe empezar por http:// o https://', 'err'); return; }
    saveSettings({ webhook: v }); toast('Webhook guardado', 'ok');
  });
  on('#setTestHook', 'click', () => {
    if (!settings.webhook) return toast('Escribe primero la URL del webhook', 'err');
    sendWebhook({ evento: 'prueba', mensaje: 'Conexión de prueba desde Guardián', time: new Date().toISOString() });
    toast('Prueba enviada', 'ok');
  });
  on('#setIdle', 'change', (e) => saveSettings({ idleMin: +e.target.value }));
  on('#setOutAll', 'click', () => signOut(true));
  on('#setOut', 'click', () => signOut());
  on('#setPass', 'click', passwordDialog);
  on('#setAudit', 'click', auditDialog);
  on('#setFlush', 'click', async () => { const n = await flushOutbox(); toast(n ? `${n} subidos` : 'No hay nada pendiente', 'ok'); paintStorage(); });
  if (claude.configured === null) checkClaude().then(() => bus.emit('claude:status'));
}

async function paintStorage() {
  const e = await ldb.estimate();
  if (e && $('#storeTxt')) {
    $('#storeTxt').textContent = `${bytes(e.usage || 0)} de ${bytes(e.quota || 0)}`;
    $('#storeBar').style.setProperty('--p', `${Math.max(2, Math.min(100, (e.usage / e.quota) * 100))}%`);
  }
  if ($('#outboxN')) $('#outboxN').textContent = `${await outboxCount()} pendientes`;
}

async function paintMfa() {
  const st = await mfaStatus();
  const chip = $('#mfaState');
  if (!chip) return;
  chip.className = 'chip ' + (st.enabled ? 'ok' : 'warn');
  chip.innerHTML = `<i></i>${st.enabled ? 'Activada' : 'Desactivada'}`;
  $('#mfaArea').innerHTML = st.enabled
    ? `<div class="row end"><button class="btn sm danger" id="mfaOff">Desactivar</button></div>`
    : `<div class="row end"><button class="btn sm olive" id="mfaOn">${icon('fingerprint')}Activar ahora</button></div>`;
  $('#mfaOff')?.addEventListener('click', async () => {
    const r = await mfaDisable(st.factorId);
    toast(r.ok ? 'Verificación en dos pasos desactivada' : r.error, r.ok ? 'warn' : 'err');
    paintMfa();
  });
  $('#mfaOn')?.addEventListener('click', async () => {
    const r = await mfaEnroll();
    if (!r.ok) return toast(r.error, 'err');
    // El QR se dibuja aquí mismo a partir del enlace otpauth:// (la imagen de Supabase a veces no se ve)
    let qrSvg = '';
    if (typeof qrcode !== 'undefined' && r.uri) { const q = qrcode(0, 'M'); q.addData(r.uri); q.make(); qrSvg = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); }
    const secret = r.secret.replace(/(.{4})/g, '$1 ').trim();
    const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
    $('#mfaArea').innerHTML = `
      <div class="mfa-box">
        <div class="qr">${qrSvg || `<img alt="Código QR" src="${r.qr}">`}</div>
        <div class="stack">
          <b>1. Instala una app autenticadora en tu celular</b>
          <small class="muted">Google Authenticator o Microsoft Authenticator (gratis en la tienda de apps). Esa app es la que te da los códigos de 6 dígitos; cambian cada 30 segundos.</small>
          <b>2. En la app toca "+" → "Escanear código QR" y apunta a este QR</b>
          <small class="muted">¿No puedes escanear? Elige "Ingresar clave de configuración" y escribe:</small>
          <code style="font-size:14px;letter-spacing:.08em;color:var(--text)">${esc(secret)}</code>
          <div class="row"><button class="btn sm ghost" id="mfaCopy">${icon('link')}Copiar clave</button>${isPhone ? `<a class="btn sm" href="${esc(r.uri)}">${icon('key')}Abrir en la app autenticadora</a>` : ''}</div>
          <b>3. Escribe aquí el código de 6 dígitos que muestra la app</b>
          <div class="row"><input class="input mono" id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="width:150px;letter-spacing:.3em;font-size:18px"><button class="btn primary sm" id="mfaVerify">${icon('check')}Confirmar</button></div>
        </div>
      </div>`;
    $('#mfaCopy').onclick = async () => { try { await navigator.clipboard.writeText(r.secret); toast('Clave copiada', 'ok'); } catch { toast(r.secret); } };
    $('#mfaCode').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6) $('#mfaVerify').click(); });
    $('#mfaVerify').onclick = async () => {
      const v = await mfaConfirm(r.factorId, $('#mfaCode').value);
      if (!v.ok) return toast(v.error, 'err');
      toast('¡Verificación en dos pasos activada!', 'ok');
      paintMfa();
    };
  });
}

function passwordDialog() {
  const m = openModal({
    title: 'Cambiar contraseña',
    html: `<div class="stack">
      <label class="field">Nueva contraseña<input class="input" type="password" id="np1" autocomplete="new-password" autofocus></label>
      <div class="strength" data-s="0">${'<i></i>'.repeat(6)}</div>
      <ul class="rules">${PASSWORD_RULES.map((r) => `<li data-r="${r.id}">${r.label}</li>`).join('')}</ul>
      <label class="field">Repítela<input class="input" type="password" id="np2" autocomplete="new-password"></label></div>`,
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Guardar', cls: 'primary', icon: 'key', fn: async (el) => {
      const p1 = el.querySelector('#np1').value, p2 = el.querySelector('#np2').value;
      if (p1 !== p2) { toast('Las contraseñas no coinciden', 'err'); return false; }
      const r = await changePassword(p1);
      if (!r.ok) { toast(r.error, 'err'); return false; }
      toast('Contraseña actualizada', 'ok');
    } }]
  });
  const p = m.el.querySelector('#np1');
  p.addEventListener('input', () => {
    m.el.querySelector('.strength').dataset.s = passwordScore(p.value);
    PASSWORD_RULES.forEach((r) => m.el.querySelector(`[data-r="${r.id}"]`).classList.toggle('ok', r.test(p.value)));
  });
}

async function auditDialog() {
  const { data: rows } = await sb().from('audit_log').select('accion, created_at, user_agent').order('created_at', { ascending: false }).limit(40);
  const names = { inicio_sesion: 'Inicio de sesión', inicio_sesion_2fa: 'Inicio de sesión con 2 pasos', cierre_sesion: 'Cierre de sesión', registro: 'Creación de la cuenta', cambio_contrasena: 'Cambio de contraseña', '2fa_activada': '2 pasos activada', '2fa_desactivada': '2 pasos desactivada' };
  openModal({ title: 'Actividad reciente', html: `<div class="audit-list">${(rows || []).map((r) => `<div><b>${esc(names[r.accion] || r.accion)}</b><span>${fmtDate(r.created_at)}</span></div>`).join('') || '<p class="muted">Sin actividad registrada.</p>'}</div>` });
}
