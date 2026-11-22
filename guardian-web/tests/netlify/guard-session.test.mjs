import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireUser } from '../../netlify/lib/guard.mjs';
import { withEnv, fakeFetch, reply } from '../helpers/browser.mjs';

const CLOUD = { SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon-prueba', ALLOW_ANON_AI: undefined };
const request = (token) => new Request('https://guardian.test/.netlify/functions/chat', {
  method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}
});

test('sin Supabase configurado, la IA se bloquea', () =>
  withEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, ALLOW_ANON_AI: undefined }, async () => {
    const r = await requireUser(request());
    assert.ok(r instanceof Response);
    assert.equal(r.status, 401);
  }));

test('sin Supabase, solo se permite si se habilita a propósito (ALLOW_ANON_AI)', () =>
  withEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, ALLOW_ANON_AI: 'true' }, async () => {
    assert.deepEqual(await requireUser(request()), { user: null, token: null });
  }));

test('sin iniciar sesión, la IA responde 401', () =>
  withEnv(CLOUD, async () => {
    const r = await requireUser(request());
    assert.equal(r.status, 401);
    assert.match((await r.json()).error, /Inicia sesión/);
  }));

test('con una sesión vencida, la IA responde 401', () =>
  withEnv(CLOUD, async () => {
    const f = fakeFetch(() => reply(401, { msg: 'jwt expired' }));
    try {
      const r = await requireUser(request('token-viejo'));
      assert.equal(r.status, 401);
      assert.match((await r.json()).error, /venció/);
    } finally { f.restaurar(); }
  }));

test('con una sesión válida, devuelve el usuario y su token', () =>
  withEnv(CLOUD, async () => {
    const f = fakeFetch(() => reply(200, { id: 'u-1', email: 'guarda@parque.co' }));
    try {
      const r = await requireUser(request('token-bueno'));
      assert.deepEqual(r, { user: { id: 'u-1', email: 'guarda@parque.co' }, token: 'token-bueno' });
      assert.equal(f.llamadas[0].url, 'https://prueba.supabase.co/auth/v1/user');
      assert.equal(f.llamadas[0].init.headers.authorization, 'Bearer token-bueno');
    } finally { f.restaurar(); }
  }));
