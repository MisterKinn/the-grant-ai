-- Remove the vulnerable policy that allows anonymous access to coupons
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;