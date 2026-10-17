import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { navegadorFalso } from '../helpers/navegador.mjs';

let ia;
before(async () => {
  navegadorFalso();
  ia = await import('../../js/services/ai-local.js');
});

test('matchSpecies() reconoce el jaguar en la clase de MobileNet', () => {
  assert.equal(ia.matchSpecies('jaguar, panther, Panthera onca')?.id, 'jaguar');
});

test('matchSpecies() no confunde palabras parecidas dentro de otra', () => {
  const sp = ia.matchSpecies('catamaran');
  assert.ok(!sp || !sp.match.includes('cat'), 'no debe reconocer "cat" dentro de "catamaran"');
});

test('matchSpecies() devuelve null si no conoce el animal', () => {
  assert.equal(ia.matchSpecies('teapot'), null);
});

test('matchSpecies() da el mismo resultado la segunda vez (memoria)', () => {
  assert.equal(ia.matchSpecies('jaguar'), ia.matchSpecies('JAGUAR'));
});

test('boxColor(): rojo para amenazas, verde para animales, ámbar para lo demás', () => {
  assert.equal(ia.boxColor('person'), '#e5533d');
  assert.equal(ia.boxColor('knife'), '#e5533d');
  assert.equal(ia.boxColor('bird'), '#8fb35a');
  assert.equal(ia.boxColor('backpack'), '#e7a93b');
});

test('boxesFor() traduce la etiqueta y muestra el porcentaje', () => {
  const [caja] = ia.boxesFor([{ bbox: [1, 2, 3, 4], class: 'person', score: 0.876 }]);
  assert.deepEqual(caja, { bbox: [1, 2, 3, 4], color: '#e5533d', label: 'Persona 88%' });
});

test('todas las amenazas y animales de COCO tienen traducción', () => {
  for (const k of [...Object.keys(ia.THREATS), ...ia.COCO_ANIMALS]) assert.ok(ia.COCO_ES[k], `${k} sin traducción`);
});
