-- =========================================================
-- GUARDIÁN · 14 · Guardián Pro (plan mensual con Wompi / Nequi)
-- - El pago se hace en la página segura de Wompi: aquí nunca pasan
--   números de Nequi ni de tarjetas, ni se guardan direcciones IP.
-- - Las claves de Wompi viven en payment_config, una tabla que NADIE
--   puede leer desde la app (solo estas funciones internas).
-- - Los límites de IA se cumplen en el servidor según el plan.
-- =========================================================
create table if not exists public.plans (
  id             text primary key,               -- free | pro
  nombre         text not null,
  precio_cop     int  not null default 0,        -- precio mensual en pesos
  limite_auto    int  not null,                  -- consultas automáticas a Claude por día
  limite_ident   int  not null,                  -- identificaciones manuales por día
  limite_chat    int  not null,                  -- mensajes al asistente por día
  beneficios     text[] not null default '{}',
  activo         boolean not null default true
);

create table if not exists public.subscriptions (
  owner_id           uuid primary key references public.profiles (id) on delete cascade,
  plan_id            text not null references public.plans (id) default 'free',
  status             text not null default 'active' check (status in ('active', 'expired', 'canceled')),
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  plan_id        text not null references public.plans (id),
  reference      text not null unique,
  amount_cents   bigint not null,
  currency       text not null default 'COP',
  status         text not null default 'PENDING',  -- PENDING | APPROVED | DECLINED | VOIDED | ERROR
  provider       text not null default 'wompi',
  provider_tx_id text,
  metodo         text,                              -- NEQUI, PSE, CARD… (solo el tipo, nunca el número)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists payments_owner_idx on public.payments (owner_id, created_at desc);

-- Claves de Wompi (se llenan desde el SQL Editor; nunca desde la app)
create table if not exists public.payment_config (
  id               int primary key default 1 check (id = 1),
  wompi_public_key text not null default '',
  integrity_secret text not null default '',
  events_secret    text not null default '',
  redirect_url     text not null default 'https://guardian-fauna.netlify.app/#/pro'
);
insert into public.payment_config (id) values (1) on conflict do nothing;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_config enable row level security;   -- sin políticas: nadie la lee

create policy "planes: lectura" on public.plans for select using (auth.role() = 'authenticated');
create policy "planes: admin" on public.plans for all using (public.es_admin()) with check (public.es_admin());
create policy "suscripción: ver la propia" on public.subscriptions for select using (owner_id = public.current_owner() or public.es_admin());
create policy "pagos: ver los propios" on public.payments for select using (owner_id = auth.uid() or public.es_admin());

insert into public.plans (id, nombre, precio_cop, limite_auto, limite_ident, limite_chat, beneficios) values
  ('free', 'Guardián', 0, 20, 30, 40, array[
    'IA local ilimitada (sin internet)', '20 consultas automáticas a Claude por día',
    '30 identificaciones avanzadas y 40 mensajes al asistente por día', 'Celulares vinculados, mapa, reportes y papelera']),
  ('pro', 'Guardián Pro', 14900, 300, 300, 500, array[
    'Todo lo del plan gratis', '300 consultas automáticas a Claude por día',
    '300 identificaciones avanzadas y 500 mensajes al asistente por día', 'Acceso primero a las nuevas actualizaciones',
    'Soporte prioritario'])
on conflict (id) do update set nombre = excluded.nombre, limite_auto = excluded.limite_auto,
  limite_ident = excluded.limite_ident, limite_chat = excluded.limite_chat, beneficios = excluded.beneficios;

-- Plan vigente de la cuenta (la de un celular vinculado es la de su cuenta principal)
create or replace function public.mi_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', p.id, 'nombre', p.nombre, 'precio_cop', p.precio_cop,
    'limite_auto', p.limite_auto, 'limite_ident', p.limite_ident, 'limite_chat', p.limite_chat,
    'vence', case when p.id = 'pro' then s.current_period_end end,
    'pagos_activos', (select wompi_public_key <> '' and integrity_secret <> '' from public.payment_config where id = 1),
    'uso_hoy', (select jsonb_build_object(
        'auto', count(*) filter (where kind = 'auto'),
        'identify', count(*) filter (where kind = 'identify'),
        'chat', count(*) filter (where kind = 'chat'))
      from public.ai_requests where owner_id = public.current_owner() and created_at > now() - interval '1 day')
  )
  from public.plans p
  left join public.subscriptions s on s.owner_id = public.current_owner()
  where p.id = case when s.plan_id = 'pro' and s.status = 'active' and s.current_period_end > now() then 'pro' else 'free' end;
$$;

