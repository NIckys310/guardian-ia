import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEST_DATA, METHODS, STEPS, methodName, isTestPayment, mask, formatPesos, confirmationEmail } from '../../js/services/pago-prueba.js';

const sql = readFileSync(new URL('../../supabase/migrations/20261018000015_pagos_de_prueba.sql', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../js/views/pro.js', import.meta.url), 'utf8');

test('los datos de prueba son ficticios (banco, correo y cuenta)', () => {
  assert.match(TEST_DATA.banco, /ficticio/i);
  assert.match(TEST_DATA.correo, /@guardian\.test$/, 'el dominio .test no existe en internet');
  assert.match(TEST_DATA.cuenta.replace(/\D/g, ''), /^0000/);
  assert.ok(Object.isFrozen(TEST_DATA), 'nadie puede cambiar los datos de prueba');
});

test('hay 3 medios de pago de prueba y la base de datos acepta los mismos', () => {
  assert.equal(METHODS.length, 3);
  for (const m of METHODS) {
    assert.match(m.id, /_PRUEBA$/);
    assert.ok(sql.includes(`'${m.id}'`), `${m.id} no está en la base de datos`);
  }
});

test('nombre del medio de pago', () => {
  assert.equal(methodName('TRANSFERENCIA_PRUEBA'), 'Transferencia bancaria');
  assert.equal(methodName('NEQUI'), 'NEQUI');
  assert.equal(methodName(undefined), '—');
});

test('reconoce los pagos de prueba en el historial', () => {
  assert.equal(isTestPayment({ provider: 'simulado' }), true);
  assert.equal(isTestPayment({ reference: 'SIM-20261018-ABCD1234' }), true);
  assert.equal(isTestPayment({ provider: 'wompi', reference: 'GDN-20261018-x' }), false);
  assert.equal(isTestPayment(null), false);
});

test('la cuenta se muestra escondida y el valor en pesos', () => {
  assert.equal(mask('0000 1111 2222 3333'), '•••• 3333');
  assert.match(formatPesos(1_490_000), /^\$14[.,]900$/);
});

test('la simulación tiene pasos que se ven mientras procesa', () => {
  assert.ok(STEPS.length >= 3);
  for (const [textValue, ms] of STEPS) { assert.ok(textValue.endsWith('…')); assert.ok(ms > 0 && ms < 3000); }
});

test('el correo de confirmación dice claramente que es PRUEBA y no cobra dinero', () => {
  const c = confirmationEmail({ reference: 'SIM-1', amount_cents: 1_490_000, metodo: 'BILLETERA_PRUEBA', vence: '2026-11-17T12:00:00Z', aprobado: '2026-10-18T12:00:00Z' }, 'Nicoll');
  assert.equal(c.para, TEST_DATA.correo);
  assert.match(c.asunto, /^\[PRUEBA\]/);
  assert.match(c.cuerpo, /Hola, Nicoll/);
  assert.match(c.cuerpo, /no se cobró dinero real/);
  assert.match(c.cuerpo, /autorización del profesor/);
  assert.match(c.cuerpo, /SIM-1/);
});

test('la base de datos solo permite simular mientras NO haya claves reales de Wompi', () => {
  assert.match(sql, /function public\.modo_prueba_pagos\(\)/);
  assert.match(sql, /wompi_public_key = '' or integrity_secret = ''/);
  assert.match(sql, /if not public\.modo_prueba_pagos\(\) then\s+raise exception/);
});

test('los pagos simulados quedan marcados y nunca se confunden con los reales', () => {
  assert.match(sql, /'SIM-'/);
  assert.match(sql, /'simulado'/);
});

test('hay límite de 5 pagos de prueba por día y no lo pueden usar visitantes sin cuenta', () => {
  assert.match(sql, />= 5 then/);
  assert.match(sql, /revoke execute on function public\.simular_pago\(text\) from anon/);
  assert.match(sql, /revoke execute on function public\.cancelar_prueba\(\) from anon/);
});

test('la pantalla muestra el aviso MODO PRUEBA y que se activará con autorización del profesor', () => {
  assert.match(view, /MODO PRUEBA/);
  assert.match(view, /autorización del profesor/);
  assert.match(view, /readonly/, 'los datos ficticios no se pueden editar (nadie escribe datos reales)');
});

test('la pantalla de Pro nunca se queda cargando: tiene mensaje de error y reintentar', () => {
  assert.match(view, /showError/);
  assert.match(view, /data-reintentar/);
});
