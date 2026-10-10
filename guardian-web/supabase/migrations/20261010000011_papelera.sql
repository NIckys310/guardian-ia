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
