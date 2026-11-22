import { test } from 'node:test';
import assert from 'node:assert/strict';
import wompi from '../../netlify/functions/wompi.mjs';
import { withEnv, fakeFetch, reply } from '../helpers/navegador.mjs';

const URL_F = 'https://guardian.test/.netlify/functions/';

/* ---------------- wompi ---------------- */
test('wompi solo acepta POST', async () => {
  assert.equal((await wompi(new Request(URL_F + 'wompi'))).status, 405);
});

test('wompi con JSON roto responde 400', async () => {
  assert.equal((await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: 'x' }))).status, 400);
});

test('wompi ignora eventos que no son de pago o vienen sin firma', async () => {
  const r = await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: JSON.stringify({ event: 'otra.cosa' }) }));
  assert.deepEqual(await r.json(), { ok: true, ignorado: true });
});

test('wompi: si la base rechaza la firma, responde 200 con ok:false (para que Wompi no reintente)', () =>
  withEnv({ SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon' }, async (t) => {
    const f = fakeFetch(() => reply(200, { ok: false, error: 'firma inválida' }));
    const notice = console.warn; console.warn = () => {};
    try {
      const eventData = { event: 'transaction.updated', signature: { checksum: 'abc' }, data: {} };
      const r = await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: JSON.stringify(eventData) }));
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: false });
      assert.match(f.llamadas[0].url, /rpc\/wompi_evento$/);
    } finally { f.restaurar(); console.warn = notice; }
  }));

test('wompi: un pago con firma válida responde ok:true', () =>
  withEnv({ SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon' }, async () => {
    const f = fakeFetch(() => reply(200, { ok: true }));
    try {
      const eventData = { event: 'transaction.updated', signature: { checksum: 'abc' }, data: {} };
      const r = await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: JSON.stringify(eventData) }));
      assert.deepEqual(await r.json(), { ok: true });
    } finally { f.restaurar(); }
  }));
