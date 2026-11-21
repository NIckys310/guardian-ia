/* Registro de fallos: guarda dónde pasó, conserva los últimos 50 y nunca rompe la app */
import test from 'node:test';
import assert from 'node:assert/strict';

const datos = new Map();
globalThis.localStorage = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, v) };
const consola = console.warn;
console.warn = () => {};
const { registrar, recientes, vigilar } = await import('../../js/core/fallos.js');

test('guarda dónde pasó y el mensaje, el más reciente primero', () => {
  datos.clear();
  registrar('nube', new TypeError('sin red'));
  registrar('mapa', 'texto suelto');
  const r = recientes();
  assert.equal(r[0].donde, 'mapa');
  assert.equal(r[1].error, 'TypeError: sin red');
});

test('solo conserva los últimos 50', () => {
  datos.clear();
  for (let i = 0; i < 70; i++) registrar(`n${i}`, new Error('e'));
  const r = recientes();
  assert.equal(r.length, 50);
  assert.equal(r[0].donde, 'n69');
});

test('si el almacenamiento falla no lanza error', () => {
  const ls = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('lleno'); } };
  assert.doesNotThrow(() => registrar('x', new Error('y')));
  assert.deepEqual(recientes(), []);
  globalThis.localStorage = ls;
});

test('atrapa los errores y promesas que nadie manejó', () => {
  datos.clear();
  const oyentes = {};
  vigilar({ addEventListener: (t, f) => { oyentes[t] = f; } });
  oyentes.error({ error: new RangeError('fuera de rango') });
  oyentes.unhandledrejection({ reason: new Error('promesa rota') });
  assert.deepEqual(recientes().map((f) => f.donde), ['promesa sin atrapar', 'error sin atrapar']);
  console.warn = consola;
});
