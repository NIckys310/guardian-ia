-- =========================================================
-- GUARDIÁN · Base de datos completa (todas las migraciones en un solo archivo)
-- Pégalo en Supabase → SQL Editor → Run. Se puede ejecutar una sola vez en un proyecto nuevo.
-- Generado a partir de supabase/migrations/. No lo edites a mano.
-- =========================================================

-- >>> migrations/20261010000001_extensiones_y_tipos.sql
-- =========================================================
-- GUARDIÁN · 01 · Extensiones y tipos
-- =========================================================
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create type public.rol_usuario as enum ('admin', 'guardaparques', 'observador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tipo_dispositivo as enum ('pc', 'celular', 'tablet', 'dron', 'camara_ip');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fuente_captura as enum ('camara', 'foto', 'ipcam', 'celular', 'dron', 'ia');
exception when duplicate_object then null; end $$;

-- Actualiza updated_at automáticamente
create or replace function public.tocar_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- >>> migrations/20261010000002_perfiles.sql
-- =========================================================
-- GUARDIÁN · 02 · Perfiles y ajustes de usuario
-- =========================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null default '',
  role         public.rol_usuario not null default 'guardaparques',
  is_device    boolean not null default false,       -- cuentas anónimas de celulares vinculados
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz
);
comment on table public.profiles is 'Una fila por cuenta. Se crea sola al registrarse.';

create table if not exists public.user_settings (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger profiles_updated before update on public.profiles
  for each row execute function public.tocar_updated_at();
create trigger user_settings_updated before update on public.user_settings
  for each row execute function public.tocar_updated_at();

-- Crea el perfil al registrarse (incluye las cuentas anónimas de los celulares).
-- La primera cuenta real que se registra queda como administradora.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  anonimo boolean := coalesce(new.is_anonymous, false);
begin
  insert into public.profiles (id, full_name, is_device, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    anonimo,
    case when not anonimo and not exists (select 1 from public.profiles where role = 'admin')
         then 'admin'::public.rol_usuario else 'guardaparques'::public.rol_usuario end
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- ¿La cuenta actual es administradora?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Nadie puede cambiarse el rol a sí mismo (solo un admin)
create or replace function public.proteger_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar roles';
  end if;
  return new;
end $$;
create trigger profiles_proteger_rol before update on public.profiles
  for each row execute function public.proteger_rol();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;

create policy "perfil: ver el propio o admin" on public.profiles
  for select using (id = auth.uid() or public.es_admin());
create policy "perfil: editar el propio o admin" on public.profiles
  for update using (id = auth.uid() or public.es_admin());

create policy "ajustes: solo el dueño" on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- >>> migrations/20261010000003_catalogos.sql
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

-- >>> migrations/20261010000004_dispositivos.sql
-- =========================================================
-- GUARDIÁN · 04 · Dispositivos y vinculación del celular
-- Cómo funciona:
--   1. En el PC, la cuenta principal pide un código (crear_codigo_vinculo).
--   2. El celular escanea el QR, entra con una cuenta anónima y llama a
--      vincular_dispositivo(código). Desde ahí ese celular trabaja
--      "en nombre" de la cuenta principal (current_owner()).
-- =========================================================
create table if not exists public.devices (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  device_user_id uuid unique references auth.users (id) on delete set null,
  nombre         text not null default 'Celular',
  tipo           public.tipo_dispositivo not null default 'celular',
  user_agent     text not null default '',
  last_seen_at   timestamptz,
  last_lat       double precision,
  last_lng       double precision,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);
create index if not exists devices_owner_idx on public.devices (owner_id);

create table if not exists public.device_pairings (
  code       text primary key,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  claimed_at timestamptz,
  device_id  uuid references public.devices (id) on delete set null
);
create index if not exists device_pairings_owner_idx on public.device_pairings (owner_id);

-- Intentos fallidos de vinculación (contra adivinar códigos)
create table if not exists public.device_pairing_failures (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index if not exists device_pairing_failures_idx on public.device_pairing_failures (user_id, created_at);

-- Dueño efectivo: si quien llama es un celular vinculado, devuelve la cuenta principal
create or replace function public.current_owner()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select owner_id from public.devices where device_user_id = auth.uid() and revoked_at is null limit 1),
    auth.uid()
  );
$$;

-- Paso 1 (PC): crea un código de 6 letras que dura 10 minutos
create or replace function public.crear_codigo_vinculo()
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  nuevo text;
begin
  if auth.uid() is null or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_device) then
    raise exception 'Inicia sesión con tu cuenta principal para vincular un celular';
  end if;
  delete from public.device_pairings d where d.owner_id = auth.uid() and (d.expires_at < now() or d.claimed_at is not null);
  loop
    nuevo := '';
    for i in 1..6 loop
      nuevo := nuevo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from public.device_pairings d where d.code = nuevo);
  end loop;
  insert into public.device_pairings (code, owner_id) values (nuevo, auth.uid());
  return query select nuevo, now() + interval '10 minutes';
end $$;

