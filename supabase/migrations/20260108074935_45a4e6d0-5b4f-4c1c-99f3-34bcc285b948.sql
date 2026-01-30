-- Fix 1: Add restrictive UPDATE and DELETE policies to subscriptions table
-- Block all user updates - subscription changes should only happen via service role in edge functions
CREATE POLICY "Block user updates to subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Block user deletes from subscriptions"
ON public.subscriptions FOR DELETE
TO authenticated
USING (false);

-- Allow admins to manage subscriptions if needed
CREATE POLICY "Admins can update subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete subscriptions"
ON public.subscriptions FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Replace profiles update policy to restrict subscription-related fields
-- First drop the existing overly permissive update policy
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Create a new restricted update policy
-- Users can only update safe fields (display_name, avatar_url)
-- Subscription fields (plan_type, credits, billing_key, plan_expires_at, auto_renew) are protected
CREATE POLICY "Users can update safe profile fields"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
);

-- Create a trigger function to prevent modification of protected fields
CREATE OR REPLACE FUNCTION public.protect_profile_subscription_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserve subscription-related fields - they can only be changed by service role
  -- Check if the current role is NOT the service role
  IF current_setting('role', true) != 'service_role' THEN
    NEW.plan_type := OLD.plan_type;
    NEW.credits := OLD.credits;
    NEW.billing_key := OLD.billing_key;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.auto_renew := OLD.auto_renew;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to enforce protected fields
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_subscription_fields();