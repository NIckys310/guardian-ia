import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overLimit, logUsage } from '../../netlify/lib/guard.mjs';
import { conEntorno, fetchFalso, respuesta } from '../helpers/navegador.mjs';

const NUBE = { SUPABASE_URL: 'https://prueba.supabase.co', SUPABASE_ANON_KEY: 'anon-prueba' };

test('overLimit(): sin token (modo local) no se cuenta el límite', async () => {
  assert.equal(await overLimit(null, 'chat'), false);
});

test('overLimit(): si la base dice que aún puede, no hay límite', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => respuesta(200, true));
    try {
      assert.equal(await overLimit('t', 'chat'), false);
      assert.match(f.llamadas[0].url, /rpc\/ia_permitida$/);
      assert.deepEqual(JSON.parse(f.llamadas[0].init.body), { p_kind: 'chat' });
    } finally { f.restaurar(); }
  }));

test('overLimit(): si la base dice que ya no puede, se bloquea', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => respuesta(200, false));
    try { assert.equal(await overLimit('t', 'identify'), true); } finally { f.restaurar(); }
  }));

test('overLimit(): si la base falla, se bloquea (no se gasta sin control)', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => respuesta(500, { error: 'caída' }));
    try { assert.equal(await overLimit('t', 'chat'), true); } finally { f.restaurar(); }
  }));

test('overLimit(): si no hay internet, se bloquea', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => { throw new TypeError('fetch failed'); });
    try { assert.equal(await overLimit('t', 'chat'), true); } finally { f.restaurar(); }
  }));

test('logUsage(): guarda la consulta en ai_requests sin pedir la fila de vuelta', () =>
  conEntorno(NUBE, async () => {
    const f = fetchFalso(() => new Response(null, { status: 201 }));
    try {
      await logUsage('t', { kind: 'chat', ok: true });
      assert.match(f.llamadas[0].url, /rest\/v1\/ai_requests$/);
      assert.equal(f.llamadas[0].init.headers.prefer, 'return=minimal');
    } finally { f.restaurar(); }
  }));

test('logUsage(): sin token no registra nada', async () => {
  const f = fetchFalso(() => respuesta(200, {}));
  try { await logUsage(null, { kind: 'chat' }); assert.equal(f.llamadas.length, 0); } finally { f.restaurar(); }
});