-- Paso 2 (celular): reclama el código
create or replace function public.vincular_dispositivo(p_code text, p_nombre text, p_tipo public.tipo_dispositivo, p_user_agent text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v public.device_pairings%rowtype;
  nuevo_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión');
  end if;
  if (select count(*) from public.device_pairing_failures f
      where f.user_id = auth.uid() and f.created_at > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera 10 minutos.');
  end if;

  select * into v from public.device_pairings
   where code = upper(trim(p_code)) and claimed_at is null and expires_at > now()
   for update;
  if not found then
    insert into public.device_pairing_failures (user_id) values (auth.uid());
    return jsonb_build_object('ok', false, 'error', 'El código no existe o ya venció. Genera uno nuevo en el PC.');
  end if;
  if v.owner_id = auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Este equipo ya usa la cuenta principal.');
  end if;

  insert into public.devices (owner_id, device_user_id, nombre, tipo, user_agent, last_seen_at)
  values (v.owner_id, auth.uid(), left(coalesce(nullif(trim(p_nombre), ''), 'Celular'), 60), p_tipo, left(coalesce(p_user_agent, ''), 300), now())
  on conflict (device_user_id) do update
    set owner_id = excluded.owner_id, nombre = excluded.nombre, tipo = excluded.tipo,
        user_agent = excluded.user_agent, revoked_at = null, last_seen_at = now()
  returning id into nuevo_id;

  update public.device_pairings set claimed_at = now(), device_id = nuevo_id where code = v.code;
  update public.profiles set is_device = true where id = auth.uid();
  return jsonb_build_object('ok', true, 'device_id', nuevo_id);
end $$;

-- El celular avisa que sigue conectado y dónde está
create or replace function public.latido_dispositivo(p_lat double precision default null, p_lng double precision default null)
returns void language sql security definer set search_path = public as $$
  update public.devices
     set last_seen_at = now(),
         last_lat = coalesce(p_lat, last_lat),
         last_lng = coalesce(p_lng, last_lng)
   where device_user_id = auth.uid() and revoked_at is null;
$$;

alter table public.devices enable row level security;
alter table public.device_pairings enable row level security;
alter table public.device_pairing_failures enable row level security;

create policy "dispositivos: ver" on public.devices
  for select using (owner_id = public.current_owner() or device_user_id = auth.uid() or public.es_admin());
create policy "dispositivos: renombrar o desvincular" on public.devices
  for update using (owner_id = auth.uid() or public.es_admin());
create policy "dispositivos: borrar" on public.devices
  for delete using (owner_id = auth.uid() or public.es_admin());

create policy "códigos: ver los propios" on public.device_pairings
  for select using (owner_id = auth.uid());
-- device_pairing_failures: sin políticas = nadie la lee desde la app

revoke execute on function public.crear_codigo_vinculo() from anon;
revoke execute on function public.vincular_dispositivo(text, text, public.tipo_dispositivo, text) from anon;
revoke execute on function public.latido_dispositivo(double precision, double precision) from anon;

-- >>> migrations/20261010000005_avistamientos.sql
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

-- >>> migrations/20261010000006_alertas.sql
-- =========================================================
-- GUARDIÁN · 06 · Alertas de caza furtiva y su historial
-- =========================================================
create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  device_id   uuid references public.devices (id) on delete set null,
  area_id     uuid references public.protected_areas (id) on delete set null,
  tipo        text not null,
  clase       text not null,
  conf        numeric(5,4) not null default 0 check (conf between 0 and 1),
  lat         double precision not null,
  lng         double precision not null,
  mensaje     text not null default '',
  photo_path  text,
  atendida    boolean not null default false,
  atendida_at timestamptz,
  atendida_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users (id) on delete set null
);
create index if not exists alerts_owner_time_idx on public.alerts (owner_id, created_at desc);
create index if not exists alerts_pending_idx on public.alerts (owner_id) where not atendida and deleted_at is null;

-- Historial: quién atendió, reabrió, borró o restauró cada alerta
create table if not exists public.alert_events (
  id         bigint generated always as identity primary key,
  alert_id   uuid not null references public.alerts (id) on delete cascade,
  actor      uuid references auth.users (id) on delete set null,
  accion     text not null check (accion in ('creada', 'atendida', 'reabierta', 'eliminada', 'restaurada')),
  created_at timestamptz not null default now()
);
create index if not exists alert_events_alert_idx on public.alert_events (alert_id, created_at);

create or replace function public.registrar_evento_alerta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.alert_events (alert_id, actor, accion) values (new.id, auth.uid(), 'creada');
  else
    if new.atendida is distinct from old.atendida then
      insert into public.alert_events (alert_id, actor, accion) values (new.id, auth.uid(), case when new.atendida then 'atendida' else 'reabierta' end);
      new.atendida_at := case when new.atendida then now() end;
      new.atendida_by := case when new.atendida then auth.uid() end;
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      insert into public.alert_events (alert_id, actor, accion) values (new.id, auth.uid(), case when new.deleted_at is null then 'restaurada' else 'eliminada' end);
    end if;
  end if;
  return new;
end $$;

create trigger alerts_eventos_insert after insert on public.alerts
  for each row execute function public.registrar_evento_alerta();
create trigger alerts_eventos_update before update on public.alerts
  for each row execute function public.registrar_evento_alerta();

alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;

create policy "alertas: ver" on public.alerts
  for select using (owner_id = public.current_owner() or public.es_admin());
create policy "alertas: crear" on public.alerts
  for insert with check (owner_id = public.current_owner());
create policy "alertas: editar" on public.alerts
  for update using (owner_id = public.current_owner() or public.es_admin());
create policy "alertas: eliminar definitivo" on public.alerts
  for delete using ((owner_id = auth.uid() or public.es_admin()) and deleted_at is not null);

create policy "historial de alertas: ver" on public.alert_events
  for select using (exists (select 1 from public.alerts a where a.id = alert_id and (a.owner_id = public.current_owner() or public.es_admin())));

-- >>> migrations/20261010000007_reportes.sql
-- =========================================================
-- GUARDIÁN · 07 · Reportes ambientales ("cápsula de reportes")
-- Los reportes se guardan en el sistema, no se descargan.
-- Cada reporte es una foto fija del período: se puede abrir igual años después.
-- =========================================================
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  titulo     text not null,
  desde      timestamptz not null,
  hasta      timestamptz not null,
  notas      text not null default '',
  resumen    jsonb not null default '{}'::jsonb,   -- totales, especies, alertas
  html       text not null default '',            -- contenido listo para ver o imprimir
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users (id) on delete set null,
  check (hasta >= desde)
);
create index if not exists reports_owner_time_idx on public.reports (owner_id, created_at desc);

-- Detalle por especie de cada reporte (para comparar reportes entre sí)
create table if not exists public.report_species (
  report_id  uuid not null references public.reports (id) on delete cascade,
  species_id text not null,
  nombre     text not null,
  estado     text not null default '',
  n          int  not null default 0,
  primary key (report_id, species_id)
);

alter table public.reports enable row level security;
alter table public.report_species enable row level security;

create policy "reportes: ver" on public.reports
  for select using (owner_id = public.current_owner() or public.es_admin());
create policy "reportes: crear" on public.reports
  for insert with check (owner_id = public.current_owner());
create policy "reportes: editar" on public.reports
  for update using (owner_id = public.current_owner() or public.es_admin());
create policy "reportes: eliminar definitivo" on public.reports
  for delete using ((owner_id = auth.uid() or public.es_admin()) and deleted_at is not null);

create policy "detalle de reporte: ver" on public.report_species
  for select using (exists (select 1 from public.reports r where r.id = report_id and (r.owner_id = public.current_owner() or public.es_admin())));
create policy "detalle de reporte: crear" on public.report_species
  for insert with check (exists (select 1 from public.reports r where r.id = report_id and r.owner_id = public.current_owner()));

-- >>> migrations/20261010000008_asistente_ia.sql
-- =========================================================
-- GUARDIÁN · 08 · Asistente con IA (chat) y registro de uso de la IA
-- =========================================================
create table if not exists public.chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  titulo     text not null default 'Nueva conversación',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists chat_conversations_owner_idx on public.chat_conversations (owner_id, updated_at desc);

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx on public.chat_messages (conversation_id, created_at);

create trigger chat_conversations_updated before update on public.chat_conversations
  for each row execute function public.tocar_updated_at();

-- Cada llamada a Claude queda registrada: sirve para limitar el gasto
create table if not exists public.ai_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  owner_id      uuid not null default public.current_owner(),
  kind          text not null check (kind in ('identify', 'auto', 'chat')),
  model         text not null default '',
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  ok            boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists ai_requests_owner_time_idx on public.ai_requests (owner_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_requests enable row level security;

create policy "conversaciones: dueño" on public.chat_conversations
  for all using (owner_id = public.current_owner()) with check (owner_id = public.current_owner());
create policy "mensajes: dueño" on public.chat_messages
  for all using (exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.owner_id = public.current_owner()))
  with check (exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.owner_id = public.current_owner()));

create policy "uso de IA: ver" on public.ai_requests
  for select using (owner_id = public.current_owner() or public.es_admin());
create policy "uso de IA: registrar" on public.ai_requests
  for insert with check (user_id = auth.uid() and owner_id = public.current_owner());

-- Consultas de IA de la cuenta en la última hora (lo usa el servidor para el límite)
create or replace function public.uso_ia_ultima_hora()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ai_requests
   where owner_id = public.current_owner() and created_at > now() - interval '1 hour';
$$;

