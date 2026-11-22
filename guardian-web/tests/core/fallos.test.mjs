/* Registro de fallos: guarda dónde pasó, conserva los últimos 50 y nunca rompe la app */
import test from 'node:test';
import assert from 'node:assert/strict';

const info = new Map();
globalThis.localStorage = { getItem: (k) => info.get(k) ?? null, setItem: (k, v) => info.set(k, v) };
const originalWarn = console.warn;
console.warn = () => {};
const { logError, recent, watchErrors } = await import('../../js/core/fallos.js');

test('guarda dónde pasó y el mensaje, el más reciente primero', () => {
  info.clear();
  logError('nube', new TypeError('sin red'));
  logError('mapa', 'texto suelto');
  const r = recent();
  assert.equal(r[0].donde, 'mapa');
  assert.equal(r[1].error, 'TypeError: sin red');
});

test('solo conserva los últimos 50', () => {
  info.clear();
  for (let i = 0; i < 70; i++) logError(`n${i}`, new Error('e'));
  const r = recent();
  assert.equal(r.length, 50);
  assert.equal(r[0].donde, 'n69');
});

test('si el almacenamiento falla no lanza error', () => {
  const ls = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } };
  assert.doesNotThrow(() => logError('x', new Error('y')));
  assert.deepEqual(recent(), []);
  globalThis.localStorage = ls;
});

test('atrapa los errores y promesas que nadie manejó', () => {
  info.clear();
  const listeners = {};
  watchErrors({ addEventListener: (t, f) => { listeners[t] = f; } });
  listeners.error({ error: new RangeError('fuera de rango') });
  listeners.unhandledrejection({ reason: new Error('promesa rota') });
  assert.deepEqual(recent().map((f) => f.donde), ['promesa sin atrapar', 'error sin atrapar']);
  console.warn = originalWarn;
});
