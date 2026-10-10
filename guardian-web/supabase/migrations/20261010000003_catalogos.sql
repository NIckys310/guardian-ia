-- =========================================================
-- GUARDIÁN · 03 · Catálogos: grupos, estados UICN, amenazas y especies
-- Cualquier cuenta puede leerlos; solo un admin los modifica.
-- =========================================================
create table if not exists public.species_groups (
  id      text primary key,
  nombre  text not null,
  color   text not null,
  ejemplo text not null default ''
);

create table if not exists public.conservation_statuses (
  code   text primary key,          -- CR, EN, VU, NT, LC, DD, NE, DOM
  nombre text not null,
  nivel  int  not null              -- 0 = sin riesgo ... 5 = extinto
);

create table if not exists public.threat_types (
  clase  text primary key,          -- clase de COCO-SSD
  nombre text not null,
  umbral numeric(4,3) not null default 0.6
);

create table if not exists public.species (
  id           text primary key,
  grupo        text references public.species_groups (id),
  nombre       text not null,
  cientifico   text not null default '',
  estado       text not null default '',
  estado_code  text references public.conservation_statuses (code),
  habitat      text not null default '',
  reproduccion text not null default '',
  dieta        text not null default '',
  distribucion text not null default '',
  origen       text not null default 'catalogo',   -- catalogo | claude
  created_at   timestamptz not null default now()
);
create index if not exists species_grupo_idx on public.species (grupo);

create table if not exists public.species_zones (
  id         bigint generated always as identity primary key,
  species_id text not null references public.species (id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  radio_km   numeric not null
);
create index if not exists species_zones_species_idx on public.species_zones (species_id);

alter table public.species_groups enable row level security;
alter table public.conservation_statuses enable row level security;
alter table public.threat_types enable row level security;
alter table public.species enable row level security;
alter table public.species_zones enable row level security;

create policy "grupos: lectura" on public.species_groups for select using (auth.role() = 'authenticated');
create policy "grupos: admin" on public.species_groups for all using (public.es_admin()) with check (public.es_admin());
create policy "uicn: lectura" on public.conservation_statuses for select using (auth.role() = 'authenticated');
create policy "uicn: admin" on public.conservation_statuses for all using (public.es_admin()) with check (public.es_admin());
create policy "amenazas: lectura" on public.threat_types for select using (auth.role() = 'authenticated');
create policy "amenazas: admin" on public.threat_types for all using (public.es_admin()) with check (public.es_admin());
create policy "especies: lectura" on public.species for select using (auth.role() = 'authenticated');
-- Las especies nuevas que identifica Claude las puede agregar cualquier cuenta
create policy "especies: agregar desde IA" on public.species for insert with check (auth.role() = 'authenticated' and origen = 'claude');
create policy "especies: admin" on public.species for all using (public.es_admin()) with check (public.es_admin());
create policy "zonas: lectura" on public.species_zones for select using (auth.role() = 'authenticated');
create policy "zonas: admin" on public.species_zones for all using (public.es_admin()) with check (public.es_admin());

-- Datos fijos
insert into public.conservation_statuses (code, nombre, nivel) values
  ('EX', 'Extinto', 6), ('EW', 'Extinto en estado silvestre', 5), ('CR', 'En peligro crítico', 4),
  ('EN', 'En peligro', 3), ('VU', 'Vulnerable', 2), ('NT', 'Casi amenazado', 1),
  ('LC', 'Preocupación menor', 0), ('DD', 'Datos insuficientes', 0), ('NE', 'No evaluado', 0),
  ('DOM', 'Doméstico', 0)
on conflict (code) do update set nombre = excluded.nombre, nivel = excluded.nivel;

insert into public.threat_types (clase, nombre, umbral) values
  ('person', 'Persona', 0.6), ('car', 'Vehículo', 0.6), ('truck', 'Camión', 0.6),
  ('motorcycle', 'Motocicleta', 0.6), ('knife', 'Arma blanca', 0.55), ('boat', 'Embarcación', 0.6)
on conflict (clase) do update set nombre = excluded.nombre;

insert into public.species_groups (id, nombre, color, ejemplo) values
  ('felino', 'Felinos', '#f0a43a', 'Jaguar, puma, ocelote'),
  ('ave', 'Aves', '#4cc3e0', 'Tucán, cóndor, colibrí'),
  ('primate', 'Primates', '#c48d5c', 'Mono aullador, tití'),
  ('reptil', 'Reptiles', '#8fb35a', 'Tortuga, iguana, caimán'),
  ('anfibio', 'Anfibios', '#3fd7a0', 'Rana dorada, sapo'),
  ('acuatico', 'Fauna acuática', '#3b7ddd', 'Delfín rosado, manatí, tiburón'),
  ('oso', 'Osos', '#9b7be0', 'Oso de anteojos, panda'),
  ('herbivoro', 'Grandes herbívoros', '#e2cf5d', 'Danta, venado, elefante'),
  ('mamifero', 'Otros mamíferos', '#e07aa5', 'Perezoso, nutria, zorro'),
  ('insecto', 'Insectos', '#d96fe0', 'Mariposa morpho'),
  ('domestico', 'Domésticos', '#a8b0a2', 'Perro, gato, vaca')
on conflict (id) do update set nombre = excluded.nombre, color = excluded.color, ejemplo = excluded.ejemplo;
