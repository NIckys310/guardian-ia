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