-- ¿Puede hacer otra consulta de este tipo hoy? (lo usa el servidor de Netlify)
create or replace function public.ia_permitida(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  with plan as (select public.mi_plan() as j)
  select coalesce((j -> 'uso_hoy' ->> case p_kind when 'auto' then 'auto' when 'chat' then 'chat' else 'identify' end)::int, 0)
       < (j ->> case p_kind when 'auto' then 'limite_auto' when 'chat' then 'limite_chat' else 'limite_ident' end)::int
  from plan;
$$;

-- Paso 1 del pago: crea la referencia y la firma de integridad para Wompi
create or replace function public.crear_pago(p_plan text default 'pro')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  cfg public.payment_config%rowtype;
  pl public.plans%rowtype;
  ref text;
  cents bigint;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and is_device) then
    raise exception 'Inicia sesión con tu cuenta principal para suscribirte';
  end if;
  select * into cfg from public.payment_config where id = 1;
  if cfg.wompi_public_key = '' or cfg.integrity_secret = '' then
    raise exception 'Los pagos aún no están activados';
  end if;
  select * into pl from public.plans where id = p_plan and activo and precio_cop > 0;
  if not found then raise exception 'Plan no disponible'; end if;
  cents := pl.precio_cop::bigint * 100;
  ref := 'GDN-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  insert into public.payments (owner_id, plan_id, reference, amount_cents) values (auth.uid(), pl.id, ref, cents);
  return jsonb_build_object(
    'public_key', cfg.wompi_public_key, 'reference', ref, 'amount_in_cents', cents, 'currency', 'COP',
    'signature', encode(extensions.digest(ref || cents::text || 'COP' || cfg.integrity_secret, 'sha256'), 'hex'),
    'redirect_url', cfg.redirect_url);
end $$;
revoke execute on function public.crear_pago(text) from anon;

-- Paso 2 del pago: Wompi avisa el resultado. Se verifica la firma con el secreto de eventos.
create or replace function public.wompi_evento(p_evento jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  cfg public.payment_config%rowtype;
  tx jsonb := p_evento -> 'data' -> 'transaction';
  props jsonb := p_evento -> 'signature' -> 'properties';
  cadena text := '';
  prop text;
  pago public.payments%rowtype;
  fin timestamptz;
begin
  select * into cfg from public.payment_config where id = 1;
  if cfg.events_secret = '' then return jsonb_build_object('ok', false, 'error', 'sin secreto'); end if;
  -- Firma: valores de las propiedades indicadas + timestamp + secreto de eventos (SHA-256)
  for prop in select jsonb_array_elements_text(props) loop
    cadena := cadena || coalesce((p_evento -> 'data') #>> string_to_array(prop, '.'), '');
  end loop;
  cadena := cadena || (p_evento ->> 'timestamp') || cfg.events_secret;
  if lower(encode(extensions.digest(cadena, 'sha256'), 'hex')) <> lower(p_evento -> 'signature' ->> 'checksum') then
    return jsonb_build_object('ok', false, 'error', 'firma inválida');
  end if;

  select * into pago from public.payments where reference = tx ->> 'reference' for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'referencia desconocida'); end if;
  if (tx ->> 'amount_in_cents')::bigint <> pago.amount_cents or tx ->> 'currency' <> pago.currency then
    update public.payments set status = 'ERROR', updated_at = now() where id = pago.id;
    return jsonb_build_object('ok', false, 'error', 'monto distinto');
  end if;

  update public.payments set status = tx ->> 'status', provider_tx_id = tx ->> 'id',
         metodo = tx ->> 'payment_method_type', updated_at = now()
   where id = pago.id;

  if tx ->> 'status' = 'APPROVED' and pago.status <> 'APPROVED' then
    -- Un mes más (si ya era Pro, se suma al tiempo que le quedaba)
    select greatest(coalesce(current_period_end, now()), now()) + interval '30 days' into fin
      from public.subscriptions where owner_id = pago.owner_id;
    insert into public.subscriptions (owner_id, plan_id, status, current_period_end, updated_at)
    values (pago.owner_id, pago.plan_id, 'active', coalesce(fin, now() + interval '30 days'), now())
    on conflict (owner_id) do update set plan_id = excluded.plan_id, status = 'active',
      current_period_end = excluded.current_period_end, updated_at = now();
    insert into public.notifications (owner_id, tipo, titulo, cuerpo)
    values (pago.owner_id, 'info', '¡Bienvenida a Guardián Pro!', 'Tu plan Pro está activo por 30 días.');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.wompi_evento(jsonb) to anon, authenticated;

-- El límite por hora de la migración 08 se reemplaza por el límite diario del plan
comment on function public.uso_ia_ultima_hora() is 'Obsoleta: los límites ahora dependen del plan (ia_permitida).';
