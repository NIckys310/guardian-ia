import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bus } from '../../js/core/bus.js';

test('bus: quien escucha un evento recibe los datos', () => {
  const recibido = [];
  bus.on('prueba:datos', (p) => recibido.push(p));
  bus.emit('prueba:datos', { n: 1 });
  assert.deepEqual(recibido, [{ n: 1 }]);
});

test('bus: varios oyentes reciben el mismo evento', () => {
  let a = 0, b = 0;
  bus.on('prueba:varios', () => a++);
  bus.on('prueba:varios', () => b++);
  bus.emit('prueba:varios');
  assert.equal(a + b, 2);
});

test('bus: la función devuelta por on() deja de escuchar', () => {
  let n = 0;
  const off = bus.on('prueba:off', () => n++);
  bus.emit('prueba:off');
  off();
  bus.emit('prueba:off');
  assert.equal(n, 1);
});

test('bus: un oyente con error no rompe a los demás', (t) => {
  t.mock.method(console, 'error', () => {});
  let llego = false;
  bus.on('prueba:error', () => { throw new Error('falla'); });
  bus.on('prueba:error', () => { llego = true; });
  bus.emit('prueba:error');
  assert.equal(llego, true);
});

test('bus: emitir un evento sin oyentes no hace nada', () => {
  assert.doesNotThrow(() => bus.emit('prueba:nadie', 1));
});
