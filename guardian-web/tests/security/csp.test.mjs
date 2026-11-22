import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../js/config.js';

const readRows = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const toml = readRows('netlify.toml');
const html = readRows('index.html');
const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? '';
const rules = Object.fromEntries(csp.split(';').map((r) => r.trim().split(/\s+/)).filter((p) => p[0]).map(([k, ...v]) => [k, v]));
const allows = (directive, url) => {
  const u = new URL(url);
  return (rules[directive] ?? rules['default-src']).some((s) =>
    s === `${u.protocol}//${u.host}` || s === u.protocol || (s.startsWith('https://*.') && u.host.endsWith(s.slice(10))));
};

test('el sitio tiene política de contenido (CSP)', () => {
  assert.ok(csp, 'falta Content-Security-Policy en netlify.toml');
  assert.deepEqual(rules['default-src'], ["'self'"]);
});

test('la CSP no permite ejecutar texto como código (sin unsafe-eval ni unsafe-inline en scripts)', () => {
  assert.ok(!rules['script-src'].includes("'unsafe-eval'"));
  assert.ok(!rules['script-src'].includes("'unsafe-inline'"));
});

test('la CSP bloquea plugins, marcos externos y cambios de <base>', () => {
  assert.deepEqual(rules['object-src'], ["'none'"]);
  assert.deepEqual(rules['frame-ancestors'], ["'none'"]);
  assert.deepEqual(rules['base-uri'], ["'self'"]);
  assert.deepEqual(rules['form-action'], ["'self'"]);
});

test('index.html no tiene scripts escritos adentro (la CSP los bloquearía)', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
  assert.equal(inline.length, 0, 'mueve el código a un archivo .js');
  assert.ok(!/\son[a-z]+="/i.test(html), 'no uses onclick="…" en el HTML');
});

test('cada librería que carga index.html está permitida por la CSP', () => {
  for (const [, src] of html.matchAll(/<script[^>]+src="(https:[^"]+)"/g)) assert.ok(allows('script-src', src), `script bloqueado: ${src}`);
  for (const [, href] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(https:[^"]+)"|<link[^>]+href="(https:[^"]+)"[^>]+rel="stylesheet"/g)) {
    if (href) assert.ok(allows('style-src', href), `estilo bloqueado: ${href}`);
  }
});

test('las librerías de la IA local están permitidas', () => {
  const aiHandler = readRows('js/services/ai-local.js');
  for (const [url] of aiHandler.matchAll(/https:\/\/[^'"]+\.js/g)) assert.ok(allows('script-src', url), `IA bloqueada: ${url}`);
});

test('se usa TensorFlow sin eval (versión es2017), compatible con la CSP', () => {
  const aiHandler = readRows('js/services/ai-local.js');
  assert.match(aiHandler, /tfjs@[\d.]+\/dist\/tf\.es2017\.min\.js/);
});

test('la CSP permite hablar con el Supabase configurado (datos y tiempo real)', () => {
  if (!CONFIG.supabaseUrl) return;
  assert.ok(allows('connect-src', CONFIG.supabaseUrl), 'falta Supabase en connect-src');
  assert.ok(allows('connect-src', CONFIG.supabaseUrl.replace('https:', 'wss:')), 'falta el tiempo real (wss) en connect-src');
});

test('la CSP permite descargar los modelos de IA y consultar Wikipedia', () => {
  for (const u of ['https://tfhub.dev/x', 'https://www.kaggle.com/x', 'https://storage.googleapis.com/x', 'https://es.wikipedia.org/w/api.php', 'https://en.wikipedia.org/w/api.php']) {
    assert.ok(allows('connect-src', u), u);
  }
});

test('las fotos, los mapas y las cámaras IP de la red local se pueden mostrar', () => {
  assert.ok(allows('img-src', 'https://a.tile.openstreetmap.org/1/1/1.png'));
  assert.ok(allows('img-src', 'http://192.168.1.50:8080/video'));
  assert.ok(rules['img-src'].includes('data:') && rules['img-src'].includes('blob:'));
});
