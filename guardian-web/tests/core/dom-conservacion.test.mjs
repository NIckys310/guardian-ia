import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conservClass, isThreatened } from '../../js/core/dom.js';

test('conservClass() reconoce las categorías UICN más graves', () => {
  assert.equal(conservClass('En peligro crítico (CR)'), 'cr');
  assert.equal(conservClass('En peligro (EN)'), 'cr');
  assert.equal(conservClass('Extinta en estado silvestre (EW)'), 'cr');
});

test('conservClass() reconoce vulnerable y casi amenazado', () => {
  assert.equal(conservClass('Vulnerable (VU)'), 'vu');
  assert.equal(conservClass('Casi amenazado (NT)'), 'vu');
});

test('conservClass() reconoce preocupación menor', () => {
  assert.equal(conservClass('Preocupación menor (LC)'), 'lc');
});

test('conservClass() devuelve "na" si no hay datos', () => {
  assert.equal(conservClass(''), 'na');
  assert.equal(conservClass(), 'na');
  assert.equal(conservClass('Doméstico'), 'na');
});

test('isThreatened() solo es verdadero para especies amenazadas', () => {
  assert.equal(isThreatened('En peligro (EN)'), true);
  assert.equal(isThreatened('Vulnerable (VU)'), true);
  assert.equal(isThreatened('Preocupación menor (LC)'), false);
  assert.equal(isThreatened(''), false);
});
