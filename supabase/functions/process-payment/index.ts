import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side plan configuration - cannot be manipulated by client
const PLAN_CONFIG = {
  monthly: { price: 33000, credits: 300 },
  season: { price: 198000, credits: 3600 },
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PORTONE_REST_API_KEY = Deno.env.get("PORTONE_REST_API_KEY");
    const PORTONE_REST_API_SECRET = Deno.env.get("PORTONE_REST_API_SECRET");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authenticated user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "인증이 필요합니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: "인증에 실패했습니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[process-payment] User:", user.id);

    // Parse request body
    const { planType, couponCode, impUid, merchantUid } = await req.json();

    // Validate plan type
    if (!planType || !PLAN_CONFIG[planType as keyof typeof PLAN_CONFIG]) {
      return new Response(
        JSON.stringify({ success: false, error: "유효하지 않은 플랜입니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planConfig = PLAN_CONFIG[planType as keyof typeof PLAN_CONFIG];
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Server-side coupon validation
    let discountValue = 0;
    let validCouponCode: string | null = null;

    if (couponCode) {
      const normalizedCode = couponCode.trim();
      console.log("[process-payment] Looking for coupon:", normalizedCode);
      
      // Case-insensitive search using ilike
      const { data: coupon, error: couponError } = await supabaseAdmin
        .from("coupons")
        .select("code, discount_type, discount_value, is_active, max_uses, current_uses, expires_at")
        .ilike("code", normalizedCode)
        .eq("is_active", true)
        .maybeSingle();

      if (couponError) {
        console.error("Coupon lookup error:", couponError);
        return new Response(
          JSON.stringify({ success: false, error: "쿠폰 확인 중 오류가 발생했습니다." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (coupon) {
        // Validate coupon
        const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
        const isExhausted = coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses;

        // Check if user already used this coupon
        const { data: existingUse } = await supabaseAdmin
          .from("coupon_uses")
          .select("id")
          .eq("coupon_code", coupon.code)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!isExpired && !isExhausted && !existingUse) {
          discountValue = coupon.discount_value;
          validCouponCode = coupon.code;
          console.log("[process-payment] Valid coupon:", validCouponCode, "Discount:", discountValue);
        }
      }
    }

    // Calculate final price server-side
    const originalPrice = planConfig.price;
    const finalPrice = discountValue > 0 
      ? Math.round(originalPrice * (1 - discountValue / 100))
      : originalPrice;
    const creditsToAdd = planConfig.credits;

    console.log("[process-payment] Original:", originalPrice, "Final:", finalPrice, "Credits:", creditsToAdd);

    // If payment is required (non-zero), verify with PortOne
    if (finalPrice > 0) {
      if (!impUid || !merchantUid) {
        return new Response(
          JSON.stringify({ success: false, error: "결제 정보가 필요합니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!PORTONE_REST_API_KEY || !PORTONE_REST_API_SECRET) {
        console.error("Missing PortOne configuration");
        return new Response(
          JSON.stringify({ success: false, error: "결제 시스템 오류입니다." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get PortOne access token
      const tokenResponse = await fetch("https://api.iamport.kr/users/getToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imp_key: PORTONE_REST_API_KEY,
          imp_secret: PORTONE_REST_API_SECRET,
        }),
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.code !== 0) {
        console.error("PortOne token error:", tokenData);
        return new Response(
          JSON.stringify({ success: false, error: "결제 검증 실패" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessToken = tokenData.response.access_token;

      // Verify payment with PortOne
      const paymentResponse = await fetch(`https://api.iamport.kr/payments/${impUid}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const paymentData = await paymentResponse.json();
      if (paymentData.code !== 0) {
        console.error("PortOne payment error:", paymentData);
        return new Response(
          JSON.stringify({ success: false, error: "결제 정보 조회 실패" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payment = paymentData.response;

      // Verify payment status - ONLY "paid" is valid for card payments
      // "ready" is for virtual bank (vbank) which should go through process-vbank
      if (payment.status !== "paid") {
        console.error("Payment not paid! Status:", payment.status);
        return new Response(
          JSON.stringify({ success: false, error: `결제가 완료되지 않았습니다. 상태: ${payment.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify the amount matches our server-side calculation
      if (payment.amount !== finalPrice) {
        console.error("Amount mismatch! Expected:", finalPrice, "Got:", payment.amount);
        return new Response(
          JSON.stringify({ success: false, error: "결제 금액이 일치하지 않습니다." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check for duplicate payment
      const { data: existingPayment } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("imp_uid", impUid)
        .maybeSingle();

      if (existingPayment) {
        console.log("[process-payment] Duplicate payment detected:", impUid);
        return new Response(
          JSON.stringify({ success: true, message: "이미 처리된 결제입니다." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[process-payment] Payment verified:", impUid, "Amount:", payment.amount);
    }

    // All validations passed - record payment and update profile
    const paymentMerchantUid = merchantUid || `free_${crypto.randomUUID()}`;
    const paymentImpUid = impUid || `free_${paymentMerchantUid}`;

    // Insert payment record
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      imp_uid: paymentImpUid,
      merchant_uid: paymentMerchantUid,
      amount: finalPrice,
      plan_type: planType,
      status: "paid",
      payment_method: finalPrice === 0 ? "coupon" : "card",
      credits_added: creditsToAdd,
    });

    if (paymentError) {
      console.error("Payment record error:", paymentError);
      return new Response(
        JSON.stringify({ success: false, error: "결제 기록 저장 실패" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record coupon usage if applicable
    if (validCouponCode) {
      const { error: couponUseError } = await supabaseAdmin
        .from("coupon_uses")
        .insert({
          coupon_code: validCouponCode,
          user_id: user.id,
        });

      if (couponUseError) {
        console.error("Coupon use record error:", couponUseError);
        // Non-fatal error, continue
      }

      // Increment current_uses atomically
      const { data: currentCoupon } = await supabaseAdmin
        .from("coupons")
        .select("current_uses")
        .eq("code", validCouponCode)
        .single();
      
      if (currentCoupon) {
        await supabaseAdmin
          .from("coupons")
          .update({ current_uses: (currentCoupon.current_uses || 0) + 1 })
          .eq("code", validCouponCode);
      }
    }

    // Update user profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id: user.id,
        email: user.email,
        plan_type: planType,
        credits: creditsToAdd,
      }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Profile update error:", profileError);
      // Non-fatal, payment is already recorded
    }

    console.log("[process-payment] Success! User:", user.id, "Plan:", planType, "Credits:", creditsToAdd);

    return new Response(
      JSON.stringify({
        success: true,
        planType,
        creditsAdded: creditsToAdd,
        amountPaid: finalPrice,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[process-payment] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
