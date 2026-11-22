import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP = new Set(['node_modules', '.netlify', 'tests', '.git']);

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(js|mjs|html|json|sql|toml|md|css)$/.test(n) ? [p] : [];
  });
}
const pairingCode = files(ROOT).map((p) => ({ p: p.slice(ROOT.length), t: readFileSync(p, 'utf8') }));

test('ninguna clave de Anthropic (sk-ant-…) está escrita en el código', () => {
  assert.deepEqual(pairingCode.filter((f) => /sk-ant-[a-z0-9]/i.test(f.t)).map((f) => f.p), []);
});

test('ninguna clave service_role de Supabase está escrita en el código', () => {
  // Las claves service_role son JWT con "role":"service_role" o claves nuevas sb_secret_…
  const jwt = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
  const bad = pairingCode.filter((f) => jwt.test(f.t) || /sb_secret_[A-Za-z0-9]/.test(f.t)).map((f) => f.p);
  assert.deepEqual(bad, []);
});

test('la configuración pública solo usa la clave "publishable" de Supabase', () => {
  const cfg = readFileSync(join(ROOT, 'js/config.js'), 'utf8');
  const key = cfg.match(/supabaseKey:\s*'([^']*)'/)[1];
  assert.ok(key === '' || key.startsWith('sb_publishable_'), 'la clave del navegador debe ser publishable');
});

test('las llaves privadas de Wompi no están en el código', () => {
  assert.deepEqual(pairingCode.filter((f) => /prv_(prod|test)_[A-Za-z0-9]{8,}|prod_integrity_[A-Za-z0-9]{8,}/.test(f.t)).map((f) => f.p), []);
});
