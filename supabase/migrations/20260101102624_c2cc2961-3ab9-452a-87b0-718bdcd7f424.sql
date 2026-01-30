-- Fix 1: Remove public access to coupons table (coupons_public_read vulnerability)
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;

-- Fix 2: Make project_files storage bucket private (project_files_public vulnerability)
UPDATE storage.buckets SET public = false WHERE id = 'project_files';

-- Drop the public access policy for project_files
DROP POLICY IF EXISTS "Public can view project files" ON storage.objects;