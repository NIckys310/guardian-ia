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
