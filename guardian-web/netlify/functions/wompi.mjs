/* =========================================================
   GUARDIÁN · Función "wompi": recibe la confirmación de pago de Wompi
   Wompi llama aquí cuando un pago cambia de estado. La firma del evento
   se verifica dentro de la base de datos (con el secreto de eventos que
   solo está allí), así que esta función no necesita claves secretas.
   URL para configurar en Wompi → Desarrolladores → URL de eventos:
     https://guardian-fauna.netlify.app/.netlify/functions/wompi
   ========================================================= */
import { json, rpcAnon } from '../lib/guard.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  let evento;
  try { evento = await req.json(); } catch { return json(400, { error: 'Evento inválido' }); }
  if (evento?.event !== 'transaction.updated' || !evento?.signature?.checksum) return json(200, { ok: true, ignorado: true });

  const r = await rpcAnon('wompi_evento', { p_evento: evento });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.ok) {
    console.warn('Evento de Wompi rechazado', out.error || r.status);
    // 200 igualmente para que Wompi no reintente eventos falsos para siempre
    return json(200, { ok: false });
  }
  return json(200, { ok: true });
};
