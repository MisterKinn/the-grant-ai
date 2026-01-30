-- Drop old check constraint and add new one with 'pending_deposit' status
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'pending_deposit'));