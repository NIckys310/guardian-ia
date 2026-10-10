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
