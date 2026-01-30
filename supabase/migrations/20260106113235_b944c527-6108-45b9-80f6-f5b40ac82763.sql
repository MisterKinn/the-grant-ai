-- Add billing subscription columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS billing_key TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT TRUE;

-- Create subscriptions table for subscription history
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_type TEXT NOT NULL,
  billing_key TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  cancelled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscriptions
CREATE POLICY "Users can view their own subscriptions" 
ON public.subscriptions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions" 
ON public.subscriptions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Add check constraint for subscription status
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_status_check 
CHECK (status IN ('active', 'cancelled', 'expired', 'payment_failed'));

-- Add check constraint for plan_type
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_plan_type_check 
CHECK (plan_type IN ('monthly', 'season'));