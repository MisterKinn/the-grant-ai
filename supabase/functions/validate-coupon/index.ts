import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation schema - alphanumeric with dashes/underscores only
const CouponInputSchema = z.object({
  couponCode: z.string()
    .min(1, "Coupon code required")
    .max(50, "Coupon code too long")
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid coupon code format"),
});

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ valid: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authenticated user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ valid: false, error: "인증이 필요합니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth context
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ valid: false, error: "인증에 실패했습니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[validate-coupon] User:", user.id);

    // Parse and validate request body
    const rawBody = await req.json();
    const parseResult = CouponInputSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ valid: false, error: "쿠폰 코드를 입력해주세요." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedCode = parseResult.data.couponCode.trim();
    console.log("[validate-coupon] Validating code:", normalizedCode);

    // Use service role to query coupons table (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Query the specific coupon (case-insensitive)
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from("coupons")
      .select("code, discount_type, discount_value, is_active, max_uses, current_uses, expires_at")
      .ilike("code", normalizedCode)
      .eq("is_active", true)
      .maybeSingle();

    if (couponError) {
      console.error("Coupon lookup error:", couponError);
      return new Response(
        JSON.stringify({ valid: false, error: "쿠폰 조회 중 오류가 발생했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!coupon) {
      return new Response(
        JSON.stringify({ valid: false, error: "유효하지 않은 코드입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, error: "만료된 쿠폰입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check usage limit
    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return new Response(
        JSON.stringify({ valid: false, error: "쿠폰 사용 수량이 모두 소진되었습니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already used this coupon
    const { data: existingUse, error: useError } = await supabaseAdmin
      .from("coupon_uses")
      .select("id")
      .eq("coupon_code", coupon.code)
      .eq("user_id", user.id)
      .maybeSingle();

    if (useError) {
      console.error("Coupon use check error:", useError);
      return new Response(
        JSON.stringify({ valid: false, error: "쿠폰 사용 확인 중 오류가 발생했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingUse) {
      return new Response(
        JSON.stringify({ valid: false, error: "이미 사용한 쿠폰입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All validations passed
    console.log("[validate-coupon] Valid coupon:", coupon.code, "Discount:", coupon.discount_value);
    
    return new Response(
      JSON.stringify({
        valid: true,
        code: coupon.code,
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[validate-coupon] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ valid: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
