-- =========================================================
-- GUARDIÁN · 15 · Modo prueba de pagos (simulación para la clase)
-- - Mientras NO estén las claves reales de Wompi, Guardián Pro se puede
--   "comprar" con un pago SIMULADO: no se mueve dinero real.
-- - Cuando se configuren las claves reales (con autorización del profesor),
--   el modo prueba se apaga solo y estas funciones dejan de funcionar.
-- - Los pagos simulados quedan marcados con provider = 'simulado' y
--   referencia SIM-…, para que nunca se confundan con pagos reales.
-- =========================================================

-- ¿Estamos en modo prueba? (sí, mientras falten las claves reales de Wompi)
create or replace function public.modo_prueba_pagos()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select wompi_public_key = '' or integrity_secret = '' from public.payment_config where id = 1), true);
$$;

-- El plan de la cuenta ahora también dice si está en modo prueba
create or replace function public.mi_plan()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', p.id, 'nombre', p.nombre, 'precio_cop', p.precio_cop,
    'limite_auto', p.limite_auto, 'limite_ident', p.limite_ident, 'limite_chat', p.limite_chat,
    'vence', case when p.id = 'pro' then s.current_period_end end,
    'pagos_activos', (select wompi_public_key <> '' and integrity_secret <> '' from public.payment_config where id = 1),
    'modo_prueba', public.modo_prueba_pagos(),
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

-- Pago SIMULADO: registra un pago aprobado de prueba y activa Pro por 30 días
create or replace function public.simular_pago(p_metodo text default 'TRANSFERENCIA_PRUEBA')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  pl public.plans%rowtype;
  ref text;
  base timestamptz;
  fin timestamptz;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and is_device) then
    raise exception 'Inicia sesión con tu cuenta principal para suscribirte';
  end if;
  if not public.modo_prueba_pagos() then
    raise exception 'El modo prueba está apagado: los pagos ya son reales';
  end if;
  if p_metodo not in ('TRANSFERENCIA_PRUEBA', 'BILLETERA_PRUEBA', 'TARJETA_PRUEBA') then
    raise exception 'Método de pago de prueba no válido';
  end if;
  -- Máximo 5 pagos de prueba por día y por cuenta
  if (select count(*) from public.payments
      where owner_id = auth.uid() and provider = 'simulado' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Máximo 5 pagos de prueba por día';
  end if;

  select * into pl from public.plans where id = 'pro' and activo;
  if not found then raise exception 'Plan no disponible'; end if;

  ref := 'SIM-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.payments (owner_id, plan_id, reference, amount_cents, status, provider, metodo)
    values (auth.uid(), pl.id, ref, pl.precio_cop::bigint * 100, 'APPROVED', 'simulado', p_metodo);

  -- Si ya tenía Pro vigente, se suman 30 días desde el vencimiento
  select current_period_end into base from public.subscriptions
    where owner_id = auth.uid() and plan_id = 'pro' and status = 'active' and current_period_end > now();
  fin := coalesce(base, now()) + interval '30 days';
  insert into public.subscriptions (owner_id, plan_id, status, current_period_end, updated_at)
    values (auth.uid(), 'pro', 'active', fin, now())
    on conflict (owner_id) do update set plan_id = 'pro', status = 'active', current_period_end = fin, updated_at = now();

  return jsonb_build_object('reference', ref, 'amount_cents', pl.precio_cop::bigint * 100, 'currency', 'COP',
    'metodo', p_metodo, 'vence', fin, 'aprobado', now(), 'simulado', true);
end $$;
revoke execute on function public.simular_pago(text) from anon;

-- Volver al plan gratis (solo en modo prueba, para repetir la demostración)
create or replace function public.cancelar_prueba()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  if not public.modo_prueba_pagos() then raise exception 'El modo prueba está apagado'; end if;
  update public.subscriptions set plan_id = 'free', status = 'canceled', current_period_end = now(), updated_at = now()
    where owner_id = auth.uid();
end $$;
revoke execute on function public.cancelar_prueba() from anon;
