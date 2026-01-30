-- 기존 plan_type 체크 제약 조건 삭제 및 새로운 값들로 재생성
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_type_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_type_check 
CHECK (plan_type = ANY (ARRAY['free'::text, 'monthly'::text, 'season'::text]));