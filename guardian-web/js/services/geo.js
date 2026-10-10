/* =========================================================
   GUARDIÁN · Ubicación (GPS del navegador)
   ========================================================= */
import { bus } from '../core/bus.js';

export const DEFAULT_CENTER = [4.6, -74.08];   // Bogotá
export const geo = { pos: null, accuracy: null, watching: false };

export function watchLocation() {
  if (geo.watching || !('geolocation' in navigator)) return;
  geo.watching = true;
  navigator.geolocation.watchPosition((p) => {
    geo.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    geo.accuracy = Math.round(p.coords.accuracy);
    bus.emit('geo:update', geo);
  }, (e) => {
    geo.watching = false;
    bus.emit('geo:error', e);
  }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
}

/* Posición actual; si no hay GPS, el centro del mapa (marcada como aproximada) */
export function currentPos(fallback) {
  if (geo.pos) return { ...geo.pos, aprox: false };
  const c = fallback?.() || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
  return { lat: c.lat, lng: c.lng, aprox: true };
}
