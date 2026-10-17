import { test } from 'node:test';
import assert from 'node:assert/strict';
import wompi from '../../netlify/functions/wompi.mjs';
import { conEntorno, fetchFalso, respuesta } from '../helpers/navegador.mjs';

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
  conEntorno({ SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon' }, async (t) => {
    const f = fetchFalso(() => respuesta(200, { ok: false, error: 'firma inválida' }));
    const aviso = console.warn; console.warn = () => {};
    try {
      const evento = { event: 'transaction.updated', signature: { checksum: 'abc' }, data: {} };
      const r = await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: JSON.stringify(evento) }));
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { ok: false });
      assert.match(f.llamadas[0].url, /rpc\/wompi_evento$/);
    } finally { f.restaurar(); console.warn = aviso; }
  }));

test('wompi: un pago con firma válida responde ok:true', () =>
  conEntorno({ SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon' }, async () => {
    const f = fetchFalso(() => respuesta(200, { ok: true }));
    try {
      const evento = { event: 'transaction.updated', signature: { checksum: 'abc' }, data: {} };
      const r = await wompi(new Request(URL_F + 'wompi', { method: 'POST', body: JSON.stringify(evento) }));
      assert.deepEqual(await r.json(), { ok: true });
    } finally { f.restaurar(); }
  }));