-- >>> migrations/20261010000009_seguridad.sql
-- =========================================================
-- GUARDIÁN · 09 · Seguridad del inicio de sesión y auditoría
-- - Bloqueo de 15 minutos después de 5 intentos fallidos por correo.
-- - El correo se guarda cifrado con SHA-256 (no en texto plano).
-- - Bitácora de acciones importantes (auditoría).
-- =========================================================
create table if not exists public.login_attempts (
  id         bigint generated always as identity primary key,
  email_hash text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_hash_idx on public.login_attempts (email_hash, created_at desc);

create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  owner_id   uuid default public.current_owner(),
  accion     text not null,
  detalle    jsonb not null default '{}'::jsonb,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_owner_idx on public.audit_log (owner_id, created_at desc);

create or replace function public.hash_correo(p_email text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex');
$$;

-- Antes de iniciar sesión: ¿cuántos segundos faltan para poder intentar? (0 = puede)
create or replace function public.login_bloqueo(p_email text)
returns int language plpgsql security definer set search_path = public as $$
declare
  h text := public.hash_correo(p_email);
  ultimo_ok timestamptz;
  fallos int;
  quinto timestamptz;
begin
  select max(created_at) into ultimo_ok from public.login_attempts where email_hash = h and ok;
  select count(*), max(created_at) into fallos, quinto
    from public.login_attempts
   where email_hash = h and not ok
     and created_at > greatest(coalesce(ultimo_ok, '-infinity'), now() - interval '15 minutes');
  if fallos >= 5 then
    return greatest(0, extract(epoch from (quinto + interval '15 minutes' - now()))::int);
  end if;
  return 0;
end $$;

-- Después de intentar: registra el resultado
create or replace function public.login_registrar(p_email text, p_ok boolean)
returns int language plpgsql security definer set search_path = public as $$
begin
  insert into public.login_attempts (email_hash, ok) values (public.hash_correo(p_email), p_ok);
  delete from public.login_attempts where created_at < now() - interval '30 days';
  return public.login_bloqueo(p_email);
end $$;

grant execute on function public.login_bloqueo(text) to anon, authenticated;
grant execute on function public.login_registrar(text, boolean) to anon, authenticated;

alter table public.login_attempts enable row level security;   -- sin políticas: solo por las funciones
alter table public.audit_log enable row level security;

create policy "auditoría: registrar" on public.audit_log
  for insert with check (user_id = auth.uid());
create policy "auditoría: ver" on public.audit_log
  for select using (owner_id = public.current_owner() or public.es_admin());

-- >>> migrations/20261010000010_notificaciones_y_webhooks.sql
-- =========================================================
-- GUARDIÁN · 10 · Notificaciones internas y webhooks
-- =========================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  tipo       text not null default 'info' check (tipo in ('info', 'alerta', 'dispositivo', 'reporte', 'seguridad')),
  titulo     text not null,
  cuerpo     text not null default '',
  ref_id     uuid,
  leida      boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_owner_idx on public.notifications (owner_id, created_at desc);

create table if not exists public.webhooks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default public.current_owner() references public.profiles (id) on delete cascade,
  url        text not null check (url ~ '^https?://'),
  eventos    text[] not null default array['alerta'],
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.webhooks enable row level security;

create policy "notificaciones: dueño" on public.notifications
  for all using (owner_id = public.current_owner()) with check (owner_id = public.current_owner());
create policy "webhooks: dueño" on public.webhooks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Cada alerta nueva crea una notificación
create or replace function public.notificar_alerta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (owner_id, tipo, titulo, cuerpo, ref_id)
  values (new.owner_id, 'alerta', 'Alerta: ' || new.tipo, new.mensaje, new.id);
  return new;
end $$;
create trigger alerts_notificar after insert on public.alerts
  for each row execute function public.notificar_alerta();

-- Cada celular vinculado crea una notificación de seguridad
create or replace function public.notificar_dispositivo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (owner_id, tipo, titulo, cuerpo, ref_id)
  values (new.owner_id, 'dispositivo', 'Nuevo dispositivo vinculado', new.nombre || ' se conectó a tu cuenta.', new.id);
  return new;
end $$;
create trigger devices_notificar after insert on public.devices
  for each row execute function public.notificar_dispositivo();

-- >>> migrations/20261010000011_papelera.sql
-- =========================================================
-- GUARDIÁN · 11 · Papelera
-- Lo que se elimina va primero a la papelera (deleted_at).
-- Desde ahí se puede restaurar. Pasados 30 días se borra solo.
-- =========================================================
create or replace view public.papelera with (security_invoker = true) as
  select 'sighting'::text as tipo, id, owner_id, nombre as titulo, created_at, deleted_at, photo_path from public.sightings where deleted_at is not null
  union all
  select 'alert', id, owner_id, tipo || ' · ' || left(mensaje, 60), created_at, deleted_at, photo_path from public.alerts where deleted_at is not null
  union all
  select 'report', id, owner_id, titulo, created_at, deleted_at, null from public.reports where deleted_at is not null
  union all
  select 'conversation', id, owner_id, titulo, created_at, deleted_at, null from public.chat_conversations where deleted_at is not null;

-- Restaurar todo lo de la papelera de la cuenta
create or replace function public.restaurar_papelera()
returns int language plpgsql security invoker set search_path = public as $$
declare n int := 0; k int;
begin
  update public.sightings set deleted_at = null, deleted_by = null where owner_id = public.current_owner() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  update public.alerts set deleted_at = null, deleted_by = null where owner_id = public.current_owner() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  update public.reports set deleted_at = null, deleted_by = null where owner_id = public.current_owner() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  update public.chat_conversations set deleted_at = null where owner_id = public.current_owner() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- Vaciar la papelera (borrado definitivo). Solo la cuenta principal.
create or replace function public.vaciar_papelera()
returns int language plpgsql security invoker set search_path = public as $$
declare n int := 0; k int;
begin
  if exists (select 1 from public.profiles where id = auth.uid() and is_device) then
    raise exception 'Un celular vinculado no puede vaciar la papelera';
  end if;
  delete from public.sightings where owner_id = auth.uid() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  delete from public.alerts where owner_id = auth.uid() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  delete from public.reports where owner_id = auth.uid() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  delete from public.chat_conversations where owner_id = auth.uid() and deleted_at is not null; get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- Limpieza automática de lo que lleva más de 30 días en la papelera
create or replace function public.purgar_papelera_vieja()
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; k int;
begin
  delete from public.sightings where deleted_at < now() - interval '30 days'; get diagnostics k = row_count; n := n + k;
  delete from public.alerts where deleted_at < now() - interval '30 days'; get diagnostics k = row_count; n := n + k;
  delete from public.reports where deleted_at < now() - interval '30 days'; get diagnostics k = row_count; n := n + k;
  delete from public.chat_conversations where deleted_at < now() - interval '30 days'; get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke execute on function public.purgar_papelera_vieja() from anon, authenticated;

-- Programa la limpieza todos los días a las 3:00 a. m. (si pg_cron está disponible)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('guardian-purgar-papelera', '0 8 * * *', 'select public.purgar_papelera_vieja()');
exception when others then
  raise notice 'pg_cron no disponible: la papelera se limpiará desde la app';
end $$;

-- >>> migrations/20261010000012_fotos_y_tiempo_real.sql
-- =========================================================
-- GUARDIÁN · 12 · Fotos (Storage) y tiempo real
-- Las fotos van al bucket privado "media", dentro de la carpeta
-- de la cuenta principal: media/<owner_id>/<archivo>.jpg
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "fotos: subir a la carpeta de la cuenta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = public.current_owner()::text);

create policy "fotos: ver las de la cuenta" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = public.current_owner()::text or public.es_admin()));

create policy "fotos: borrar (solo cuenta principal)" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Tiempo real: el PC ve al instante lo que envía el celular
do $$
begin
  alter publication supabase_realtime add table public.sightings, public.alerts, public.devices, public.notifications;
exception when duplicate_object then null;
end $$;

