/* El idioma: traductor, diccionario y fichas de especies en inglés */
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTraductor, idioma, LOCALE } from '../../js/core/i18n.js';
import { EN } from '../../js/data/i18n-en.js';
import { ESPECIES_EN, fichasEnIngles } from '../../js/data/species-en.js';
import { SPECIES } from '../../js/data/species.js';
import { COLOMBIA } from '../../js/data/species-colombia.js';

const t = crearTraductor({ 'Guardar': 'Save', 'Hace {#} días': '{#} days ago', 'Foto de {}': 'Photo of {}', 'Oso': 'Bear', '{#} de {#}': '{#} of {#}' });

test('sin elegir nada la app sigue en español', () => {
  assert.equal(idioma, 'es');
  assert.equal(LOCALE, 'es-CO');
});

test('traduce un texto exacto y conserva los espacios de alrededor', () => {
  assert.equal(t('Guardar'), 'Save');
  assert.equal(t('  Guardar\n'), '  Save\n');
});

test('traduce textos con datos y también el dato si lo conoce', () => {
  assert.equal(t('Hace 5 días'), '5 days ago');
  assert.equal(t('Foto de Oso'), 'Photo of Bear');
  assert.equal(t('Foto de Lucas'), 'Photo of Lucas');
});

test('{#} solo acepta números: no cambia frases de una persona', () => {
  assert.equal(t('3,5 MB de 10 GB'), '3,5 MB of 10 GB');
  assert.equal(t('Reserva de Fauna'), 'Reserva de Fauna');
});

test('los textos separados por · se traducen por partes', () => {
  assert.equal(t('Lucas · Guardar'), 'Lucas · Save');
});

test('lo que no está en el diccionario se queda igual', () => {
  assert.equal(t('Mi nota personal'), 'Mi nota personal');
  assert.equal(t(''), '');
  assert.equal(t(null), null);
});

test('el diccionario no tiene entradas vacías ni huecos desparejos', () => {
  const huecos = (s) => (s.match(/\{#?\}/g) || []).length;
  for (const [es, en] of Object.entries(EN)) {
    assert.ok(en.trim(), `vacío: ${es}`);
    assert.equal(huecos(en), huecos(es), `huecos distintos: ${es}`);
  }
});

test('todas las especies tienen ficha completa en inglés', () => {
  for (const s of [...COLOMBIA, ...SPECIES]) {
    assert.equal(ESPECIES_EN[s.id]?.length, 5, `falta: ${s.id}`);
  }
  const dic = fichasEnIngles(COLOMBIA);
  assert.equal(dic[COLOMBIA[0].nombre], ESPECIES_EN[COLOMBIA[0].id][0]);
});
