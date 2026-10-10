/* =========================================================
   GUARDIÁN · Datos (avistamientos, alertas, reportes, chat)
   Una sola forma de guardar, sin importar si hay nube:
   - Modo local: todo en IndexedDB.
   - Con nube: Supabase + copia en IndexedDB para trabajar sin internet.
     Si no hay internet, lo nuevo espera en una "bandeja de salida"
     y se sube solo cuando vuelve la conexión.
   Eliminar = mandar a la papelera (deleted_at). Se puede restaurar.
   ========================================================= */
import { ldb, migrateLegacy } from '../core/local-db.js';
import { bus } from '../core/bus.js';
import { uid, nowISO, ms, dataURLtoBlob } from '../core/dom.js';
import { sb } from './cloud.js';
import { auth } from './auth.js';
import { CONFIG } from '../config.js';

export const TYPES = {
  sighting:     { store: 'sightings', table: 'sightings', evt: 'data:sightings', label: 'Avistamiento',
    cols: ['id', 'device_id', 'species_id', 'nombre', 'cientifico', 'estado', 'grupo', 'conf', 'lat', 'lng', 'fuente', 'ia', 'photo_path', 'notas', 'created_at', 'deleted_at', 'deleted_by'] },
  alert:        { store: 'alerts', table: 'alerts', evt: 'data:alerts', label: 'Alerta',
    cols: ['id', 'device_id', 'tipo', 'clase', 'conf', 'lat', 'lng', 'mensaje', 'photo_path', 'atendida', 'created_at', 'deleted_at', 'deleted_by'] },
  report:       { store: 'reports', table: 'reports', evt: 'data:reports', label: 'Reporte',
    cols: ['id', 'titulo', 'desde', 'hasta', 'notas', 'resumen', 'html', 'created_at', 'deleted_at', 'deleted_by'] },
  conversation: { store: 'conversations', table: 'chat_conversations', evt: 'data:conversations', label: 'Conversación',
    cols: ['id', 'titulo', 'created_at', 'updated_at', 'deleted_at'] }
};

export const data = { sightings: [], alerts: [], reports: [], conversations: [], devices: [], ownerId: null, deviceId: null, ready: false };

