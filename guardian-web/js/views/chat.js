/* =========================================================
   GUARDIÁN · Asistente IA (chat con Claude)
   - Respuesta en vivo, palabra por palabra
   - Conversaciones guardadas (y en la papelera si se eliminan)
   - Conoce un resumen de los datos de la estación
   ========================================================= */
import { $, esc, ms, fmtRel, conservClass } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { active, insert, update, moveToTrash, restore, messagesOf, addMessage, data } from '../services/repo.js';
import { claude, chatStream, checkClaude } from '../services/ai-cloud.js';
import { auth } from '../services/auth.js';
import { countUse } from '../services/plan.js';

const SUGGESTIONS = [
  '¿Qué especie vi más esta semana?',
  'Resume las alertas pendientes y qué hacer',
  '¿Qué hago si encuentro una serpiente coral?',
  '¿Cómo diferencio un jaguar de un ocelote?',
  'Dame un protocolo ante caza furtiva',
  '¿Qué especies amenazadas he registrado?'
];

let currentId = null, sending = false, abort = null, pendingAsk = null;

export function init() {
  $('#chatNew').addEventListener('click', () => openConversation(null));
  $('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); send(); });
  const ta = $('#chatInput');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('#chatConvs').addEventListener('click', onConvClick);
  $('#chatBack').addEventListener('click', () => $('.chat-side').classList.toggle('open'));
  $('#chatSuggest').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { $('#chatInput').value = b.textContent; send(); } });
  bus.on('data:conversations', renderConvs);
  bus.on('claude:status', paintStatus);
}
bus.on('chat:ask', (q) => { pendingAsk = q; });

export async function show() {
  paintStatus();
  if (claude.configured === null) checkClaude().then(paintStatus);
  renderConvs();
  if (pendingAsk) { const q = pendingAsk; pendingAsk = null; await openConversation(null); $('#chatInput').value = q; send(); return; }
  if (!currentId) openConversation(active('conversation')[0]?.id || null);
}
export function hide() { abort?.abort(); }

function paintStatus() {
  const st = $('#chatStatus');
  if (!st) return;
  if (claude.configured) { st.className = 'chip ok'; st.innerHTML = '<i></i>Claude en línea'; $('#chatModel').textContent = claude.model || 'Claude'; }
  else if (claude.configured === false) { st.className = 'chip warn'; st.innerHTML = '<i></i>Sin configurar'; }
  else { st.className = 'chip'; st.innerHTML = '<i></i>Verificando…'; }
}

function renderConvs() {
  const list = active('conversation').sort((a, b) => ms(b.updated_at || b.created_at) - ms(a.updated_at || a.created_at));
  $('#chatConvs').innerHTML = list.length ? list.map((c) => `
    <div class="conv ${c.id === currentId ? 'active' : ''}" data-id="${c.id}">
      <div><b>${esc(c.titulo)}</b><small>${fmtRel(c.updated_at || c.created_at)}</small></div>
      <button class="icon-btn" data-del title="Eliminar conversación" aria-label="Eliminar conversación">${icon('trash')}</button>
    </div>`).join('') : '<p class="muted" style="font-size:13px;padding:8px">Aún no hay conversaciones.</p>';
}

async function onConvClick(e) {
  const row = e.target.closest('.conv'); if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-del]')) {
    await moveToTrash('conversation', [id]);
    toast('Conversación movida a la papelera', 'ok', { action: { label: 'Deshacer', fn: () => restore('conversation', [id]) } });
    if (id === currentId) openConversation(null);
    return;
  }
  openConversation(id);
  $('.chat-side').classList.remove('open');
}

async function openConversation(id) {
  abort?.abort();
  currentId = id;
  renderConvs();
  const conv = active('conversation').find((c) => c.id === id);
  $('#chatTitle').textContent = conv?.titulo || 'Nueva conversación';
  const box = $('#chatMsgs');
  if (!id) { welcome(); return; }
  box.innerHTML = '<div class="chat-welcome"><span class="spinner"></span></div>';
  const msgs = await messagesOf(id);
  box.innerHTML = '';
  msgs.forEach((m) => bubble(m.role, m.content));
  $('#chatSuggest').innerHTML = '';
  box.scrollTop = box.scrollHeight;
}

function welcome() {
  $('#chatMsgs').innerHTML = `
    <div class="chat-welcome">
      <div class="orb">${icon('spark')}</div>
      <h4>Hola, soy Guardián IA</h4>
      <p class="muted">Pregúntame sobre fauna colombiana, qué hacer ante una alerta o sobre los datos de tu estación: conozco tus avistamientos y alertas.</p>
      ${claude.configured === false ? '<p class="chip warn">El asistente se activa cuando se agregue la clave de Anthropic en Netlify.</p>' : ''}
    </div>`;
  $('#chatSuggest').innerHTML = SUGGESTIONS.map((s, i) => `<button style="animation-delay:${i * 50}ms">${esc(s)}</button>`).join('');
}

