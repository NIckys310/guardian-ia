/* =========================================================
   GUARDIÁN · Pagos en MODO PRUEBA (simulación para la clase)
   Nada de esto mueve dinero real: el banco, la cuenta y el correo son
   ficticios. Los pagos reales (Wompi) se activarán cuando lo autorice
   el profesor; en ese momento el modo prueba se apaga solo.
   ========================================================= */
import { LOCALE } from '../core/i18n.js';

/** Datos ficticios que se muestran en la pasarela de prueba (no se pueden cambiar). */
export const TEST_DATA = Object.freeze({
  banco: 'Banco de Prueba S.A. (ficticio)',
  titular: 'Usuario de Prueba',
  correo: 'pruebas@guardian.test',
  cuenta: '0000 1111 2222 3333',
  documento: 'CC 0000000000',
  celular: '300 000 0000',
  tarjeta: '4000 0000 0000 0002'
});

/** Métodos de pago de prueba (los mismos que acepta la base de datos). */
export const METHODS = [
  { id: 'TRANSFERENCIA_PRUEBA', nombre: 'Transferencia bancaria', detalle: 'Desde una cuenta de ahorros ficticia', icono: 'database' },
  { id: 'BILLETERA_PRUEBA', nombre: 'Billetera móvil', detalle: 'Con un número de celular ficticio', icono: 'phone' },
  { id: 'TARJETA_PRUEBA', nombre: 'Tarjeta de prueba', detalle: 'Débito o crédito ficticia', icono: 'key' }
];

export const methodName = (id) => METHODS.find((m) => m.id === id)?.nombre ?? id ?? '—';
export const isTestPayment = (p) => p?.provider === 'simulado' || /^SIM-/.test(p?.reference || '');

/** Pasos que se ven mientras "procesa" el banco de prueba (ms aproximados). */
export const STEPS = [
  ['Conectando con el Banco de Prueba…', 900],
  ['Verificando la cuenta ficticia…', 900],
  ['Autorizando la transferencia simulada…', 1100],
  ['Confirmando con Guardián…', 700]
];

/** Esconde la cuenta como en un banco: •••• 3333 */
export const mask = (number) => '•••• ' + String(number).replace(/\D/g, '').slice(-4);

export const formatPesos = (cents) => '$' + Math.round(Number(cents) / 100).toLocaleString(LOCALE);

/** Texto del correo de confirmación SIMULADO (no se envía a ningún correo real). */
export function confirmationEmail({ reference, amount_cents, metodo: method, vence: expires, aprobado: approved }, nameValue = TEST_DATA.titular) {
  const date = (t) => new Date(t).toLocaleString(LOCALE, { dateStyle: 'long', timeStyle: 'short' });
  return {
    para: TEST_DATA.correo,
    asunto: `[PRUEBA] Guardián Pro activado · ${reference}`,
    cuerpo: [
      `Hola, ${nameValue}:`,
      '',
      'Tu pago SIMULADO fue aprobado y Guardián Pro quedó activo.',
      '',
      `Referencia: ${reference}`,
      `Valor: ${formatPesos(amount_cents)} COP (no se cobró dinero real)`,
      `Medio: ${methodName(method)} · ${TEST_DATA.banco}`,
      `Fecha: ${date(approved)}`,
      `Pro activo hasta: ${date(expires)}`,
      '',
      'Este es un correo de MODO PRUEBA para la demostración del proyecto.',
      'Los pagos reales se activarán con la autorización del profesor.'
    ].join('\n')
  };
}
