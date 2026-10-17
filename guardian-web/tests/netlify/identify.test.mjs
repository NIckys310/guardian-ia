import { test } from 'node:test';
import assert from 'node:assert/strict';
import identify from '../../netlify/functions/identify.mjs';
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

/* ---------------- identify ---------------- */
test('identify GET informa si la IA está lista y qué modelo usa', () =>
  conEntorno(LISTO, async () => {
    const r = await identify(new Request(URL_F + 'identify'));
    assert.deepEqual(await r.json(), { configured: true, model: 'claude-sonnet-5-5' });
  }));

test('identify rechaza métodos distintos de GET y POST', async () => {
  assert.equal((await identify(new Request(URL_F + 'identify', { method: 'PUT' }))).status, 405);
});

test('identify sin clave de Anthropic responde 503', () =>
  conEntorno({ ...LISTO, ANTHROPIC_API_KEY: undefined }, async () => {
    assert.equal((await identify(post('identify', {}))).status, 503);
  }));

test('identify sin imagen responde 400', () =>
  conEntorno(LISTO, async () => {
    const f = supabase();
    try { assert.equal((await identify(post('identify', { image: '' }))).status, 400); } finally { f.restaurar(); }
  }));

test('identify rechaza imágenes que no son base64', () =>
  conEntorno(LISTO, async () => {
    const f = supabase();
    try { assert.equal((await identify(post('identify', { image: '<script>' }))).status, 400); } finally { f.restaurar(); }
  }));

test('identify rechaza imágenes de más de 1,5 MB', () =>
  conEntorno(LISTO, async () => {
    const f = supabase();
    try { assert.equal((await identify(post('identify', { image: 'A'.repeat(2_000_001) }))).status, 413); } finally { f.restaurar(); }
  }));

test('identify responde 429 cuando se acaban las consultas del día', () =>
  conEntorno(LISTO, async () => {
    const f = supabase({ permitido: false });
    try {
      const r = await identify(post('identify', { image: 'QUJD' }));
      assert.equal(r.status, 429);
      assert.equal((await r.json()).plan, true);
    } finally { f.restaurar(); }
  }));

test('identify con JSON roto responde 400', () =>
  conEntorno(LISTO, async () => {
    const f = supabase();
    try { assert.equal((await identify(post('identify', '{roto'))).status, 400); } finally { f.restaurar(); }
  }));
