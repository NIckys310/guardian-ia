import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toml = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');

test('el sitio no se puede meter dentro de otra página (clickjacking)', () => {
  assert.match(toml, /X-Frame-Options = "DENY"/);
});

test('el navegador no adivina tipos de archivo (nosniff)', () => {
  assert.match(toml, /X-Content-Type-Options = "nosniff"/);
});

test('siempre se usa HTTPS (HSTS de al menos un año)', () => {
  const edad = Number(toml.match(/Strict-Transport-Security = "max-age=(\d+)/)?.[1]);
  assert.ok(edad >= 31536000);
});

test('solo se permite cámara, ubicación y Bluetooth (no micrófono ni pagos dentro de la app)', () => {
  const p = toml.match(/Permissions-Policy = "([^"]+)"/)[1];
  assert.match(p, /camera=\(self\)/);
  assert.match(p, /microphone=\(\)/);
  assert.match(p, /payment=\(\)/);
});

test('el service worker y el index nunca se guardan viejos', () => {
  assert.match(toml, /for = "\/sw\.js"[\s\S]*?Cache-Control = "no-cache"/);
  assert.match(toml, /for = "\/index\.html"[\s\S]*?Cache-Control = "no-cache"/);
});