function bubble(role, text, { streaming = false, error = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="av">${role === 'user' ? esc((auth.displayName[0] || 'T').toUpperCase()) : icon('spark')}</div><div class="bubble ${error ? 'error' : ''} ${streaming ? 'cursor' : ''}">${role === 'user' ? esc(text).replace(/\n/g, '<br>') : md(text)}</div>`;
  $('#chatMsgs').append(el);
  $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight;
  return el.querySelector('.bubble');
}

async function send() {
  const ta = $('#chatInput');
  const text = ta.value.trim();
  if (!text || sending) return;
  if (claude.configured === false) await checkClaude();
  ta.value = ''; ta.style.height = 'auto';
  $('#chatSuggest').innerHTML = '';
  if ($('.chat-welcome')) $('#chatMsgs').innerHTML = '';
  sending = true; $('#chatSend').disabled = true;

  if (!currentId) {
    const conv = await insert('conversation', { titulo: text.slice(0, 60), updated_at: new Date().toISOString() });
    currentId = conv.id;
    $('#chatTitle').textContent = conv.titulo;
    renderConvs();
  }
  const convId = currentId;
  bubble('user', text);
  await addMessage(convId, 'user', text);
  const history = (await messagesOf(convId)).map((m) => ({ role: m.role, content: m.content }));

  const out = bubble('assistant', '', { streaming: true });
  out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  abort = new AbortController();
  try {
    let pending = false;
    const full = await chatStream({ messages: history, context: stationContext() }, (_, all) => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { out.innerHTML = md(all); pending = false; $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight; });
    }, abort.signal);
    out.classList.remove('cursor');
    out.innerHTML = md(full);
    countUse('chat');
    await addMessage(convId, 'assistant', full);
  } catch (e) {
    out.classList.remove('cursor');
    if (e.name === 'AbortError') { out.closest('.msg').remove(); }
    else {
      out.classList.add('error'); out.textContent = e.message;
      if (e.code === 429) out.insertAdjacentHTML('beforeend', ` <button class="btn sm primary" data-go="pro">${icon('spark')}Ver Guardián Pro</button>`);
    }
  } finally {
    sending = false; $('#chatSend').disabled = false; abort = null;
    if (convId === currentId) update('conversation', convId, { updated_at: new Date().toISOString() });
  }
}

/* Resumen de la estación que se le da al asistente (sin fotos ni datos personales) */
function stationContext() {
  const d30 = Date.now() - 30 * 864e5, d7 = Date.now() - 7 * 864e5;
  const s30 = active('sighting').filter((s) => ms(s.created_at) >= d30);
  const count = (rows) => Object.entries(rows.reduce((a, s) => { a[s.nombre] = (a[s.nombre] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const alerts = active('alert');
  return {
    fecha_actual: new Date().toLocaleString('es-CO'),
    total_avistamientos: active('sighting').length,
    especies_ultimos_7_dias: count(s30.filter((s) => ms(s.created_at) >= d7)),
    especies_ultimos_30_dias: count(s30),
    especies_amenazadas_vistas: [...new Set(active('sighting').filter((s) => ['cr', 'vu'].includes(conservClass(s.estado))).map((s) => `${s.nombre} (${s.estado})`))].slice(0, 20),
    ultimos_avistamientos: active('sighting').slice(0, 8).map((s) => ({ especie: s.nombre, fecha: new Date(ms(s.created_at)).toLocaleString('es-CO'), confianza: Math.round(s.conf * 100) + '%' })),
    alertas_pendientes: alerts.filter((a) => !a.atendida).slice(0, 10).map((a) => ({ tipo: a.tipo, mensaje: a.mensaje, fecha: new Date(ms(a.created_at)).toLocaleString('es-CO') })),
    alertas_total: alerts.length,
    dispositivos_vinculados: data.devices.filter((d) => !d.revoked_at).map((d) => d.nombre)
  };
}

/* Markdown sencillo y seguro (se escapa todo primero) */
function md(src = '') {
  const lines = esc(src).split('\n');
  let html = '', list = null;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); html += `<h5>${inline(m[1])}</h5>`; }
    else if (!l.trim()) { close(); }
    else { close(); html += `<p>${inline(l)}</p>`; }
  }
  close();
  return html;
}
