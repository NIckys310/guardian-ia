import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sql = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, DIR), 'utf8')]));
const everything = Object.values(sql).join('\n');

/* Nombres de las tablas creadas (sin comillas ni esquema) */
const tables = [...everything.matchAll(/create table (?:if not exists )?(?:public\.)?"?([a-z_]+)"?/gi)].map((m) => m[1].toLowerCase());

test('las migraciones tienen fecha y número en orden, sin repetirse', () => {
  for (const f of files) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
  const numbers = files.map((f) => f.slice(0, 14));
  assert.equal(new Set(numbers).size, numbers.length);
});

test('la base de datos tiene muchas tablas (más de 20)', () => {
  assert.ok(new Set(tables).size > 20, `solo hay ${new Set(tables).size}`);
});

test('TODAS las tablas tienen seguridad por filas (RLS) activada', () => {
  const withoutRls = [...new Set(tables)].filter((t) =>
    !new RegExp(`alter table (?:public\\.)?"?${t}"? enable row level security`, 'i').test(everything));
  assert.deepEqual(withoutRls, [], `tablas sin RLS: ${withoutRls.join(', ')}`);
});

/* Tablas internas: RLS activo y SIN políticas = nadie las lee desde el navegador;
   solo las usan funciones de la base de datos (intentos de login, pagos). */
const PRIVATE_TABLES = ['login_attempts', 'device_pairing_failures', 'payment_config'];

/* Funciones que corren con permisos del dueño de la base (security definer) */
const secureFunctions = [...everything.matchAll(/create (?:or replace )?function[\s\S]*?\$\$;/gi)]
  .map((m) => m[0]).filter((f) => /security definer/i.test(f));

test('las tablas privadas existen y solo se usan desde funciones seguras', () => {
  for (const t of PRIVATE_TABLES) {
    assert.ok(tables.includes(t), `${t} no existe`);
    assert.ok(secureFunctions.some((f) => f.includes(t)), `${t} no se usa desde una función segura`);
  }
});

test('cada tabla pública con RLS tiene al menos una política de acceso', () => {
  const withoutPolicy = [...new Set(tables)].filter((t) => !PRIVATE_TABLES.includes(t)).filter((t) =>
    !new RegExp(`create policy [\\s\\S]{0,200}? on (?:public\\.)?"?${t}"?\\b`, 'i').test(everything));
  assert.deepEqual(withoutPolicy, [], `tablas sin políticas: ${withoutPolicy.join(', ')}`);
});

test('las funciones con privilegios fijan el search_path (evita secuestro de funciones)', () => {
  const insecure = secureFunctions.filter((f) => !/set search_path/i.test(f)).map((f) => f.match(/function\s+([\w.]+)/i)[1]);
  assert.deepEqual(insecure, []);
});
