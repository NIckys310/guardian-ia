import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pct, coord, bytes } from '../../js/core/dom.js';

test('pct() convierte la confianza de la IA en porcentaje redondeado', () => {
  assert.equal(pct(0.923), '92%');
  assert.equal(pct(1), '100%');
  assert.equal(pct(0), '0%');
});

test('pct() trata valores vacíos como 0 %', () => {
  assert.equal(pct(undefined), '0%');
  assert.equal(pct(null), '0%');
});

test('coord() muestra 4 decimales (unos 11 metros de precisión)', () => {
  assert.equal(coord(4.60971, -74.08176), '4.6097, -74.0818');
  assert.equal(coord('1.5', '-2'), '1.5000, -2.0000');
});

test('bytes() usa la unidad adecuada', () => {
  assert.equal(bytes(512), '512 B');
  assert.equal(bytes(2048), '2.0 KB');
  assert.equal(bytes(3 * 1048576), '3.0 MB');
});
