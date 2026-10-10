/* =========================================================
   GUARDIÁN · Configuración
   - supabaseUrl y supabaseKey: proyecto de Supabase de Guardián.
     La clave "publishable" (anon) SÍ puede ir aquí: la seguridad la dan
     las reglas RLS de la base de datos. NUNCA pongas la clave service_role.
   - Si están vacías, Guardián funciona en "modo local" (solo este navegador).
   - La clave de Claude NO va aquí: está como secreto en Netlify.
   ========================================================= */
export const CONFIG = {
  supabaseUrl: 'https://jktmtdpgvjlrdxqmdbrp.supabase.co',
  supabaseKey: 'sb_publishable_Z33OvW2c8XZvI7G9AbgrRA_N4yqqYwi',
  functionsBase: '/.netlify/functions',
  appName: 'Guardián',
  inactividadMin: 30,          // cierre de sesión automático por inactividad
  papeleraDias: 30             // días que se guardan los elementos eliminados
};

export const cloudConfigured = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
