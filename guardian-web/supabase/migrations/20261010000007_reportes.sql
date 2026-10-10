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
