import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const SALTAR = new Set(['node_modules', '.netlify', 'tests', '.git']);

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (SALTAR.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(js|mjs|html|json|sql|toml|md|css)$/.test(n) ? [p] : [];
  });
}
const codigo = archivos(RAIZ).map((p) => ({ p: p.slice(RAIZ.length), t: readFileSync(p, 'utf8') }));

test('ninguna clave de Anthropic (sk-ant-…) está escrita en el código', () => {
  assert.deepEqual(codigo.filter((f) => /sk-ant-[a-z0-9]/i.test(f.t)).map((f) => f.p), []);
});

test('ninguna clave service_role de Supabase está escrita en el código', () => {
  // Las claves service_role son JWT con "role":"service_role" o claves nuevas sb_secret_…
  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
  const malos = codigo.filter((f) => jwt.test(f.t) || /sb_secret_[A-Za-z0-9]/.test(f.t)).map((f) => f.p);
  assert.deepEqual(malos, []);
});

test('la configuración pública solo usa la clave "publishable" de Supabase', () => {
  const cfg = readFileSync(join(RAIZ, 'js/config.js'), 'utf8');
  const clave = cfg.match(/supabaseKey:\s*'([^']*)'/)[1];
  assert.ok(clave === '' || clave.startsWith('sb_publishable_'), 'la clave del navegador debe ser publishable');
});

test('las llaves privadas de Wompi no están en el código', () => {
  assert.deepEqual(codigo.filter((f) => /prv_(prod|test)_[A-Za-z0-9]{8,}|prod_integrity_[A-Za-z0-9]{8,}/.test(f.t)).map((f) => f.p), []);
});
