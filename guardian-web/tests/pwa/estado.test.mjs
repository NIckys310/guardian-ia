/* Página de estado: revisa los 4 servicios en la nube sin claves secretas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICIOS, veredicto } from '../../estado/estado.js';

const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
const conectar = toml.match(/connect-src ([^;]+);/)[1].split(/\s+/);

test('revisa las dos bases de datos y las dos IA', () => {
  assert.deepEqual(SERVICIOS.map((s) => s.id), ['g-nube', 'g-ia', 't-nube', 't-ia']);
});

test('solo usa claves públicas', () => {
  for (const s of SERVICIOS.filter((x) => x.clave)) assert.match(s.clave, /^sb_publishable_/);
  assert.doesNotMatch(readFileSync(new URL('../../estado/estado.js', import.meta.url), 'utf8'), /service_role|sk-ant-/);
});

test('la política de seguridad del sitio deja consultar cada servicio', () => {
  for (const s of SERVICIOS.filter((x) => x.url.startsWith('https://'))) {
    assert.ok(conectar.includes(new URL(s.url).origin), new URL(s.url).origin);
  }
});

test('el veredicto distingue funciona, lento y en pausa', () => {
  assert.equal(veredicto({ ok: true, status: 200, ms: 300 }).clase, 'ok');
  assert.equal(veredicto({ ok: true, status: 200, ms: 9000 }).clase, 'lento');
  assert.equal(veredicto({ ok: false, status: 500, ms: 300 }).clase, 'mal');
  assert.match(veredicto({ error: 'Failed to fetch', ms: 50 }).texto, /pausa/);
});
