/* =========================================================
   GUARDIÁN · Registro de avistamientos y alertas
   Evita repetir: la misma especie máximo cada 30 s y la misma
   alerta máximo cada 20 s.
   ========================================================= */
import { insert } from './repo.js';
import { currentPos } from './geo.js';
import { beep, systemNotify } from './notify.js';
import { btNotify } from './bluetooth.js';
import { THREATS } from './ai-local.js';
import { toast } from '../ui/toast.js';
import { bus } from '../core/bus.js';
import { pct } from '../core/dom.js';

const SIGHTING_COOLDOWN = 30_000;
const ALERT_COOLDOWN = 20_000;
const lastSeen = {}, lastAlert = {};
let mapCenter = null;
export const setMapCenterFn = (fn) => { mapCenter = fn; };

export async function recordSighting(sp, conf, { photo = null, fuente = 'camara', ia = 'local', detections = [], force = false } = {}) {
  const now = Date.now();
  if (!force && now - (lastSeen[sp.id] || 0) < SIGHTING_COOLDOWN) return null;
  lastSeen[sp.id] = now;
  const pos = currentPos(mapCenter);
  const row = await insert('sighting', {
    species_id: sp.id, nombre: sp.nombre, cientifico: sp.cientifico || '', estado: sp.estado || '', grupo: sp.grupo || null,
    conf: +Number(conf).toFixed(4), lat: pos.lat, lng: pos.lng, fuente, ia, photo, notas: pos.aprox ? 'Ubicación aproximada (sin GPS)' : ''
  }, { species: sp, detections });
  beep('ok');
  toast(`Avistamiento registrado: ${sp.nombre} (${pct(conf)})`, 'ok');
  btNotify({ evento: 'avistamiento', especie: sp.nombre, cientifico: sp.cientifico, conf, lat: pos.lat, lng: pos.lng, time: row.created_at });
  return row;
}

export async function raiseAlert(cls, conf, { mensaje, photo = null } = {}) {
  const now = Date.now();
  if (now - (lastAlert[cls] || 0) < ALERT_COOLDOWN) return null;
  lastAlert[cls] = now;
  const pos = currentPos(mapCenter);
  const tipo = THREATS[cls] || 'Amenaza';
  const row = await insert('alert', {
    tipo, clase: cls, conf: +Number(conf).toFixed(4), lat: pos.lat, lng: pos.lng,
    mensaje: mensaje || `Se detectó: ${tipo.toLowerCase()} en zona protegida. Posible caza furtiva.`,
    photo, atendida: false
  });
  beep('alert');
  systemNotify('Guardián · alerta', row.mensaje, 'alerta-' + row.id);
  btNotify({ evento: 'alerta', tipo, clase: cls, conf, lat: pos.lat, lng: pos.lng, mensaje: row.mensaje, time: row.created_at });
  toast(row.mensaje, 'err', { action: { label: 'Ver', fn: () => bus.emit('nav:go', 'alertas') }, ms: 7000 });
  return row;
}
