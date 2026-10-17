import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8');
const existe = (p) => existsSync(join(RAIZ, p.replace(/^\.\//, '')));
const sw = leer('sw.js');
const SHELL = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

const todos = (dir, ext) => readdirSync(join(RAIZ, dir), { recursive: true })
  .filter((f) => f.endsWith(ext)).map((f) => `./${dir}/${f.replace(/\\/g, '/')}`);

test('el service worker tiene número de versión', () => {
  assert.match(sw, /const VERSION = 'guardian-v\d+'/);
});

test('todos los archivos que guarda el service worker existen', () => {
  assert.deepEqual(SHELL.filter((p) => p !== './' && !existe(p)), []);
});

test('ningún archivo JS o CSS de la app se quedó por fuera del modo sin internet', () => {
  const faltan = [...todos('js', '.js'), ...todos('css', '.css')].filter((p) => !SHELL.includes(p));
  assert.deepEqual(faltan, []);
});

test('el service worker nunca guarda las respuestas de las funciones del servidor', () => {
  assert.match(sw, /startsWith\('\/\.netlify\/'\)\) return/);
});

test('el manifest permite instalar la app (nombre, colores, íconos)', () => {
  const m = JSON.parse(leer('manifest.json'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'es');
  for (const i of m.icons) assert.ok(existe(i.src), `falta el ícono ${i.src}`);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'falta ícono maskable para Android');
  assert.ok(m.icons.some((i) => i.sizes === '512x512'), 'falta ícono de 512 px');
});

test('todo lo que carga index.html existe', () => {
  const html = leer('index.html');
  const locales = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#|mailto:)([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  assert.ok(locales.length > 0);
  assert.deepEqual(locales.filter((p) => !existe(p)), []);
});

test('index.html está en español y se adapta al celular', () => {
  const html = leer('index.html');
  assert.match(html, /<html lang="es"/);
  assert.match(html, /name="viewport"[^>]*width=device-width/);
});
