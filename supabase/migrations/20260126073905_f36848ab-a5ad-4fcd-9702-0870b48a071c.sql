-- Add hwpx_template_path column to store the path for custom HWPX templates
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS hwpx_template_path text DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.documents.hwpx_template_path IS 'Storage path for custom HWPX template files uploaded by users';