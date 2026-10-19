/* =========================================================
   GUARDIÁN · Pagos en MODO PRUEBA (simulación para la clase)
   Nada de esto mueve dinero real: el banco, la cuenta y el correo son
   ficticios. Los pagos reales (Wompi) se activarán cuando lo autorice
   el profesor; en ese momento el modo prueba se apaga solo.
   ========================================================= */

/** Datos ficticios que se muestran en la pasarela de prueba (no se pueden cambiar). */
export const DATOS_PRUEBA = Object.freeze({
  banco: 'Banco de Prueba S.A. (ficticio)',
  titular: 'Usuario de Prueba',
  correo: 'pruebas@guardian.test',
  cuenta: '0000 1111 2222 3333',
  documento: 'CC 0000000000',
  celular: '300 000 0000',
  tarjeta: '4000 0000 0000 0002'
});

/** Métodos de pago de prueba (los mismos que acepta la base de datos). */
export const METODOS = [
  { id: 'TRANSFERENCIA_PRUEBA', nombre: 'Transferencia bancaria', detalle: 'Desde una cuenta de ahorros ficticia', icono: 'database' },
  { id: 'BILLETERA_PRUEBA', nombre: 'Billetera móvil', detalle: 'Con un número de celular ficticio', icono: 'phone' },
  { id: 'TARJETA_PRUEBA', nombre: 'Tarjeta de prueba', detalle: 'Débito o crédito ficticia', icono: 'key' }
];

export const nombreMetodo = (id) => METODOS.find((m) => m.id === id)?.nombre ?? id ?? '—';
export const esPagoDePrueba = (p) => p?.provider === 'simulado' || /^SIM-/.test(p?.reference || '');

/** Pasos que se ven mientras "procesa" el banco de prueba (ms aproximados). */
export const PASOS = [
  ['Conectando con el Banco de Prueba…', 900],
  ['Verificando la cuenta ficticia…', 900],
  ['Autorizando la transferencia simulada…', 1100],
  ['Confirmando con Guardián…', 700]
];

/** Esconde la cuenta como en un banco: •••• 3333 */
export const enmascarar = (numero) => '•••• ' + String(numero).replace(/\D/g, '').slice(-4);

export const pesos = (centavos) => '$' + Math.round(Number(centavos) / 100).toLocaleString('es-CO');

/** Texto del correo de confirmación SIMULADO (no se envía a ningún correo real). */
export function correoDeConfirmacion({ reference, amount_cents, metodo, vence, aprobado }, nombre = DATOS_PRUEBA.titular) {
  const fecha = (t) => new Date(t).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
  return {
    para: DATOS_PRUEBA.correo,
    asunto: `[PRUEBA] Guardián Pro activado · ${reference}`,
    cuerpo: [
      `Hola, ${nombre}:`,
      '',
      'Tu pago SIMULADO fue aprobado y Guardián Pro quedó activo.',
      '',
      `Referencia: ${reference}`,
      `Valor: ${pesos(amount_cents)} COP (no se cobró dinero real)`,
      `Medio: ${nombreMetodo(metodo)} · ${DATOS_PRUEBA.banco}`,
      `Fecha: ${fecha(aprobado)}`,
      `Pro activo hasta: ${fecha(vence)}`,
      '',
      'Este es un correo de MODO PRUEBA para la demostración del proyecto.',
      'Los pagos reales se activarán con la autorización del profesor.'
    ].join('\n')
  };
}
