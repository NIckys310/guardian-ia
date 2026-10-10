/* =========================================================
   GUARDIÁN · Función "identify": Claude con visión identifica la especie
   GET  → { configured, model }   (para saber si la IA avanzada está lista)
   POST { image: <JPEG base64>, kind: 'identify' | 'auto' } → ficha en JSON
   ========================================================= */
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, hasKey, json, requireUser, overLimit, logUsage } from '../lib/guard.mjs';

const GRUPOS = ['felino', 'ave', 'primate', 'reptil', 'anfibio', 'acuatico', 'oso', 'herbivoro', 'mamifero', 'insecto', 'domestico'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_animal', 'nombre', 'cientifico', 'confianza', 'estado', 'grupo', 'habitat', 'reproduccion', 'dieta', 'distribucion', 'lat', 'lng', 'amenaza_humana', 'motivo_amenaza'],
  properties: {
    es_animal: { type: 'boolean' },
    nombre: { type: 'string', description: 'Nombre común en español' },
    cientifico: { type: 'string' },
    confianza: { type: 'number', description: 'De 0 a 1' },
    estado: { type: 'string', description: 'Categoría UICN en español con su sigla, ej. Vulnerable (VU)' },
    grupo: { type: 'string', enum: GRUPOS },
    habitat: { type: 'string' },
    reproduccion: { type: 'string' },
    dieta: { type: 'string' },
    distribucion: { type: 'string' },
    lat: { type: 'number', description: 'Punto representativo de su distribución natural' },
    lng: { type: 'number' },
    amenaza_humana: { type: 'boolean' },
    motivo_amenaza: { type: 'string' }
  }
};

const PROMPT = `Eres biólogo de campo y apoyas a guardaparques en Colombia. Analiza la foto.
- Identifica el animal principal con el nombre común usado en Colombia cuando exista.
- Si no hay ningún animal, responde es_animal=false y deja los textos vacíos.
- Cada texto (hábitat, reproducción, dieta, distribución) en una o dos frases claras.
- amenaza_humana=true solo si ves armas, trampas, redes, animales cazados o personas cazando; explica en motivo_amenaza.
- Si no estás seguro de la especie, baja la confianza y da el nivel taxonómico que sí puedas confirmar.`;

export default async (req) => {
  if (req.method === 'GET') return json(200, { configured: hasKey(), model: MODEL() });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!hasKey()) return json(503, { error: 'La IA avanzada aún no está configurada (falta ANTHROPIC_API_KEY en Netlify).' });

  const who = await requireUser(req);
  if (who instanceof Response) return who;
  if (await overLimit(who.token)) return json(429, { error: 'Llegaste al límite de consultas de IA por hora.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Solicitud inválida' }); }
  const image = typeof body.image === 'string' ? body.image : '';
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return json(400, { error: 'Falta la imagen' });
  if (image.length > 2_000_000) return json(413, { error: 'La imagen es demasiado grande (máximo 1,5 MB).' });
  const kind = body.kind === 'auto' ? 'auto' : 'identify';

  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.create({
      model: MODEL(),
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT }
        ]
      }]
    });
    await logUsage(who.token, { kind, model: msg.model, input_tokens: msg.usage.input_tokens, output_tokens: msg.usage.output_tokens, ok: msg.stop_reason !== 'refusal' });
    if (msg.stop_reason === 'refusal') return json(422, { error: 'La IA no pudo analizar esta imagen.' });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const card = JSON.parse(text);
    card.confianza = Math.max(0, Math.min(1, Number(card.confianza) || 0));
    if (!GRUPOS.includes(card.grupo)) card.grupo = 'mamifero';
    return json(200, { ...card, modelo: msg.model });
  } catch (e) {
    await logUsage(who.token, { kind, model: MODEL(), ok: false });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'La IA está muy ocupada. Intenta en un minuto.' });
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: 'La clave de Anthropic en Netlify no es válida.' });
    if (e instanceof Anthropic.BadRequestError) return json(400, { error: 'La IA rechazó la solicitud: ' + e.message.slice(0, 160) });
    if (e instanceof Anthropic.APIError) return json(502, { error: `Error de la IA (${e.status}).` });
    if (e instanceof SyntaxError) return json(502, { error: 'La IA devolvió una respuesta incompleta. Intenta de nuevo.' });
    console.error(e);
    return json(500, { error: 'Error inesperado en el servidor.' });
  }
};
