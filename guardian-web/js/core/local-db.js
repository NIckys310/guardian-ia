/* =========================================================
   GUARDIÁN · Base de datos local (IndexedDB)
   Más rápida y con más espacio que localStorage. Se usa:
   - en "modo local" (sin nube), como almacenamiento principal
   - con la nube, como copia para trabajar sin internet
   ========================================================= */
const DB_NAME = 'guardian';
const DB_VERSION = 2;
export const STORES = ['sightings', 'alerts', 'reports', 'conversations', 'messages', 'outbox', 'kv'];

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' }); });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const ldb = {
  async all(store) { return tx(store, 'readonly', (s) => wrap(s.getAll())); },
  async get(store, id) { return tx(store, 'readonly', (s) => wrap(s.get(id))); },
  async put(store, row) { await tx(store, 'readwrite', (s) => { s.put(row); }); return row; },
  async putMany(store, rows) { await tx(store, 'readwrite', (s) => { rows.forEach((r) => s.put(r)); }); return rows; },
  async del(store, id) { return tx(store, 'readwrite', (s) => { s.delete(id); }); },
  async delMany(store, ids) { return tx(store, 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); }); },
  async clear(store) { return tx(store, 'readwrite', (s) => { s.clear(); }); },
  async getKV(k, d = null) { const r = await this.get('kv', k); return r ? r.v : d; },
  async setKV(k, v) { return this.put('kv', { k, v }); },

  /* Espacio usado (aproximado) */
  async estimate() {
    try { const e = await navigator.storage?.estimate?.(); return e || null; } catch { return null; }
  }
};

/* Pasa los datos de la versión anterior (localStorage) a IndexedDB una sola vez */
export async function migrateLegacy() {
  if (await ldb.getKV('legacyMigrated')) return 0;
  let n = 0;
  try {
    const old = JSON.parse(localStorage.getItem('guardian.sightings') || '[]');
    const rows = old.map((s) => ({
      id: s.id, species_id: s.speciesId, nombre: s.nombre, cientifico: s.cientifico, estado: s.estado,
      grupo: null, conf: s.conf, lat: s.lat, lng: s.lng, fuente: s.fuente || 'camara', ia: 'local',
      photo: null, created_at: new Date(s.time).toISOString(), deleted_at: null
    }));
    const alerts = JSON.parse(localStorage.getItem('guardian.alerts') || '[]').map((a) => ({
      id: a.id, tipo: a.tipo, clase: a.clase, conf: a.conf, lat: a.lat, lng: a.lng, mensaje: a.mensaje,
      photo: a.foto || null, atendida: !!a.atendida, created_at: new Date(a.time).toISOString(), deleted_at: null
    }));
    if (rows.length) await ldb.putMany('sightings', rows);
    if (alerts.length) await ldb.putMany('alerts', alerts);
    n = rows.length + alerts.length;
    const st = JSON.parse(localStorage.getItem('guardian.settings') || 'null');
    if (st) {
      delete st.apiKey;   // la clave ya no se guarda en el navegador
      await ldb.setKV('settings', st);
    }
  } catch (e) { console.warn('No se pudieron migrar los datos anteriores', e); }
  await ldb.setKV('legacyMigrated', true);
  return n;
}
