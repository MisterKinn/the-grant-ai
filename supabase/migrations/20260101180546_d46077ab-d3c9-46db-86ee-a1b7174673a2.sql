-- Add explicit denial policies for anonymous (unauthenticated) users
-- This ensures that even if RLS is misconfigured, anonymous users cannot access sensitive data

-- Profiles table: Deny anonymous SELECT access
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

-- Leads table: Deny anonymous SELECT access (admins only should read)
CREATE POLICY "Deny anonymous read access to leads"
ON public.leads
FOR SELECT
TO anon
USING (false);

-- Payments table: Deny anonymous SELECT access
CREATE POLICY "Deny anonymous access to payments"
ON public.payments
FOR SELECT
TO anon
USING (false);

-- Documents table: Deny anonymous SELECT access
CREATE POLICY "Deny anonymous access to documents"
ON public.documents
FOR SELECT
TO anon
USING (false);