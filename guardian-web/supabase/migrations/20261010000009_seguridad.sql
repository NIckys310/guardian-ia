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