-- >>> migrations/20261010000013_semilla_especies.sql
-- =========================================================
-- GUARDIÁN · 13 · Catálogo de especies (79 especies)
-- Archivo generado por scripts/generar-semilla-especies.mjs. No lo edites a mano.
-- =========================================================
insert into public.species (id, grupo, nombre, cientifico, estado, estado_code, habitat, reproduccion, dieta, distribucion) values
  ('puma', 'felino', 'Puma', 'Puma concolor', 'Preocupación menor (LC)', 'LC', 'Desde páramos y bosques andinos hasta selvas bajas y sabanas.', 'Gestación de unos 92 días; de 1 a 4 cachorros con manchas que desaparecen al crecer.', 'Carnívoro: venados, chigüiros, pecaríes, armadillos y aves grandes.', 'Todo el continente americano; en Colombia, en las tres cordilleras y la Orinoquía.'),
  ('ocelote', 'felino', 'Ocelote', 'Leopardus pardalis', 'Preocupación menor (LC)', 'LC', 'Selvas húmedas, bosques de galería y manglares con vegetación densa.', 'Gestación de 79 a 85 días; normalmente una sola cría cada dos años.', 'Carnívoro: roedores, zarigüeyas, aves, reptiles y peces.', 'Del sur de Estados Unidos al norte de Argentina; Amazonía, Chocó y Magdalena Medio.'),
  ('tigrillo', 'felino', 'Tigrillo lanudo', 'Leopardus tigrinus', 'Vulnerable (VU)', 'VU', 'Bosques nublados y andinos entre 1.500 y 3.500 m.', 'Gestación de unos 75 días; 1 o 2 crías.', 'Carnívoro: pequeños roedores, aves y lagartijas.', 'Andes de Colombia, Venezuela, Ecuador y Perú.'),
  ('danta', 'herbivoro', 'Danta de montaña', 'Tapirus pinchaque', 'En peligro (EN)', 'EN', 'Páramos y bosques altoandinos entre 2.000 y 4.000 m.', 'Gestación de unos 13 meses; una sola cría con rayas blancas.', 'Herbívoro: hojas, brotes, frutos y plantas del páramo. Gran dispersora de semillas.', 'Cordillera Central y Oriental de Colombia, Ecuador y norte de Perú.'),
  ('venado', 'herbivoro', 'Venado cola blanca', 'Odocoileus virginianus', 'Preocupación menor (LC)', 'LC', 'Sabanas, bosques secos, bordes de bosque y páramos.', 'Gestación de unos 200 días; 1 o 2 cervatillos con manchas.', 'Herbívoro: hojas, pastos, frutos y brotes.', 'De Canadá a Bolivia; en Colombia en la Orinoquía, Caribe y zona andina.'),
  ('pecari', 'herbivoro', 'Pecarí de collar (zaíno)', 'Pecari tajacu', 'Preocupación menor (LC)', 'LC', 'Selvas, bosques secos y sabanas arboladas.', 'Gestación de unos 145 días; normalmente 2 crías.', 'Omnívoro: raíces, frutos, semillas, insectos y pequeños vertebrados.', 'Del sur de Estados Unidos a Argentina; casi todo Colombia por debajo de 2.000 m.'),
  ('chiguiro', 'mamifero', 'Chigüiro (capibara)', 'Hydrochoerus hydrochaeris', 'Preocupación menor (LC)', 'LC', 'Llanos inundables, ríos, lagunas y esteros.', 'Gestación de unos 150 días; de 2 a 8 crías que nadan desde pequeñas.', 'Herbívoro: pastos y plantas acuáticas.', 'Sudamérica al este de los Andes; muy común en los Llanos Orientales.'),
  ('hormiguero', 'mamifero', 'Oso hormiguero gigante', 'Myrmecophaga tridactyla', 'Vulnerable (VU)', 'VU', 'Sabanas, pastizales y bosques abiertos.', 'Gestación de unos 190 días; una cría que viaja en la espalda de la madre.', 'Insectívoro: hasta 30.000 hormigas y termitas al día con su lengua de 60 cm.', 'De Centroamérica a Argentina; en Colombia, Orinoquía y Amazonía.'),
  ('armadillo', 'mamifero', 'Armadillo de nueve bandas', 'Dasypus novemcinctus', 'Preocupación menor (LC)', 'LC', 'Bosques, sabanas y zonas de cultivo; vive en madrigueras.', 'Casi siempre nacen 4 crías idénticas (cuatrillizos) de un solo óvulo.', 'Insectívoro: hormigas, termitas, larvas y lombrices.', 'De Estados Unidos a Argentina; todo Colombia por debajo de 3.000 m.'),
  ('zarigueya', 'mamifero', 'Zarigüeya (chucha)', 'Didelphis marsupialis', 'Preocupación menor (LC)', 'LC', 'Bosques, zonas rurales y hasta ciudades.', 'Marsupial: las crías terminan de crecer en la bolsa de la madre; hasta 10 por camada.', 'Omnívoro: frutos, insectos, huevos y pequeños animales. Come garrapatas.', 'De México a Argentina; todo Colombia.'),
  ('puercoespin', 'mamifero', 'Puercoespín', 'Coendou prehensilis', 'Preocupación menor (LC)', 'LC', 'Bosques húmedos y secos; vive en los árboles.', 'Gestación de unos 200 días; una cría con espinas blandas.', 'Herbívoro: hojas, cortezas, frutos y semillas.', 'Norte de Sudamérica; en Colombia por debajo de 2.000 m.'),
  ('ardilla', 'mamifero', 'Ardilla de cola roja', 'Notosciurus granatensis', 'Preocupación menor (LC)', 'LC', 'Bosques, parques y cultivos, desde el nivel del mar hasta 3.000 m.', 'Gestación de unos 44 días; de 1 a 3 crías en nidos de hojas.', 'Frutos, semillas, nueces y a veces insectos.', 'De Costa Rica a Ecuador; muy común en Colombia.'),
  ('murcielago', 'mamifero', 'Murciélago frutero', 'Carollia perspicillata', 'Preocupación menor (LC)', 'LC', 'Bosques húmedos y secos; duerme en cuevas, troncos y construcciones.', 'Dos partos al año, de una cría cada uno.', 'Frutos (pipilongo, guayaba, higos). Dispersa semillas y regenera el bosque.', 'De México a Brasil; todo Colombia por debajo de 2.000 m.'),
  ('aullador', 'primate', 'Mono aullador rojo', 'Alouatta seniculus', 'Preocupación menor (LC)', 'LC', 'Selvas húmedas, bosques de galería y bosques andinos bajos.', 'Gestación de unos 190 días; una cría.', 'Herbívoro: hojas, frutos y flores.', 'Norte de Sudamérica; en Colombia en casi todo el territorio bajo 2.500 m. Su aullido se oye a 5 km.'),
  ('titi', 'primate', 'Tití cabeciblanco', 'Saguinus oedipus', 'En peligro crítico (CR)', 'CR', 'Bosques secos y húmedos tropicales del Caribe colombiano.', 'Suelen nacer gemelos; el padre y el grupo cargan a las crías.', 'Insectos, frutos, néctar y exudados de árboles.', 'Endémico de Colombia: Córdoba, Sucre, Bolívar, Atlántico y Antioquia.'),
  ('capuchino', 'primate', 'Mono capuchino', 'Cebus albifrons', 'Preocupación menor (LC)', 'LC', 'Selvas húmedas y bosques de galería.', 'Gestación de unos 160 días; una cría.', 'Omnívoro: frutos, insectos, huevos y pequeños vertebrados. Usa herramientas.', 'Amazonía, Orinoquía y valle del Magdalena.'),
  ('arana', 'primate', 'Mono araña café', 'Ateles hybridus', 'En peligro crítico (CR)', 'CR', 'Bosques húmedos del valle del Magdalena y la Serranía de San Lucas.', 'Gestación de unos 7 meses; una cría cada 3 o 4 años (por eso se recupera lento).', 'Frugívoro: frutos maduros, hojas y flores.', 'Colombia y Venezuela. Uno de los primates más amenazados del mundo.'),
  ('condor', 'ave', 'Cóndor andino', 'Vultur gryphus', 'Vulnerable (VU)', 'VU', 'Páramos, cañones y montañas de los Andes.', 'Pone un solo huevo cada 2 años; incuban 55 días ambos padres.', 'Carroñero: cadáveres de animales grandes.', 'Andes de Venezuela a la Patagonia. Ave nacional de Colombia.'),
  ('arpia', 'ave', 'Águila arpía', 'Harpia harpyja', 'Vulnerable (VU)', 'VU', 'Selvas húmedas extensas y poco intervenidas.', 'Pone 1 o 2 huevos cada 2 o 3 años; solo cría un polluelo.', 'Perezosos y monos que caza en las copas de los árboles.', 'De México a Argentina; Amazonía, Chocó y Magdalena Medio.'),
  ('gallito', 'ave', 'Gallito de roca andino', 'Rupicola peruvianus', 'Preocupación menor (LC)', 'LC', 'Cañones y quebradas de bosque nublado.', 'Los machos bailan en grupos (leks); la hembra hace un nido de barro en las rocas.', 'Frutos, insectos y pequeños reptiles.', 'Andes de Venezuela a Bolivia.'),
  ('barranquero', 'ave', 'Barranquero', 'Momotus aequatorialis', 'Preocupación menor (LC)', 'LC', 'Bosques andinos, cafetales y parques.', 'Anida en túneles que cava en barrancos; 3 o 4 huevos.', 'Insectos, lagartijas y frutos.', 'Andes de Colombia, Ecuador y Perú.'),
  ('garza', 'ave', 'Garza blanca', 'Ardea alba', 'Preocupación menor (LC)', 'LC', 'Ciénagas, ríos, lagunas, manglares y potreros inundados.', 'Anida en colonias en árboles; 3 o 4 huevos azulados.', 'Peces, ranas, insectos y pequeños reptiles.', 'Casi todo el mundo; muy común en Colombia.'),
  ('pelicano', 'ave', 'Pelícano pardo', 'Pelecanus occidentalis', 'Preocupación menor (LC)', 'LC', 'Costas, bahías, manglares y estuarios.', 'Anida en colonias; 2 o 3 huevos.', 'Peces que atrapa lanzándose en picada al mar.', 'Costas de América; litoral Caribe y Pacífico colombiano.'),
  ('martin', 'ave', 'Martín pescador', 'Megaceryle torquata', 'Preocupación menor (LC)', 'LC', 'Ríos, lagos y manglares con perchas sobre el agua.', 'Anida en túneles en barrancos de ríos; 3 a 6 huevos.', 'Peces pequeños que caza zambulléndose.', 'De México a Tierra del Fuego.'),
  ('loro', 'ave', 'Loro real', 'Amazona ochrocephala', 'Preocupación menor (LC)', 'LC', 'Selvas, bosques de galería y sabanas arboladas.', 'Anida en huecos de árboles; 2 a 4 huevos. Víctima frecuente del tráfico ilegal.', 'Frutos, semillas, flores y nueces.', 'Norte de Sudamérica; Caribe, Orinoquía y Amazonía colombianas.'),
  ('charapa', 'reptil', 'Tortuga charapa', 'Podocnemis expansa', 'En peligro crítico en Colombia (Libro Rojo)', 'CR', 'Grandes ríos de la Amazonía y la Orinoquía; desova en playas de arena.', 'Cada hembra pone de 80 a 120 huevos en la arena durante la temporada seca.', 'Herbívora: frutos, semillas y plantas acuáticas.', 'Cuencas del Amazonas y del Orinoco. La tortuga de río más grande de Sudamérica.'),
  ('carey', 'reptil', 'Tortuga carey', 'Eretmochelys imbricata', 'En peligro crítico (CR)', 'CR', 'Arrecifes de coral y costas tropicales.', 'Desova cada 2 o 3 años en playas; unos 140 huevos por nido.', 'Esponjas marinas, algas y anémonas.', 'Océanos tropicales; Caribe colombiano (San Andrés, Tayrona) y Pacífico.'),
  ('caiman-orinoco', 'reptil', 'Caimán del Orinoco', 'Crocodylus intermedius', 'En peligro crítico (CR)', 'CR', 'Ríos y lagunas de los Llanos Orientales.', 'Pone de 15 a 70 huevos en playas; la madre protege a las crías.', 'Peces, aves y mamíferos que se acercan al agua.', 'Endémico de la cuenca del Orinoco (Colombia y Venezuela).'),
  ('boa', 'reptil', 'Boa constrictora', 'Boa constrictor', 'Preocupación menor (LC)', 'LC', 'Selvas, bosques secos, sabanas y zonas de cultivo.', 'Vivípara: nacen de 10 a 60 crías.', 'Roedores, aves y reptiles que mata por constricción. No es venenosa.', 'De México a Argentina; todo Colombia por debajo de 1.500 m.'),
  ('anaconda', 'reptil', 'Anaconda', 'Eunectes murinus', 'Preocupación menor (LC)', 'LC', 'Ríos lentos, ciénagas y esteros.', 'Vivípara: de 20 a 40 crías de unos 70 cm.', 'Peces, aves, chigüiros y caimanes.', 'Amazonía y Orinoquía. La serpiente más pesada del mundo.'),
  ('coral', 'reptil', 'Serpiente coral', 'Micrurus sp.', 'Varía por especie', null, 'Hojarasca de selvas y bosques.', 'Ovípara: de 3 a 12 huevos.', 'Otras serpientes y lagartijas. ⚠️ Muy venenosa: no la toques.', 'Toda Colombia por debajo de 2.000 m.'),
  ('rana-dorada', 'anfibio', 'Rana dorada venenosa', 'Phyllobates terribilis', 'En peligro (EN)', 'EN', 'Suelo de la selva húmeda del Pacífico.', 'El macho carga los renacuajos en la espalda hasta el agua.', 'Hormigas y pequeños insectos.', 'Endémica del Cauca colombiano. Su piel es de las más tóxicas del planeta.'),
  ('sapo', 'anfibio', 'Sapo común', 'Rhinella marina', 'Preocupación menor (LC)', 'LC', 'Casi cualquier lugar húmedo: potreros, jardines y bordes de ríos.', 'Pone hasta 30.000 huevos en cordones dentro del agua.', 'Insectos y otros invertebrados.', 'De México a la Amazonía; todo Colombia por debajo de 2.000 m.'),
  ('delfin-rosado', 'acuatico', 'Delfín rosado', 'Inia geoffrensis', 'En peligro (EN)', 'EN', 'Ríos, lagos y bosques inundados de la Amazonía y la Orinoquía.', 'Gestación de unos 11 meses; una cría cada 3 a 5 años.', 'Peces, cangrejos y tortugas pequeñas.', 'Cuencas del Amazonas y Orinoco; en Colombia, Puerto Nariño y Puerto Carreño.'),
  ('manati', 'acuatico', 'Manatí del Caribe', 'Trichechus manatus', 'En peligro (EN)', 'EN', 'Ríos lentos, ciénagas y costas con pastos marinos.', 'Gestación de unos 12 meses; una cría que se queda 2 años con la madre.', 'Herbívoro: plantas acuáticas, hasta el 10 % de su peso al día.', 'Caribe y cuencas del Magdalena, Sinú y Atrato.'),
  ('martillo', 'acuatico', 'Tiburón martillo', 'Sphyrna lewini', 'En peligro crítico (CR)', 'CR', 'Aguas costeras y montes submarinos; forma grandes cardúmenes.', 'Vivíparo: de 12 a 40 crías.', 'Peces, calamares y rayas.', 'Mares tropicales; Santuario de Malpelo (Colombia) es famoso por sus cardúmenes.'),
  ('ballena', 'acuatico', 'Ballena jorobada', 'Megaptera novaeangliae', 'Preocupación menor (LC)', 'LC', 'Océano abierto; llega a aguas cálidas costeras para reproducirse.', 'Gestación de 11 meses; una cría. Llegan al Pacífico colombiano de julio a octubre.', 'Krill y peces pequeños que filtra con sus barbas.', 'Todos los océanos; Bahía Solano, Nuquí y Bahía Málaga en Colombia.'),
  ('mariposa', 'insecto', 'Mariposa morfo azul', 'Morpho peleides', 'No evaluado (NE)', 'NE', 'Selvas húmedas y bosques de galería.', 'Huevo, oruga, crisálida y adulto; el ciclo dura unos 115 días.', 'Las orugas comen hojas; los adultos, fruta fermentada.', 'De México a Colombia y Venezuela. Colombia es el país con más especies de mariposas del mundo.'),
  ('abeja', 'insecto', 'Abeja melífera', 'Apis mellifera', 'No evaluado (NE)', 'NE', 'Flores silvestres, cultivos y jardines.', 'Una reina pone hasta 2.000 huevos al día en la colmena.', 'Néctar y polen. Polinizadora clave de los cultivos.', 'Mundial.'),
  ('hormiga', 'insecto', 'Hormiga arriera', 'Atta cephalotes', 'No evaluado (NE)', 'NE', 'Selvas y cultivos; nidos subterráneos enormes.', 'Vuelos nupciales al inicio de las lluvias; las reinas fundan nuevas colonias.', 'Cultivan un hongo con las hojas que cortan.', 'De México a Bolivia; todo Colombia por debajo de 2.000 m.'),
  ('tarantula', 'insecto', 'Tarántula', 'Theraphosidae', 'No evaluado (NE)', 'NE', 'Madrigueras en el suelo, troncos y bromelias.', 'La hembra protege un saco de cientos de huevos.', 'Insectos, ranas y lagartijas.', 'Regiones tropicales; muchas especies en Colombia.'),
  ('escorpion', 'insecto', 'Escorpión', 'Tityus sp.', 'No evaluado (NE)', 'NE', 'Bajo piedras, troncos y hojarasca.', 'Vivíparo: la madre carga las crías en la espalda.', 'Insectos y arañas. ⚠️ Algunas especies son peligrosas.', 'Toda Colombia en zonas cálidas y templadas.'),
  ('jaguar', 'felino', 'Jaguar', 'Panthera onca', 'Casi amenazado (NT)', 'NT', 'Selvas húmedas, bosques secos, manglares y llanuras inundables, siempre cerca del agua.', 'Sin temporada fija. Gestación de unos 100 días; nacen de 1 a 4 cachorros que viven con la madre hasta 2 años.', 'Carnívoro: chigüiros, pecaríes, venados, caimanes, tortugas y peces. Mordida capaz de perforar caparazones.', 'Desde el norte de México hasta el norte de Argentina; Amazonía y Orinoquía colombiana.'),
  ('tigre', 'felino', 'Tigre', 'Panthera tigris', 'En peligro (EN)', 'EN', 'Bosques tropicales, manglares, praderas altas y bosques boreales.', 'Gestación de 100 a 110 días; camadas de 2 a 4 crías.', 'Carnívoro: ciervos, jabalíes y búfalos.', 'India, Nepal, Bangladés, Sudeste Asiático y extremo oriente de Rusia.'),
  ('leon', 'felino', 'León', 'Panthera leo', 'Vulnerable (VU)', 'VU', 'Sabanas, praderas y matorrales abiertos.', 'Gestación de unos 110 días; 2 a 4 cachorros criados por las hembras de la manada.', 'Carnívoro: ñus, cebras, búfalos y antílopes; caza en grupo.', 'África subsahariana y el bosque de Gir en India.'),
  ('leopardo', 'felino', 'Leopardo', 'Panthera pardus', 'Vulnerable (VU)', 'VU', 'Muy adaptable: selvas, sabanas, montañas y desiertos.', 'Gestación de 90 a 105 días; 2 o 3 crías ocultas en cuevas o matorrales.', 'Carnívoro oportunista: antílopes, monos, aves; sube las presas a los árboles.', 'África subsahariana y partes de Asia.'),
  ('guepardo', 'felino', 'Guepardo', 'Acinonyx jubatus', 'Vulnerable (VU)', 'VU', 'Sabanas abiertas y pastizales secos.', 'Gestación de unos 93 días; de 3 a 5 cachorros.', 'Carnívoro: gacelas e impalas, cazadas a gran velocidad.', 'África oriental y austral; una pequeña población en Irán.'),
  ('elefante', 'herbivoro', 'Elefante', 'Loxodonta africana / Elephas maximus', 'En peligro (EN)', 'EN', 'Sabanas, bosques y zonas pantanosas con agua disponible.', 'Gestación de 22 meses, la más larga de los mamíferos terrestres; una cría.', 'Herbívoro: hierbas, cortezas, frutas y raíces; hasta 150 kg al día.', 'África subsahariana e India y Sudeste Asiático.'),
  ('cebra', 'herbivoro', 'Cebra', 'Equus quagga', 'Casi amenazado (NT)', 'NT', 'Sabanas y praderas con acceso a agua.', 'Gestación de 12 a 13 meses; una cría que camina a la hora de nacer.', 'Herbívoro: pastos altos y duros.', 'África oriental y austral.'),
  ('jirafa', 'herbivoro', 'Jirafa', 'Giraffa camelopardalis', 'Vulnerable (VU)', 'VU', 'Sabanas y bosques abiertos con acacias.', 'Gestación de unos 15 meses; la cría mide cerca de 1,8 m al nacer.', 'Herbívoro: hojas de acacia y otros árboles altos.', 'África subsahariana.'),
  ('oso', 'oso', 'Oso', 'Ursidae', 'Varía por especie', null, 'Bosques, montañas y tundra según la especie. En Colombia vive el oso de anteojos en los páramos.', 'Implantación diferida; las crías nacen durante la hibernación o en madrigueras.', 'Omnívoro: frutos, raíces, insectos, miel, peces y carroña.', 'América, Europa y Asia; el oso de anteojos en los Andes.'),
  ('perezoso', 'mamifero', 'Perezoso de tres dedos', 'Bradypus variegatus', 'Preocupación menor (LC)', 'LC', 'Copas de selvas húmedas tropicales.', 'Gestación de unos 6 meses; una cría que viaja sobre la madre.', 'Herbívoro: hojas, brotes y flores (Cecropia).', 'Centroamérica y norte de Sudamérica, incluida Colombia.'),
  ('tucan', 'ave', 'Tucán', 'Ramphastos spp.', 'Preocupación menor (LC)', 'LC', 'Selvas tropicales y bordes de bosque.', 'Anida en huecos de árboles; pone de 2 a 4 huevos.', 'Frutos principalmente; también insectos, huevos y pequeños reptiles.', 'Desde México hasta Argentina; muy diverso en Colombia.'),
  ('guacamayo', 'ave', 'Guacamaya', 'Ara spp.', 'Varía (LC a CR)', null, 'Selvas húmedas, palmares y riberas.', 'Parejas de por vida; 2 o 3 huevos en cavidades de palmas.', 'Semillas, nueces, frutos; consumen arcilla para neutralizar toxinas.', 'Centro y Sudamérica tropical.'),
  ('colibri', 'ave', 'Colibrí', 'Trochilidae', 'Varía por especie', null, 'Desde selvas hasta páramos; Colombia tiene más de 160 especies.', 'Nidos diminutos de musgo y telaraña; 2 huevos.', 'Néctar de flores e insectos pequeños.', 'Exclusivo de América.'),
  ('flamenco', 'ave', 'Flamenco', 'Phoenicopterus spp.', 'Preocupación menor (LC)', 'LC', 'Lagunas salobres, salinas y costas poco profundas.', 'Colonias enormes; un huevo sobre un montículo de barro.', 'Filtrador: algas y crustáceos que le dan el color rosado.', 'Caribe (incluida La Guajira), Andes, África, Europa y Asia.'),
  ('aguila', 'ave', 'Águila', 'Accipitridae', 'Varía por especie', null, 'Montañas, bosques y costas.', 'Nidos grandes en árboles o riscos; 1 a 3 huevos.', 'Carnívoro: peces, mamíferos pequeños y aves.', 'Todos los continentes salvo la Antártida.'),
  ('buho', 'ave', 'Búho', 'Strigidae', 'Varía por especie', null, 'Bosques, desiertos, ciudades y montañas.', 'Anidan en huecos o nidos abandonados; 2 a 6 huevos.', 'Roedores, insectos, aves pequeñas; caza nocturna silenciosa.', 'Mundial.'),
  ('tortuga', 'reptil', 'Tortuga', 'Testudines', 'Varía (muchas amenazadas)', null, 'Océanos, ríos, lagunas y bosques según la especie.', 'Ponen huevos enterrados; la temperatura de la arena define el sexo de las crías.', 'Medusas, algas, pastos marinos, frutas o invertebrados.', 'Mundial; las marinas anidan en el Caribe y Pacífico colombiano.'),
  ('iguana', 'reptil', 'Iguana verde', 'Iguana iguana', 'Preocupación menor (LC)', 'LC', 'Bosques tropicales cerca de ríos.', 'Entierra de 20 a 70 huevos.', 'Herbívoro: hojas, flores y frutos.', 'Centroamérica, Sudamérica y el Caribe.'),
  ('cocodrilo', 'reptil', 'Cocodrilo / Caimán', 'Crocodylia', 'Varía (el caimán llanero está en peligro crítico)', 'CR', 'Ríos, ciénagas y manglares.', 'Nidos de vegetación o arena; la madre protege a las crías.', 'Carnívoro: peces, aves y mamíferos.', 'Zonas tropicales del mundo; Orinoquía y costa caribe en Colombia.'),
  ('rana', 'anfibio', 'Rana', 'Anura', 'Muchas especies amenazadas', null, 'Zonas húmedas, bosques y cuerpos de agua.', 'Huevos en agua; metamorfosis de renacuajo a adulto.', 'Insectos y otros invertebrados.', 'Mundial; Colombia es el 2.º país con más anfibios.'),
  ('gorila', 'primate', 'Gorila', 'Gorilla gorilla', 'En peligro crítico (CR)', 'CR', 'Selvas tropicales y bosques de montaña.', 'Gestación de 8,5 meses; una cría cada 4 años.', 'Herbívoro: hojas, tallos y frutas.', 'África central.'),
  ('chimpance', 'primate', 'Chimpancé', 'Pan troglodytes', 'En peligro (EN)', 'EN', 'Selvas y sabanas boscosas.', 'Gestación de 8 meses; la cría depende de la madre unos 5 años.', 'Omnívoro: frutas, hojas, insectos y a veces carne.', 'África occidental y central.'),
  ('orangutan', 'primate', 'Orangután', 'Pongo spp.', 'En peligro crítico (CR)', 'CR', 'Selvas tropicales de tierras bajas.', 'Una cría cada 6 a 8 años, el intervalo más largo entre mamíferos.', 'Frutas, hojas, cortezas e insectos.', 'Borneo y Sumatra.'),
  ('lobo', 'mamifero', 'Lobo', 'Canis lupus', 'Preocupación menor (LC)', 'LC', 'Bosques, tundra, montañas y praderas.', 'Una pareja dominante por manada; 4 a 6 cachorros.', 'Carnívoro: ciervos, alces y presas más pequeñas.', 'Norteamérica, Europa y Asia.'),
  ('zorro', 'mamifero', 'Zorro', 'Vulpes / Cerdocyon', 'Preocupación menor (LC)', 'LC', 'Bosques, praderas, montañas y zonas urbanas.', 'Camadas de 3 a 6 crías en madrigueras.', 'Omnívoro: roedores, frutas, insectos y aves.', 'Casi mundial; en Colombia el zorro perruno.'),
  ('tiburon', 'acuatico', 'Tiburón', 'Selachimorpha', 'Muchas especies amenazadas', null, 'Océanos de todo el mundo; Malpelo es santuario en Colombia.', 'Según especie: ovíparos, vivíparos u ovovivíparos.', 'Peces, calamares, focas y plancton.', 'Todos los océanos.'),
  ('panda', 'oso', 'Panda gigante', 'Ailuropoda melanoleuca', 'Vulnerable (VU)', 'VU', 'Bosques de bambú de montaña.', 'Una o dos crías diminutas; la hembra es fértil solo 2 o 3 días al año.', 'Bambú casi exclusivamente.', 'Centro de China.'),
  ('koala', 'mamifero', 'Koala', 'Phascolarctos cinereus', 'Vulnerable (VU)', 'VU', 'Bosques de eucalipto.', 'Marsupial: la cría vive 6 meses en la bolsa.', 'Hojas de eucalipto.', 'Este de Australia.'),
  ('hipopotamo', 'herbivoro', 'Hipopótamo', 'Hippopotamus amphibius', 'Vulnerable (VU)', 'VU', 'Ríos y lagos. En Colombia hay una población invasora en el Magdalena Medio.', 'Gestación de 8 meses; la cría nace bajo el agua.', 'Herbívoro: pastos que come de noche.', 'África subsahariana (invasor en Colombia).'),
  ('nutria', 'mamifero', 'Nutria', 'Lutrinae', 'Varía (la nutria gigante está en peligro)', null, 'Ríos, lagos y costas.', 'Camadas de 1 a 5 crías en madrigueras.', 'Peces, crustáceos y moluscos.', 'Mundial salvo Australia; Amazonía y Orinoquía.'),
  ('mono', 'primate', 'Mono', 'Primates', 'Varía por especie', null, 'Selvas tropicales y bosques.', 'Generalmente una cría por parto.', 'Frutas, hojas, insectos.', 'Zonas tropicales de América, África y Asia.'),
  ('perro', 'domestico', 'Perro', 'Canis lupus familiaris', 'Doméstico', 'DOM', 'Convive con humanos en todo el mundo.', 'Gestación de unos 63 días; camadas de 1 a 12 cachorros.', 'Omnívoro adaptado a la dieta humana.', 'Mundial.'),
  ('gato', 'domestico', 'Gato', 'Felis catus', 'Doméstico', 'DOM', 'Convive con humanos; puede volverse silvestre.', 'Gestación de unos 65 días; 3 a 5 gatitos.', 'Carnívoro estricto.', 'Mundial.'),
  ('caballo', 'domestico', 'Caballo', 'Equus caballus', 'Doméstico', 'DOM', 'Praderas y fincas.', 'Gestación de 11 meses; una cría.', 'Herbívoro: pasto y heno.', 'Mundial.'),
  ('vaca', 'domestico', 'Vaca', 'Bos taurus', 'Doméstico', 'DOM', 'Fincas y potreros.', 'Gestación de 9 meses; un ternero.', 'Herbívoro rumiante.', 'Mundial.'),
  ('oveja', 'domestico', 'Oveja', 'Ovis aries', 'Doméstico', 'DOM', 'Fincas y zonas de montaña.', 'Gestación de 5 meses; 1 o 2 corderos.', 'Herbívoro rumiante.', 'Mundial.'),
  ('ave', 'ave', 'Ave (especie por confirmar)', 'Aves', 'Por determinar', null, 'Usa la IA avanzada para identificar la especie exacta.', 'Ovíparas: ponen huevos con cáscara dura.', 'Variable según la especie.', 'Mundial.')
