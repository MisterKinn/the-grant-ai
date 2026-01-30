-- Add support_type column to documents table
ALTER TABLE public.documents 
ADD COLUMN support_type text DEFAULT 'preliminary';

-- Create storage bucket for project files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('project_files', 'project_files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for project_files bucket
CREATE POLICY "Users can upload their own project files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'project_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own project files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'project_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own project files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'project_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view project files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'project_files');