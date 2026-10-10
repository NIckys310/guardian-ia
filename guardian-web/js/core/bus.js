/* =========================================================
   GUARDIÁN · Bus de eventos
   Las vistas se avisan entre sí sin depender unas de otras.
   Eventos: data:sightings, data:alerts, data:reports, data:trash,
            ai:status, auth:change, device:change, settings:change
   ========================================================= */
const handlers = new Map();

export const bus = {
  on(evt, fn) {
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  emit(evt, payload) {
    handlers.get(evt)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`Error en el evento ${evt}`, e); }
    });
  }
};
