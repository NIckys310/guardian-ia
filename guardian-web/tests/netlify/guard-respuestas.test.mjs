import { test } from 'node:test';
import assert from 'node:assert/strict';
import { json, MODEL, hasKey } from '../../netlify/lib/guard.mjs';
import { conEntorno } from '../helpers/navegador.mjs';

test('json() responde con el código y el cuerpo en JSON', async () => {
  const r = json(418, { hola: 'mundo' });
  assert.equal(r.status, 418);
  assert.match(r.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await r.json(), { hola: 'mundo' });
});

test('json() nunca deja que el navegador guarde respuestas privadas', () => {
  assert.equal(json(200, {}).headers.get('cache-control'), 'no-store');
});

test('json() permite agregar encabezados extra', () => {
  assert.equal(json(200, {}, { 'x-prueba': '1' }).headers.get('x-prueba'), '1');
});

test('MODEL() usa Claude Sonnet 5.5 si no se configura otro', () =>
  conEntorno({ ANTHROPIC_MODEL: undefined }, () => assert.equal(MODEL(), 'claude-sonnet-5-5')));

test('MODEL() respeta el modelo configurado en Netlify', () =>
  conEntorno({ ANTHROPIC_MODEL: 'claude-opus-5-5' }, () => assert.equal(MODEL(), 'claude-opus-5-5')));

test('hasKey() solo es verdadero si existe la clave de Anthropic', async () => {
  await conEntorno({ ANTHROPIC_API_KEY: undefined }, () => assert.equal(hasKey(), false));
  await conEntorno({ ANTHROPIC_API_KEY: 'clave-de-prueba' }, () => assert.equal(hasKey(), true));
});
