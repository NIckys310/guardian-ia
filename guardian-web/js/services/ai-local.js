/* =========================================================
   GUARDIÁN · IA local (en el navegador, gratis y sin internet)
   - MobileNet v2 → clasifica la especie (1000 clases de ImageNet)
   - COCO-SSD     → recuadros de animales, personas y vehículos
   Los modelos se descargan en segundo plano: la app abre al instante.
   ========================================================= */
import { loadScript } from './cloud.js';
import { bus } from '../core/bus.js';
import { SPECIES, COCO_ES } from '../data/species.js';
import { COLOMBIA } from '../data/species-colombia.js';

export const ALL_SPECIES = [...COLOMBIA, ...SPECIES];
export { COCO_ES };
export const THREATS = { person: 'Persona', car: 'Vehículo', truck: 'Camión', motorcycle: 'Motocicleta', knife: 'Arma blanca', boat: 'Embarcación' };
export const COCO_ANIMALS = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'];

const LIBS = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.es2017.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'
];

export const ai = { status: 'idle', backend: '', mobilenet: null, coco: null, msLast: 0 };
let loading = null;

function setStatus(status, text) {
  ai.status = status;
  bus.emit('ai:status', { status, text });
}

export function loadModels() {
  if (loading) return loading;
  loading = (async () => {
    try {
      setStatus('loading', 'Descargando IA…');
      await loadScript(LIBS[0]);
      await Promise.all([loadScript(LIBS[1]), loadScript(LIBS[2])]);
      setStatus('loading', 'Preparando IA…');
      await tf.ready();
      tf.enableProdMode();
      const [mn, coco] = await Promise.all([
        mobilenet.load({ version: 2, alpha: 1.0 }),
        cocoSsd.load({ base: 'lite_mobilenet_v2' })
      ]);
      ai.mobilenet = mn; ai.coco = coco; ai.backend = tf.getBackend();
      // Primera pasada en blanco: la siguiente ya es rápida
      const warm = document.createElement('canvas'); warm.width = warm.height = 224;
      await Promise.all([mn.classify(warm, 1), coco.detect(warm, 1)]);
      setStatus('ok', `IA lista · ${ai.backend.toUpperCase()}`);
    } catch (e) {
      console.error(e);
      loading = null;
      setStatus('err', navigator.onLine ? 'No se pudo cargar la IA' : 'Sin internet: la IA se descargará al conectarte');
    }
  })();
  return loading;
}
addEventListener('online', () => { if (ai.status === 'err') loadModels(); });

export const modelsReady = () => Boolean(ai.mobilenet && ai.coco);

/* Analiza una imagen, video o canvas */
export async function analyzeFrame(el, { minConf = 0.3, detectThreats = true } = {}) {
  const t0 = performance.now();
  const [preds, dets] = await Promise.all([ai.mobilenet.classify(el, 5), ai.coco.detect(el, 20, 0.45)]);
  ai.msLast = Math.round(performance.now() - t0);

  let species = null, conf = 0;
  for (const p of preds) {
    if (p.probability < minConf) break;
    const m = matchSpecies(p.className);
    if (m) { species = m; conf = p.probability; break; }
  }
  if (!species) {
    const a = dets.filter((d) => COCO_ANIMALS.includes(d.class)).sort((x, y) => y.score - x.score)[0];
    if (a) { species = ALL_SPECIES.find((s) => s.coco === a.class) || null; conf = a.score; }
  }
  const threat = detectThreats ? dets.filter((d) => THREATS[d.class] && d.score >= 0.6).sort((a, b) => b.score - a.score)[0] || null : null;
  const animalSeen = dets.some((d) => COCO_ANIMALS.includes(d.class)) || preds.some((p) => p.probability >= 0.15);
  return { preds, dets, species, conf, threat, animalSeen, ms: ai.msLast };
}

/* Coincidencia con límites de palabra ("sea lion" no es "lion") */
const cache = new Map();
export function matchSpecies(className) {
  const name = className.toLowerCase();
  if (cache.has(name)) return cache.get(name);
  const sp = ALL_SPECIES.find((s) => s.match.some((k) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(name))) || null;
  cache.set(name, sp);
  return sp;
}

export function boxColor(cls) {
  return THREATS[cls] ? '#e5533d' : COCO_ANIMALS.includes(cls) ? '#8fb35a' : '#e7a93b';
}
export function boxesFor(dets) {
  return dets.map((d) => ({ bbox: d.bbox, color: boxColor(d.class), label: `${COCO_ES[d.class] || d.class} ${Math.round(d.score * 100)}%` }));
}
