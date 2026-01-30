-- Create coupons table for discount functionality
CREATE TABLE public.coupons (
  code TEXT PRIMARY KEY,
  discount_type TEXT NOT NULL DEFAULT 'percent',
  discount_value INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to manage coupons
CREATE POLICY "Admins can manage coupons" 
ON public.coupons 
FOR ALL 
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create policy for anyone to read active coupons (for validation during checkout)
CREATE POLICY "Anyone can read active coupons" 
ON public.coupons 
FOR SELECT 
USING (is_active = true);