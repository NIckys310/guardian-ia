-- =========================================================
-- GUARDIÁN · 05 · Zonas protegidas, avistamientos y detecciones
-- Borrado en dos pasos: deleted_at != null = está en la papelera.
-- =========================================================
create table if not exists public.protected_areas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  nombre      text not null,
  descripcion text not null default '',
  lat         double precision not null,
  lng         double precision not null,
  radio_km    numeric not null default 5,
  created_at  timestamptz not null default now()
);
create index if not exists protected_areas_owner_idx on public.protected_areas (owner_id);

create table if not exists public.sightings (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  device_id   uuid references public.devices (id) on delete set null,
  area_id     uuid references public.protected_areas (id) on delete set null,
  species_id  text references public.species (id) on delete set null,
  nombre      text not null,
  cientifico  text not null default '',
  estado      text not null default '',
  grupo       text references public.species_groups (id),
  conf        numeric(5,4) not null default 0 check (conf between 0 and 1),
  lat         double precision not null,
  lng         double precision not null,
  fuente      public.fuente_captura not null default 'camara',
  ia          text not null default 'local' check (ia in ('local', 'claude')),
  photo_path  text,
  notas       text not null default '',
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users (id) on delete set null
);
create index if not exists sightings_owner_time_idx on public.sightings (owner_id, created_at desc);
create index if not exists sightings_species_idx on public.sightings (species_id);
create index if not exists sightings_deleted_idx on public.sightings (owner_id) where deleted_at is not null;

-- Recuadros que dibujó COCO-SSD en la foto (para verlos al ampliarla)
create table if not exists public.sighting_detections (
  id          bigint generated always as identity primary key,
  sighting_id uuid not null references public.sightings (id) on delete cascade,
  clase       text not null,
  score       numeric(5,4) not null,
  bbox        jsonb not null            -- [x, y, ancho, alto] en píxeles de la foto
);
create index if not exists sighting_detections_sighting_idx on public.sighting_detections (sighting_id);

alter table public.protected_areas enable row level security;
alter table public.sightings enable row level security;
alter table public.sighting_detections enable row level security;

create policy "zonas protegidas: dueño" on public.protected_areas
  for all using (owner_id = public.current_owner() or public.es_admin())
  with check (owner_id = public.current_owner());

create policy "avistamientos: ver" on public.sightings
  for select using (owner_id = public.current_owner() or public.es_admin());
create policy "avistamientos: crear" on public.sightings
  for insert with check (owner_id = public.current_owner());
create policy "avistamientos: editar" on public.sightings
  for update using (owner_id = public.current_owner() or public.es_admin());
-- Borrar para siempre: solo la cuenta principal (no los celulares) y desde la papelera
create policy "avistamientos: eliminar definitivo" on public.sightings
  for delete using ((owner_id = auth.uid() or public.es_admin()) and deleted_at is not null);

create policy "detecciones: ver" on public.sighting_detections
  for select using (exists (select 1 from public.sightings s where s.id = sighting_id and (s.owner_id = public.current_owner() or public.es_admin())));
create policy "detecciones: crear" on public.sighting_detections
  for insert with check (exists (select 1 from public.sightings s where s.id = sighting_id and s.owner_id = public.current_owner()));