on conflict (id) do update set grupo = excluded.grupo, nombre = excluded.nombre, cientifico = excluded.cientifico,
  estado = excluded.estado, estado_code = excluded.estado_code, habitat = excluded.habitat,
  reproduccion = excluded.reproduccion, dieta = excluded.dieta, distribucion = excluded.distribucion;

delete from public.species_zones where species_id in ('puma', 'ocelote', 'tigrillo', 'danta', 'venado', 'pecari', 'chiguiro', 'hormiguero', 'armadillo', 'zarigueya', 'puercoespin', 'ardilla', 'murcielago', 'aullador', 'titi', 'capuchino', 'arana', 'condor', 'arpia', 'gallito', 'barranquero', 'garza', 'pelicano', 'martin', 'loro', 'charapa', 'carey', 'caiman-orinoco', 'boa', 'anaconda', 'coral', 'rana-dorada', 'sapo', 'delfin-rosado', 'manati', 'martillo', 'ballena', 'mariposa', 'abeja', 'hormiga', 'tarantula', 'escorpion', 'jaguar', 'tigre', 'leon', 'leopardo', 'guepardo', 'elefante', 'cebra', 'jirafa', 'oso', 'perezoso', 'tucan', 'guacamayo', 'colibri', 'flamenco', 'aguila', 'buho', 'tortuga', 'iguana', 'cocodrilo', 'rana', 'gorila', 'chimpance', 'orangutan', 'lobo', 'zorro', 'tiburon', 'panda', 'koala', 'hipopotamo', 'nutria', 'mono', 'perro', 'gato', 'caballo', 'vaca', 'oveja', 'ave');
insert into public.species_zones (species_id, lat, lng, radio_km) values
  ('puma', 5, -74, 350),
  ('puma', 4, -70, 400),
  ('puma', -12, -70, 900),
  ('ocelote', -1, -71, 500),
  ('ocelote', 6, -77, 200),
  ('ocelote', 7, -74, 200),
  ('tigrillo', 5, -75.5, 180),
  ('tigrillo', 2, -76.5, 150),
  ('danta', 4.5, -75.4, 120),
  ('danta', 1.5, -77, 120),
  ('venado', 5, -70, 350),
  ('venado', 10, -74, 200),
  ('venado', 5, -74, 150),
  ('pecari', 3, -72, 500),
  ('pecari', 8, -75, 250),
  ('chiguiro', 6, -70, 400),
  ('chiguiro', -3, -60, 900),
  ('hormiguero', 5, -70, 400),
  ('hormiguero', -5, -60, 900),
  ('armadillo', 5, -73, 500),
  ('zarigueya', 5, -74, 500),
  ('puercoespin', 6, -74, 400),
  ('ardilla', 5, -74.5, 350),
  ('murcielago', 5, -74, 500),
  ('aullador', 6, -74, 300),
  ('aullador', 3, -72, 400),
  ('aullador', -1, -71, 400),
  ('titi', 9.3, -75.3, 120),
  ('capuchino', -1, -71, 400),
  ('capuchino', 7, -74, 200),
  ('arana', 7.2, -74.4, 150),
  ('condor', 6.5, -72.5, 120),
  ('condor', 4.8, -75.4, 100),
  ('condor', -15, -70, 800),
  ('arpia', -1, -71, 400),
  ('arpia', 6, -77, 200),
  ('gallito', 5, -75.6, 150),
  ('gallito', 1, -77, 150),
  ('barranquero', 5, -75, 200),
  ('garza', 9, -74.5, 300),
  ('garza', 5, -70, 300),
  ('pelicano', 11, -74.5, 150),
  ('pelicano', 3.5, -77.5, 150),
  ('martin', 5, -73, 500),
  ('loro', 6, -71, 400),
  ('loro', -1, -71, 400),
  ('charapa', 6, -67.5, 250),
  ('charapa', -3.5, -70, 250),
  ('carey', 12.5, -81.7, 80),
  ('carey', 11.3, -74, 80),
  ('carey', 4, -77.8, 100),
  ('caiman-orinoco', 5, -70, 250),
  ('boa', 5, -74, 500),
  ('anaconda', 5, -70, 300),
  ('anaconda', -3, -64, 700),
  ('coral', 5, -74, 500),
  ('rana-dorada', 2.8, -77.3, 60),
  ('sapo', 5, -74, 500),
  ('delfin-rosado', -3.8, -70.4, 150),
  ('delfin-rosado', 6.2, -67.5, 150),
  ('manati', 9, -74.5, 200),
  ('manati', 8, -77, 100),
  ('martillo', 4, -81.6, 80),
  ('ballena', 4, -77.5, 200),
  ('mariposa', 5, -74, 500),
  ('jaguar', -3.5, -62, 900),
  ('jaguar', 4.5, -71, 500),
  ('jaguar', 17, -90, 300),
  ('tigre', 22, 79, 700),
  ('tigre', 46, 135, 400),
  ('tigre', 2, 102, 300),
  ('leon', -2, 35, 800),
  ('leon', -19, 24, 600),
  ('leon', 21.1, 70.8, 80),
  ('leopardo', 0, 25, 1200),
  ('leopardo', 20, 78, 500),
  ('guepardo', -2, 36, 500),
  ('guepardo', -22, 18, 500),
  ('elefante', -5, 30, 1200),
  ('elefante', 15, 78, 500),
  ('cebra', -3, 35, 700),
  ('cebra', -20, 25, 600),
  ('jirafa', -2, 36, 600),
  ('jirafa', -20, 22, 500),
  ('oso', 4.5, -74, 300),
  ('oso', 55, -120, 1000),
  ('oso', 60, 90, 1200),
  ('perezoso', 5, -75, 500),
  ('perezoso', -5, -65, 800),
  ('tucan', 4, -74, 600),
  ('tucan', -5, -60, 800),
  ('guacamayo', 3, -72, 600),
  ('guacamayo', -8, -63, 900),
  ('colibri', 4.5, -74, 500),
  ('colibri', -1, -78, 400),
  ('flamenco', 11.5, -72.5, 150),
  ('flamenco', -23, -67, 300),
  ('aguila', 45, -100, 1500),
  ('aguila', 5, -74, 500),
  ('buho', 4.5, -74, 600),
  ('buho', 48, 10, 800),
  ('tortuga', 11, -74, 300),
  ('tortuga', 3, -78, 250),
  ('iguana', 8, -75, 600),
  ('iguana', -5, -62, 800),
  ('cocodrilo', 6, -70, 400),
  ('cocodrilo', 10, -75, 250),
  ('rana', 4.5, -75, 600),
  ('gorila', -1, 15, 500),
  ('gorila', -1.4, 29.6, 100),
  ('chimpance', 2, 15, 800),
  ('chimpance', 8, -8, 500),
  ('orangutan', 0.5, 114, 400),
  ('orangutan', 3, 98, 200),
  ('lobo', 55, -110, 1500),
  ('lobo', 55, 60, 2000),
  ('zorro', 5, -74, 500),
  ('zorro', 50, 10, 1500),
  ('tiburon', 4, -81.6, 80),
  ('tiburon', -30, 20, 800),
  ('panda', 31, 104, 300),
  ('koala', -28, 152, 600),
  ('hipopotamo', -5, 30, 1200),
  ('hipopotamo', 6, -74.7, 60),
  ('nutria', -3, -65, 800),
  ('mono', 4, -73, 700),
  ('mono', -5, -62, 900);
