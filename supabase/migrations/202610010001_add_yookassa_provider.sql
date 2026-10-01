alter table public.purchases
  add column if not exists payment_provider text;

create or replace function public.confirm_yookassa_purchase(
  p_purchase_id uuid,
  p_payment_id text,
  p_amount numeric,
  p_currency text,
  p_shop_id text,
  p_expected_shop_id text,
  p_yookassa_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_purchase public.purchases%rowtype;
  v_status text := lower(coalesce(p_yookassa_status, ''));
  v_currency text := upper(coalesce(p_currency, ''));
  v_process_result jsonb;
begin
  if p_purchase_id is null then
    raise exception 'purchase_id_required';
  end if;

  if nullif(trim(coalesce(p_payment_id, '')), '') is null then
    raise exception 'payment_id_required';
  end if;

  if nullif(trim(coalesce(p_expected_shop_id, '')), '') is null then
    raise exception 'expected_shop_id_required';
  end if;

  if coalesce(p_shop_id, '') <> coalesce(p_expected_shop_id, '') then
    raise exception 'shop_id_mismatch';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_invalid';
  end if;

  select *
    into v_purchase
    from public.purchases
   where id = p_purchase_id
   for update;

  if not found then
    raise exception 'purchase_not_found';
  end if;

  if coalesce(v_purchase.payment_provider, '') <> 'yookassa' then
    raise exception 'payment_provider_mismatch';
  end if;

  if v_purchase.id_payment is not null and v_purchase.id_payment <> p_payment_id then
    raise exception 'payment_id_mismatch';
  end if;

  if v_purchase.id_payment is null then
    update public.purchases
       set id_payment = p_payment_id
     where id = v_purchase.id;

    v_purchase.id_payment := p_payment_id;
  end if;

  if v_purchase.sum is null or v_purchase.sum <> p_amount then
    raise exception 'amount_mismatch';
  end if;

  if upper(coalesce(v_purchase.currency, '')) <> v_currency or v_currency <> 'RUB' then
    raise exception 'currency_mismatch';
  end if;

  if v_status = 'canceled' then
    if lower(coalesce(v_purchase.status, '')) = 'paid' or v_purchase.processed_at is not null then
      return jsonb_build_object(
        'ok', true,
        'purchase_id', v_purchase.id,
        'status', v_purchase.status,
        'already_final', true
      );
    end if;

    update public.purchases
       set status = 'Canceled'
     where id = v_purchase.id;

    return jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'status', 'Canceled'
    );
  end if;

  if v_status <> 'succeeded' then
    raise exception 'unsupported_yookassa_status';
  end if;

  if lower(coalesce(v_purchase.status, '')) <> 'paid' then
    update public.purchases
       set status = 'Paid',
           paid_at = coalesce(paid_at, now())
     where id = v_purchase.id;
  end if;

  if v_purchase.processed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'status', 'Paid',
      'already_processed', true
    );
  end if;

  select to_jsonb(public.process_paid_purchase(v_purchase.id))
    into v_process_result;

  if coalesce((v_process_result ->> 'ok')::boolean, false) is not true then
    raise exception 'process_paid_purchase_failed: %', coalesce(v_process_result::text, 'null');
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'status', 'Paid',
    'processed', true,
    'process_result', v_process_result
  );
end;
$$;

revoke execute on function public.confirm_yookassa_purchase(uuid, text, numeric, text, text, text, text) from public;
revoke execute on function public.confirm_yookassa_purchase(uuid, text, numeric, text, text, text, text) from anon;
revoke execute on function public.confirm_yookassa_purchase(uuid, text, numeric, text, text, text, text) from authenticated;
grant execute on function public.confirm_yookassa_purchase(uuid, text, numeric, text, text, text, text) to service_role;
