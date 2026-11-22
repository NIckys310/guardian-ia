import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, slug } from '../../js/core/dom.js';

test('esc() convierte los caracteres peligrosos de HTML', () => {
  assert.equal(esc('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(esc("O'Higgins & Cía"), 'O&#39;Higgins &amp; Cía');
});

test('esc() acepta null, undefined y números sin fallar', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('esc() deja igual el texto normal con tildes', () => {
  assert.equal(esc('Oso de anteojos — Páramo'), 'Oso de anteojos — Páramo');
});

test('slug() quita tildes, espacios y símbolos', () => {
  assert.equal(slug('Oso de Anteojos'), 'oso-de-anteojos');
  assert.equal(slug('Tití cabeciblanco!'), 'titi-cabeciblanco');
  assert.equal(slug('  Ñandú  '), 'nandu');
});

test('slug() nunca devuelve vacío', () => {
  assert.equal(slug(''), 'x');
  assert.equal(slug(null), 'x');
});
