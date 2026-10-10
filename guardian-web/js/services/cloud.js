/* =========================================================
   GUARDIÁN · Conexión con Supabase
   La librería se descarga solo si la nube está configurada.
   ========================================================= */
import { CONFIG, cloudConfigured } from '../config.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
let client = null;
let loading = null;

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('No se pudo descargar ' + src.split('/').slice(-1)[0]));
    document.head.append(s);
  });
}

export async function getClient() {
  if (!cloudConfigured()) return null;
  if (client) return client;
  loading ||= loadScript(SUPABASE_JS).then(() => {
    client = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'guardian.auth' },
      realtime: { params: { eventsPerSecond: 5 } }
    });
    return client;
  });
  return loading;
}

export const sb = () => client;   // acceso rápido cuando ya se cargó

/* Mensajes de error comprensibles */
export function friendlyError(e) {
  const m = (e?.message || String(e || '')).toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Confirma tu correo antes de entrar.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should') || m.includes('weak')) return 'La contraseña no cumple los requisitos de seguridad.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera unos minutos.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión a internet.';
  if (m.includes('jwt') || m.includes('session')) return 'Tu sesión venció. Vuelve a iniciar sesión.';
  if (m.includes('invalid totp') || m.includes('invalid code')) return 'El código de verificación no es válido.';
  return e?.message || 'Ocurrió un error inesperado.';
}
