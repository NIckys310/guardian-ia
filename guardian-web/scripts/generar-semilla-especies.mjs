/* =========================================================
   Genera la migración con el catálogo de especies a partir de
   js/data/species.js y js/data/species-colombia.js.
   Uso (desde guardian-web):  node scripts/generar-semilla-especies.mjs
   ========================================================= */
import { writeFileSync } from 'node:fs';
import { SPECIES } from '../js/data/species.js';
import { COLOMBIA } from '../js/data/species-colombia.js';

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const code = (estado = '') => {
  const m = estado.match(/\((EX|EW|CR|EN|VU|NT|LC|DD|NE)\)/);
  if (m) return q(m[1]);
  if (/doméstico/i.test(estado)) return q('DOM');
  if (/crítico/i.test(estado)) return q('CR');
  return 'null';
};

const all = [...COLOMBIA, ...SPECIES];
const rows = all.map((s) => `  (${[q(s.id), q(s.grupo), q(s.nombre), q(s.cientifico), q(s.estado), code(s.estado), q(s.habitat), q(s.reproduccion), q(s.dieta), q(s.distribucion)].join(', ')})`);
const zones = all.flatMap((s) => (s.zonas || []).map(([lat, lng, km]) => `  (${q(s.id)}, ${lat}, ${lng}, ${km})`));

const sql = `-- =========================================================
-- GUARDIÁN · 13 · Catálogo de especies (${all.length} especies)
-- Archivo generado por scripts/generar-semilla-especies.mjs. No lo edites a mano.
-- =========================================================
insert into public.species (id, grupo, nombre, cientifico, estado, estado_code, habitat, reproduccion, dieta, distribucion) values
${rows.join(',\n')}
on conflict (id) do update set grupo = excluded.grupo, nombre = excluded.nombre, cientifico = excluded.cientifico,
  estado = excluded.estado, estado_code = excluded.estado_code, habitat = excluded.habitat,
  reproduccion = excluded.reproduccion, dieta = excluded.dieta, distribucion = excluded.distribucion;

delete from public.species_zones where species_id in (${all.map((s) => q(s.id)).join(', ')});
insert into public.species_zones (species_id, lat, lng, radio_km) values
${zones.join(',\n')};
`;
writeFileSync(new URL('../supabase/migrations/20261010000013_semilla_especies.sql', import.meta.url), sql);
console.log(`Listo: ${all.length} especies y ${zones.length} zonas.`);
