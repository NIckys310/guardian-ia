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
