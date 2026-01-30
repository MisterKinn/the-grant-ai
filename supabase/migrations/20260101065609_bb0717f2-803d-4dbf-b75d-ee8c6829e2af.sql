-- Add columns to coupons table for usage limits and expiration
ALTER TABLE public.coupons 
ADD COLUMN max_uses INTEGER DEFAULT NULL,
ADD COLUMN current_uses INTEGER DEFAULT 0,
ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create coupon_uses table to track per-user coupon usage
CREATE TABLE public.coupon_uses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES public.coupons(code) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(coupon_code, user_id)
);

-- Enable RLS
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

-- Users can view their own coupon usage
CREATE POLICY "Users can view their own coupon usage"
ON public.coupon_uses
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own coupon usage
CREATE POLICY "Users can insert their own coupon usage"
ON public.coupon_uses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all coupon uses
CREATE POLICY "Admins can manage coupon uses"
ON public.coupon_uses
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));