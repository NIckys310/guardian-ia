import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fakeBrowser } from '../helpers/browser.mjs';

let aiHandler;
before(async () => {
  fakeBrowser();
  aiHandler = await import('../../js/services/ai-local.js');
});

test('matchSpecies() reconoce el jaguar en la clase de MobileNet', () => {
  assert.equal(aiHandler.matchSpecies('jaguar, panther, Panthera onca')?.id, 'jaguar');
});

test('matchSpecies() no confunde palabras parecidas dentro de otra', () => {
  const sp = aiHandler.matchSpecies('catamaran');
  assert.ok(!sp || !sp.match.includes('cat'), 'no debe reconocer "cat" dentro de "catamaran"');
});

test('matchSpecies() devuelve null si no conoce el animal', () => {
  assert.equal(aiHandler.matchSpecies('teapot'), null);
});

test('matchSpecies() da el mismo resultado la segunda vez (memoria)', () => {
  assert.equal(aiHandler.matchSpecies('jaguar'), aiHandler.matchSpecies('JAGUAR'));
});

test('boxColor(): rojo para amenazas, verde para animales, ámbar para lo demás', () => {
  assert.equal(aiHandler.boxColor('person'), '#e5533d');
  assert.equal(aiHandler.boxColor('knife'), '#e5533d');
  assert.equal(aiHandler.boxColor('bird'), '#8fb35a');
  assert.equal(aiHandler.boxColor('backpack'), '#e7a93b');
});

test('boxesFor() traduce la etiqueta y muestra el porcentaje', () => {
  const [box] = aiHandler.boxesFor([{ bbox: [1, 2, 3, 4], class: 'person', score: 0.876 }]);
  assert.deepEqual(box, { bbox: [1, 2, 3, 4], color: '#e5533d', label: 'Persona 88%' });
});

test('todas las amenazas y animales de COCO tienen traducción', () => {
  for (const k of [...Object.keys(aiHandler.THREATS), ...aiHandler.COCO_ANIMALS]) assert.ok(aiHandler.COCO_ES[k], `${k} sin traducción`);
});
