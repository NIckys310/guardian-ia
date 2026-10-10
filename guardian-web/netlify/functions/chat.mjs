/* =========================================================
   GUARDIÁN · Función "chat": asistente con Claude
   POST { messages: [{role, content}], context: {...resumen de los datos} }
   Responde en vivo (Server-Sent Events): data: {"type":"delta","text":"..."}
   ========================================================= */
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, hasKey, json, requireUser, overLimit, logUsage } from '../lib/guard.mjs';

const SYSTEM = `Eres "Guardián IA", el asistente de una estación de guardaparques en Colombia.
Ayudas con: identificación y biología de fauna, conservación y categorías UICN, protocolos ante
caza furtiva o tráfico de fauna, primeros pasos ante encuentros con animales, y análisis de los
datos de avistamientos y alertas de la estación.

Reglas:
- Responde en español claro y cercano, con pasos concretos. Usa listas cortas cuando ayuden.
- Cuando te pregunten por los datos de la estación, usa SOLO el bloque <datos_estacion>; si algo no
  está ahí, dilo. No inventes cifras.
- Ante riesgo para personas o animales (mordeduras, serpientes venenosas, cazadores armados),
  prioriza la seguridad y recomienda contactar a las autoridades (Policía Ambiental, CAR, Parques
  Nacionales Naturales, línea 123).
- No ayudes a cazar, capturar, traficar o dañar fauna silvestre.`;

const MAX_MSGS = 30, MAX_CHARS = 4000;

function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const msgs = list.slice(-MAX_MSGS)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return null;
  return msgs;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!hasKey()) return json(503, { error: 'El asistente aún no está configurado (falta ANTHROPIC_API_KEY en Netlify).' });

  const who = await requireUser(req);
  if (who instanceof Response) return who;
  if (await overLimit(who.token)) return json(429, { error: 'Llegaste al límite de consultas de IA por hora.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
  const messages = cleanMessages(body.messages);
  if (!messages) return json(400, { error: 'La conversación no es válida.' });
  const datos = JSON.stringify(body.context || {}).slice(0, 12000);

  const client = new Anthropic();
  const enc = new TextEncoder();
  const send = (ctrl, obj) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  const stream = new ReadableStream({
    async start(ctrl) {
      try {
        const s = client.beta.messages.stream({
          model: MODEL(),
          max_tokens: 8000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          system: [
            { type: 'text', text: SYSTEM },
            { type: 'text', text: `<datos_estacion>\n${datos}\n</datos_estacion>` }
          ],
          messages
        });
        for await (const ev of s) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') send(ctrl, { type: 'delta', text: ev.delta.text });
        }
        const final = await s.finalMessage();
        if (final.stop_reason === 'refusal') send(ctrl, { type: 'delta', text: '\n\nNo puedo ayudar con esa solicitud.' });
        await logUsage(who.token, { kind: 'chat', model: final.model, input_tokens: final.usage.input_tokens, output_tokens: final.usage.output_tokens, ok: final.stop_reason !== 'refusal' });
        send(ctrl, { type: 'done' });
      } catch (e) {
        console.error(e);
        let msg = 'Error del asistente.';
        if (e instanceof Anthropic.RateLimitError) msg = 'La IA está muy ocupada. Intenta en un minuto.';
        else if (e instanceof Anthropic.AuthenticationError) msg = 'La clave de Anthropic en Netlify no es válida.';
        else if (e instanceof Anthropic.APIError) msg = `Error de la IA (${e.status}).`;
        await logUsage(who.token, { kind: 'chat', model: MODEL(), ok: false });
        send(ctrl, { type: 'error', error: msg });
      } finally {
        ctrl.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' }
  });
};
