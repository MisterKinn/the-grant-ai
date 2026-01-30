-- Add CHECK constraint to validate Korean phone numbers at database level
-- Korean mobile format: 01X followed by 7-8 digits (10-11 total digits)
ALTER TABLE public.leads 
ADD CONSTRAINT valid_korean_phone 
CHECK (phone_number ~ '^01[0-9]\d{7,8}$');