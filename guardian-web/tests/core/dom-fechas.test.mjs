import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ms, fmtDate, fmtDay, fmtRel, nowISO } from '../../js/core/dom.js';

test('ms() acepta números y fechas ISO', () => {
  assert.equal(ms(1000), 1000);
  assert.equal(ms('1970-01-01T00:00:01.000Z'), 1000);
});

test('ms() devuelve 0 si la fecha no es válida', () => {
  assert.equal(ms('no es fecha'), 0);
  assert.equal(ms(undefined), 0);
});

test('nowISO() devuelve la hora actual en ISO', () => {
  const t = Date.parse(nowISO());
  assert.ok(Math.abs(Date.now() - t) < 2000);
});

test('fmtDate() muestra un guion cuando no hay fecha', () => {
  assert.equal(fmtDate(null), '—');
  assert.equal(fmtDate(''), '—');
});

test('fmtDate() y fmtDay() escriben el año de la fecha', () => {
  const t = '2026-10-10T15:30:00Z';
  assert.match(fmtDate(t), /2026/);
  assert.match(fmtDay(t), /2026/);
});

test('fmtRel() describe hace cuánto pasó algo', () => {
  const ahora = Date.now();
  assert.equal(fmtRel(ahora - 10_000), 'hace un momento');
  assert.equal(fmtRel(ahora - 5 * 60_000), 'hace 5 min');
  assert.equal(fmtRel(ahora - 3 * 3600_000), 'hace 3 h');
  assert.equal(fmtRel(ahora - 2 * 86400_000), 'hace 2 d');
});

test('fmtRel() usa la fecha completa después de una semana', () => {
  const viejo = Date.now() - 30 * 86400_000;
  assert.equal(fmtRel(viejo), fmtDay(viejo));
});