const cloud = () => auth.isCloud && sb() && auth.user;
const pick = (row, cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
const byNewest = (a, b) => ms(b.created_at) - ms(a.created_at);

export const active = (type) => data[TYPES[type].store].filter((r) => !r.deleted_at);
export function trashed() {
  return Object.entries(TYPES).flatMap(([type, t]) =>
    data[t.store].filter((r) => r.deleted_at).map((r) => ({ type, row: r }))
  ).sort((a, b) => ms(b.row.deleted_at) - ms(a.row.deleted_at));
}

function emit(type) { bus.emit(TYPES[type].evt, data[TYPES[type].store]); bus.emit('data:any', type); }

/* ---------- Carga inicial ---------- */
export async function loadData() {
  await migrateLegacy();
  for (const [type, t] of Object.entries(TYPES)) {
    data[t.store] = (await ldb.all(t.store)).sort(byNewest);
    emit(type);
  }
  if (cloud()) await syncFromCloud();
  else await purgeOldTrashLocal();
  data.ready = true;
  bus.emit('data:ready');
}

async function resolveOwner() {
  data.ownerId = auth.user.id;
  data.deviceId = null;
  if (auth.isDevice) {
    const { data: d } = await sb().from('devices').select('id, owner_id').eq('device_user_id', auth.user.id).is('revoked_at', null).maybeSingle();
    if (d) { data.ownerId = d.owner_id; data.deviceId = d.id; }
  }
}

export async function syncFromCloud() {
  if (!cloud()) return;
  await resolveOwner();
  await migrateLocalToCloud();
  await flushOutbox();
  const since = new Date(Date.now() - 400 * 864e5).toISOString();
  const jobs = Object.entries(TYPES).map(async ([type, t]) => {
    const { data: rows, error } = await sb().from(t.table).select(t.cols.join(','))
      .gte('created_at', since).order('created_at', { ascending: false }).limit(3000);
    if (error) { console.warn('No se pudo leer', t.table, error.message); return; }
    // Conserva las fotos locales (vista instantánea) de lo que se capturó en este equipo
    const localPhotos = new Map(data[t.store].filter((r) => r.photo).map((r) => [r.id, r.photo]));
    const pending = new Set((await ldb.all('outbox')).filter((o) => o.type === type).map((o) => o.rowId));
    const keepPending = data[t.store].filter((r) => pending.has(r.id));
    data[t.store] = [...keepPending, ...rows.filter((r) => !pending.has(r.id)).map((r) => ({ ...r, photo: localPhotos.get(r.id) || null }))].sort(byNewest);
    await ldb.clear(t.store);
    await ldb.putMany(t.store, data[t.store]);
    emit(type);
  });
  jobs.push(loadDevices());
  await Promise.all(jobs);
  subscribeRealtime();
}

/* La primera vez que una cuenta principal entra con nube, lo que estaba
   guardado solo en este navegador se sube a la cuenta (no se pierde nada) */
async function migrateLocalToCloud() {
  if (auth.isDevice) return;
  const flag = 'cloudMigrated:' + auth.user.id;
  if (await ldb.getKV(flag)) return;
  let n = 0;
  for (const [type, t] of Object.entries(TYPES)) {
    for (const row of data[t.store]) {
      try { await cloudInsert(type, row); n++; }
      catch (e) { await ldb.put('outbox', { id: uid(), op: 'insert', type, rowId: row.id, extra: {}, at: Date.now() }); }
    }
  }
  const convIds = new Set(data.conversations.map((c) => c.id));
  const msgs = (await ldb.all('messages')).filter((m) => convIds.has(m.conversation_id));
  if (msgs.length) await sb().from('chat_messages').upsert(msgs, { onConflict: 'id', ignoreDuplicates: true });
  await ldb.setKV(flag, true);
  if (n) bus.emit('outbox:flushed', n);
}

/* ---------- Crear ---------- */
export async function insert(type, row, extra = {}) {
  const t = TYPES[type];
  const r = { id: uid(), created_at: nowISO(), deleted_at: null, ...row };
  if (type === 'sighting' || type === 'alert') r.device_id ??= data.deviceId;
  data[t.store].unshift(r);
  await ldb.put(t.store, r);
  emit(type);
  if (cloud()) {
    try { await cloudInsert(type, r, extra); }
    catch (e) {
      console.warn('Guardado en la bandeja de salida', e.message);
      await ldb.put('outbox', { id: uid(), op: 'insert', type, rowId: r.id, extra, at: Date.now() });
    }
  }
  return r;
}

async function cloudInsert(type, r, extra = {}) {
  const t = TYPES[type];
  if (r.photo && !r.photo_path && (type === 'sighting' || type === 'alert')) {
    const path = `${data.ownerId}/${type}-${r.id}.jpg`;
    const { error } = await sb().storage.from('media').upload(path, dataURLtoBlob(r.photo), { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    r.photo_path = path;
    await ldb.put(t.store, r);
  }
  if (type === 'sighting' && extra.species) await ensureSpecies(extra.species);
  let { error } = await sb().from(t.table).upsert(pick(r, t.cols), { onConflict: 'id' });
  // Especie que no está en el catálogo (p. ej. identificada por Claude antes de tener nube): se guarda sin enlace
  if (error?.code === '23503' && type === 'sighting') ({ error } = await sb().from(t.table).upsert({ ...pick(r, t.cols), species_id: null }, { onConflict: 'id' }));
  if (error) throw error;
  if (type === 'sighting' && extra.detections?.length) {
    await sb().from('sighting_detections').insert(extra.detections.map((d) => ({ sighting_id: r.id, clase: d.class, score: +d.score.toFixed(4), bbox: d.bbox.map(Math.round) })));
  }
}

/* Las especies que identifica Claude y no están en el catálogo se agregan */
const knownSpecies = new Set();
async function ensureSpecies(sp) {
  if (knownSpecies.has(sp.id)) return;
  const { error } = await sb().from('species').upsert({
    id: sp.id, grupo: sp.grupo || null, nombre: sp.nombre, cientifico: sp.cientifico || '', estado: sp.estado || '',
    habitat: sp.habitat || '', reproduccion: sp.reproduccion || '', dieta: sp.dieta || '', distribucion: sp.distribucion || '', origen: 'claude'
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (!error) knownSpecies.add(sp.id);
}

/* ---------- Bandeja de salida (sin internet) ---------- */
let flushing = false;
export async function flushOutbox() {
  if (!cloud() || flushing) return 0;
  flushing = true;
  let n = 0;
  try {
    const items = (await ldb.all('outbox')).sort((a, b) => a.at - b.at);
    for (const it of items) {
      const t = TYPES[it.type];
      try {
        if (it.op === 'insert') {
          const row = await ldb.get(t.store, it.rowId);
          if (row) await cloudInsert(it.type, row, it.extra || {});
        } else if (it.op === 'update') {
          const { error } = await sb().from(t.table).update(it.patch).in('id', it.ids); if (error) throw error;
        } else if (it.op === 'delete') {
          const { error } = await sb().from(t.table).delete().in('id', it.ids); if (error) throw error;
        }
        await ldb.del('outbox', it.id); n++;
      } catch (e) { console.warn('Aún sin subir', e.message); break; }
    }
  } finally { flushing = false; }
  if (n) bus.emit('outbox:flushed', n);
  return n;
}
addEventListener('online', () => flushOutbox());
export async function outboxCount() { return (await ldb.all('outbox')).length; }

/* ---------- Actualizar, papelera, restaurar, eliminar ---------- */
export async function update(type, ids, patch) {
  const t = TYPES[type];
  ids = [].concat(ids);
  const rows = data[t.store].filter((r) => ids.includes(r.id));
  rows.forEach((r) => Object.assign(r, patch));
  await ldb.putMany(t.store, rows);
  emit(type);
  if (cloud()) {
    const { error } = await sb().from(t.table).update(patch).in('id', ids);
    if (error) await ldb.put('outbox', { id: uid(), op: 'update', type, ids, patch, at: Date.now() });
  }
}

export const moveToTrash = (type, ids) => update(type, ids, { deleted_at: nowISO(), ...(cloud() && type !== 'conversation' ? { deleted_by: auth.user.id } : {}) });
export const restore = (type, ids) => update(type, ids, { deleted_at: null, ...(type !== 'conversation' ? { deleted_by: null } : {}) });

export async function moveAllToTrash(type) {
  const ids = active(type).map((r) => r.id);
  if (ids.length) await moveToTrash(type, ids);
  return ids.length;
}

export async function restoreAll() {
  let n = 0;
  for (const type of Object.keys(TYPES)) {
    const ids = data[TYPES[type].store].filter((r) => r.deleted_at).map((r) => r.id);
    if (ids.length) { await restore(type, ids); n += ids.length; }
  }
  return n;
}

/* Borrado definitivo (solo desde la papelera) */
export async function purge(type, ids) {
  const t = TYPES[type];
  ids = [].concat(ids);
  const rows = data[t.store].filter((r) => ids.includes(r.id) && r.deleted_at);
  if (!rows.length) return 0;
  const realIds = rows.map((r) => r.id);
  data[t.store] = data[t.store].filter((r) => !realIds.includes(r.id));
  await ldb.delMany(t.store, realIds);
  if (type === 'conversation') {
    const msgs = (await ldb.all('messages')).filter((m) => realIds.includes(m.conversation_id));
    await ldb.delMany('messages', msgs.map((m) => m.id));
  }
  emit(type);
  if (cloud()) {
    const paths = rows.map((r) => r.photo_path).filter(Boolean);
    if (paths.length) await sb().storage.from('media').remove(paths).catch(() => {});
    const { error } = await sb().from(t.table).delete().in('id', realIds);
    if (error) await ldb.put('outbox', { id: uid(), op: 'delete', type, ids: realIds, at: Date.now() });
  }
  return realIds.length;
}

export async function emptyTrash() {
  let n = 0;
  for (const type of Object.keys(TYPES)) {
    const ids = data[TYPES[type].store].filter((r) => r.deleted_at).map((r) => r.id);
    if (ids.length) n += await purge(type, ids);
  }
  return n;
}

async function purgeOldTrashLocal() {
  const limit = Date.now() - CONFIG.papeleraDias * 864e5;
  for (const type of Object.keys(TYPES)) {
    const ids = data[TYPES[type].store].filter((r) => r.deleted_at && ms(r.deleted_at) < limit).map((r) => r.id);
    if (ids.length) await purge(type, ids);
  }
}

/* ---------- Fotos ---------- */
const signed = new Map();
export async function photoURL(row) {
  if (!row) return null;
  if (row.photo) return row.photo;
  if (!row.photo_path || !cloud()) return null;
  const hit = signed.get(row.photo_path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data: d } = await sb().storage.from('media').createSignedUrl(row.photo_path, 3600);
  if (!d?.signedUrl) return null;
  signed.set(row.photo_path, { url: d.signedUrl, exp: Date.now() + 3500_000 });
  return d.signedUrl;
}

export async function detectionsOf(sightingId) {
  if (!cloud()) return [];
  const { data: d } = await sb().from('sighting_detections').select('clase, score, bbox').eq('sighting_id', sightingId);
  return d || [];
}

/* ---------- Mensajes del asistente ---------- */
export async function messagesOf(conversationId) {
  let local = (await ldb.all('messages')).filter((m) => m.conversation_id === conversationId);
  if (cloud()) {
    const { data: rows } = await sb().from('chat_messages').select('*').eq('conversation_id', conversationId).order('created_at');
    if (rows) { local = rows; await ldb.putMany('messages', rows); }
  }
  return local.sort((a, b) => ms(a.created_at) - ms(b.created_at));
}

export async function addMessage(conversationId, role, content) {
  const m = { id: uid(), conversation_id: conversationId, role, content, created_at: nowISO() };
  await ldb.put('messages', m);
  if (cloud()) {
    const { error } = await sb().from('chat_messages').insert(m);
    if (error) console.warn('Mensaje solo guardado en este equipo', error.message);
  }
  await update('conversation', conversationId, { updated_at: nowISO() });
  return m;
}

/* ---------- Dispositivos (solo con nube) ---------- */
export async function loadDevices() {
  if (!cloud()) { data.devices = []; bus.emit('data:devices', []); return; }
  const { data: rows } = await sb().from('devices').select('*').order('created_at', { ascending: false });
  data.devices = rows || [];
  bus.emit('data:devices', data.devices);
}

/* ---------- Tiempo real ---------- */
let channel = null;
function subscribeRealtime() {
  if (!cloud() || channel) return;
  const filter = `owner_id=eq.${data.ownerId}`;
  const handle = (type) => async (p) => {
    const t = TYPES[type];
    const list = data[t.store];
    if (p.eventType === 'DELETE') {
      data[t.store] = list.filter((r) => r.id !== p.old.id);
      await ldb.del(t.store, p.old.id);
    } else {
      const i = list.findIndex((r) => r.id === p.new.id);
      const isNew = i < 0;
      const merged = { ...(list[i] || {}), ...p.new };
      if (isNew) list.unshift(merged); else list[i] = merged;
      list.sort(byNewest);
      await ldb.put(t.store, merged);
      if (isNew && p.new.device_id && p.new.device_id !== data.deviceId) bus.emit('remote:new', { type, row: merged });
    }
    emit(type);
  };
  channel = sb().channel('guardian-' + data.ownerId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sightings', filter }, handle('sighting'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter }, handle('alert'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter }, () => loadDevices())
    .subscribe((status) => bus.emit('realtime:status', status));
}

export function resetData() {
  if (channel) { sb()?.removeChannel(channel); channel = null; }
  Object.values(TYPES).forEach((t) => { data[t.store] = []; });
  data.devices = []; data.ownerId = null; data.deviceId = null; data.ready = false;
}
