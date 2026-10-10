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
