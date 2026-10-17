import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('../../supabase/migrations/', import.meta.url);
const archivos = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const sql = Object.fromEntries(archivos.map((f) => [f, readFileSync(new URL(f, DIR), 'utf8')]));
const todo = Object.values(sql).join('\n');

/* Nombres de las tablas creadas (sin comillas ni esquema) */
const tablas = [...todo.matchAll(/create table (?:if not exists )?(?:public\.)?"?([a-z_]+)"?/gi)].map((m) => m[1].toLowerCase());

test('las migraciones tienen fecha y número en orden, sin repetirse', () => {
  for (const f of archivos) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, f);
  const numeros = archivos.map((f) => f.slice(0, 14));
  assert.equal(new Set(numeros).size, numeros.length);
});

test('la base de datos tiene muchas tablas (más de 20)', () => {
  assert.ok(new Set(tablas).size > 20, `solo hay ${new Set(tablas).size}`);
});

test('TODAS las tablas tienen seguridad por filas (RLS) activada', () => {
  const sinRls = [...new Set(tablas)].filter((t) =>
    !new RegExp(`alter table (?:public\\.)?"?${t}"? enable row level security`, 'i').test(todo));
  assert.deepEqual(sinRls, [], `tablas sin RLS: ${sinRls.join(', ')}`);
});

/* Tablas internas: RLS activo y SIN políticas = nadie las lee desde el navegador;
   solo las usan funciones de la base de datos (intentos de login, pagos). */
const PRIVADAS = ['login_attempts', 'device_pairing_failures', 'payment_config'];

/* Funciones que corren con permisos del dueño de la base (security definer) */
const funcionesSeguras = [...todo.matchAll(/create (?:or replace )?function[\s\S]*?\$\$;/gi)]
  .map((m) => m[0]).filter((f) => /security definer/i.test(f));

test('las tablas privadas existen y solo se usan desde funciones seguras', () => {
  for (const t of PRIVADAS) {
    assert.ok(tablas.includes(t), `${t} no existe`);
    assert.ok(funcionesSeguras.some((f) => f.includes(t)), `${t} no se usa desde una función segura`);
  }
});

test('cada tabla pública con RLS tiene al menos una política de acceso', () => {
  const sinPolitica = [...new Set(tablas)].filter((t) => !PRIVADAS.includes(t)).filter((t) =>
    !new RegExp(`create policy [\\s\\S]{0,200}? on (?:public\\.)?"?${t}"?\\b`, 'i').test(todo));
  assert.deepEqual(sinPolitica, [], `tablas sin políticas: ${sinPolitica.join(', ')}`);
});

test('las funciones con privilegios fijan el search_path (evita secuestro de funciones)', () => {
  const inseguras = funcionesSeguras.filter((f) => !/set search_path/i.test(f)).map((f) => f.match(/function\s+([\w.]+)/i)[1]);
  assert.deepEqual(inseguras, []);
});
