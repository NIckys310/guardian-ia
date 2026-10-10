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
