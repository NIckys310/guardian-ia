/* Accesibilidad: contraste de colores (WCAG AA) y ventanas que no atrapan ni pierden el foco */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../css/base.css', import.meta.url), 'utf8');
const bloque = (sel) => css.slice(css.indexOf(sel)).split('}')[0];
const colores = (txt) => Object.fromEntries([...txt.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const oscuro = colores(bloque(':root {'));
const claro = { ...oscuro, ...colores(bloque(':root[data-theme="light"]')) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const PARES = [['text', 'bg'], ['text', 'panel'], ['muted', 'bg'], ['muted', 'panel'], ['faint', 'panel'], ['amber-ink', 'amber'], ['olive', 'panel'], ['alert', 'panel'], ['info', 'panel']];

for (const [nombre, t] of [['oscuro', oscuro], ['claro', claro]]) {
  test(`tema ${nombre}: todo el texto cumple contraste 4,5:1 (WCAG AA)`, () => {
    for (const [a, b] of PARES) {
      const v = contraste(t[a], t[b]);
      assert.ok(v >= 4.5, `${a} sobre ${b}: ${v.toFixed(2)}`);
    }
  });
}

test('el foco del teclado siempre se ve', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline/);
});

test('las ventanas tienen título accesible, se cierran con Escape, retienen el foco y lo devuelven', () => {
  const modal = readFileSync(new URL('../../js/ui/modal.js', import.meta.url), 'utf8');
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=/);
  assert.match(modal, /'Escape'/);
  assert.match(modal, /'Tab'/);
  assert.match(modal, /antes\?\.isConnected\) antes\.focus/);
});
