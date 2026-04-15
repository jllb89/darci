update public.jurisdiction_product_availability
set
  is_available = false,
  reason_if_unavailable = 'Launch limited to California and Ohio during current rollout.',
  updated_at = now()
where jurisdiction not in ('US-CA', 'US-OH');

update public.jurisdiction_product_availability
set
  is_available = true,
  reason_if_unavailable = null,
  updated_at = now()
where jurisdiction in ('US-CA', 'US-OH');