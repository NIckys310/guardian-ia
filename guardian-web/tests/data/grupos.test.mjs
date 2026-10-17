import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, MAP_SPECIAL } from '../../js/data/groups.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('cada grupo del mapa tiene nombre, color, ejemplo y dibujo', () => {
  for (const [id, g] of Object.entries(GROUPS)) {
    assert.ok(g.nombre, `${id} sin nombre`);
    assert.match(g.color, HEX, `${id} con color inválido`);
    assert.ok(g.ejemplo, `${id} sin ejemplo`);
    assert.match(g.svg, /<(path|circle|ellipse|rect)/, `${id} sin dibujo`);
  }
});

test('los colores de los grupos no se repiten (la leyenda debe distinguirlos)', () => {
  const colores = Object.values(GROUPS).map((g) => g.color.toLowerCase());
  assert.equal(new Set(colores).size, colores.length);
});

test('los íconos especiales del mapa tienen descripción para la leyenda', () => {
  for (const [id, s] of Object.entries(MAP_SPECIAL)) {
    assert.match(s.color, HEX, `${id} con color inválido`);
    assert.ok(s.descripcion.length > 10, `${id} sin descripción`);
  }
});

test('la alerta de caza furtiva es roja', () => {
  assert.equal(MAP_SPECIAL.alerta.color.toLowerCase(), '#e5533d');
});
