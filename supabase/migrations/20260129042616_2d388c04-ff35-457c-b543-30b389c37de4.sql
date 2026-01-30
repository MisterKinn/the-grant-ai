-- Create storage bucket for user uploads (PDF files for AI chat)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-uploads', 'user-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own files to user-uploads bucket
CREATE POLICY "Users can upload to user-uploads bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to read their own uploaded files from user-uploads bucket
CREATE POLICY "Users can read from user-uploads bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own files from user-uploads bucket
CREATE POLICY "Users can delete from user-uploads bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-uploads' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role to access all files in user-uploads bucket
CREATE POLICY "Service role full access to user-uploads"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'user-uploads')
WITH CHECK (bucket_id = 'user-uploads');