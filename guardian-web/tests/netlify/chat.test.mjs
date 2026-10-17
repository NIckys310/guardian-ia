import { test } from 'node:test';
import assert from 'node:assert/strict';
import chat from '../../netlify/functions/chat.mjs';
import { conEntorno, fetchFalso, respuesta } from '../helpers/navegador.mjs';

const URL_F = 'https://guardian.test/.netlify/functions/';
const LISTO = { ANTHROPIC_API_KEY: 'clave-de-prueba', SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon', ALLOW_ANON_AI: undefined };
const post = (fn, body, token = 'token-bueno') => new Request(URL_F + fn, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});

/* Supabase falso: la sesión es válida y la base responde si aún hay consultas */
function supabase({ permitido = true } = {}) {
  return fetchFalso((url) => {
    if (url.endsWith('/auth/v1/user')) return respuesta(200, { id: 'u-1' });
    if (url.includes('rpc/ia_permitida')) return respuesta(200, permitido);
    return respuesta(201, {});
  });
}

/* ---------------- chat ---------------- */
test('chat solo acepta POST', async () => {
  assert.equal((await chat(new Request(URL_F + 'chat'))).status, 405);
});

test('chat sin clave de Anthropic responde 503', () =>
  conEntorno({ ...LISTO, ANTHROPIC_API_KEY: undefined }, async () => {
    assert.equal((await chat(post('chat', {}))).status, 503);
  }));

test('chat sin sesión responde 401', () =>
  conEntorno(LISTO, async () => {
    const r = await chat(new Request(URL_F + 'chat', { method: 'POST', body: '{}' }));
    assert.equal(r.status, 401);
  }));

test('chat rechaza una conversación vacía o sin mensaje del usuario al final', () =>
  conEntorno(LISTO, async () => {
    const f = supabase();
    try {
      assert.equal((await chat(post('chat', { messages: [] }))).status, 400);
      assert.equal((await chat(post('chat', { messages: [{ role: 'assistant', content: 'hola' }] }))).status, 400);
      assert.equal((await chat(post('chat', { messages: 'no es lista' }))).status, 400);
    } finally { f.restaurar(); }
  }));

test('chat responde 429 cuando se acaban los mensajes del día', () =>
  conEntorno(LISTO, async () => {
    const f = supabase({ permitido: false });
    try { assert.equal((await chat(post('chat', { messages: [{ role: 'user', content: 'hola' }] }))).status, 429); } finally { f.restaurar(); }
  }));
