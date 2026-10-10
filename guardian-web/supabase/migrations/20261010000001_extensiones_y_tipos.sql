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
