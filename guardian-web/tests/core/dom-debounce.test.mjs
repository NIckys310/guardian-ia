import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { debounce } from '../../js/core/dom.js';

test('debounce() espera a que dejes de escribir para buscar', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const llamadas = [];
    const buscar = debounce((q) => llamadas.push(q), 250);
    buscar('j'); buscar('ja'); buscar('jag');
    mock.timers.tick(200);
    assert.deepEqual(llamadas, []);
    mock.timers.tick(60);
    assert.deepEqual(llamadas, ['jag']);
  } finally { mock.timers.reset(); }
});

test('debounce() vuelve a llamar si pasa el tiempo entre usos', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let n = 0;
    const f = debounce(() => n++, 100);
    f(); mock.timers.tick(150);
    f(); mock.timers.tick(150);
    assert.equal(n, 2);
  } finally { mock.timers.reset(); }
});
