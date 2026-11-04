ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_confirmed_by_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_confirmed_by_check
  CHECK (confirmed_by IS NULL OR confirmed_by = ANY (ARRAY['gateway','manual','webhook','reconcile','pix_screen']));