import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser } from '../../netlify/lib/guard.mjs';
import { conEntorno, fetchFalso, respuesta } from '../helpers/navegador.mjs';

const NUBE = { SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon-prueba', ALLOW_ANON_AI: undefined };
const pedido = (token) => new Request('https://guardian.test/.netlify/functions/chat', {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}
});

test('sin Supabase configurado, la IA se bloquea', () =>
  conEntorno({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, ALLOW_ANON_AI: undefined }, async () => {
    const r = await requireUser(pedido());
    assert.ok(r instanceof Response);
    assert.equal(r.status, 401);
  }));

test('sin Supabase, solo se permite si se habilita a propósito (ALLOW_ANON_AI)', () =>
  conEntorno({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, ALLOW_ANON_AI: 'true' }, async () => {
    assert.deepEqual(await requireUser(pedido()), { user: null, token: null });
  }));

test('sin iniciar sesión, la IA responde 401', () =>
  conEntorno(NUBE, async () => {
    const r = await requireUser(pedido());
    assert.equal(r.status, 401);
    assert.match((await r.json()).error, /Inicia sesión/);
  }));

test('con una sesión vencida, la IA responde 401', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => respuesta(401, { msg: 'jwt expired' }));
    try {
      const r = await requireUser(pedido('token-viejo'));
      assert.equal(r.status, 401);
      assert.match((await r.json()).error, /venció/);
    } finally { f.restaurar(); }
  }));

test('con una sesión válida, devuelve el usuario y su token', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => respuesta(200, { id: 'u-1', email: 'guarda@parque.co' }));
    try {
      const r = await requireUser(pedido('token-bueno'));
      assert.deepEqual(r, { user: { id: 'u-1', email: 'guarda@parque.co' }, token: 'token-bueno' });
      assert.equal(f.llamadas[0].url, 'https://prueba.supabase.co/auth/v1/user');
      assert.equal(f.llamadas[0].init.headers.authorization, 'Bearer token-bueno');
    } finally { f.restaurar(); }
  }));
