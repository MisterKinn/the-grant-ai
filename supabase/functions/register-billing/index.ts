import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Server-side plan configuration
const PLAN_CONFIG = {
  monthly: { price: 33000, credits: 300, durationDays: 30 },
  season: { price: 198000, credits: 3600, durationDays: 365 },
};

serve(async (req) => {
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

    if (!PORTONE_REST_API_KEY || !PORTONE_REST_API_SECRET) {
      console.error("Missing PortOne configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Payment system error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authenticated user
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

    console.log("[register-billing] User:", user.id);

    // Parse request body
    const { planType, customerUid, impUid, merchantUid, couponCode } = await req.json();

    // Validate plan type
    if (!planType || !PLAN_CONFIG[planType as keyof typeof PLAN_CONFIG]) {
      return new Response(
        JSON.stringify({ success: false, error: "유효하지 않은 플랜입니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!customerUid) {
      return new Response(
        JSON.stringify({ success: false, error: "빌링키 정보가 필요합니다." }),
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
      const { data: coupon, error: couponError } = await supabaseAdmin
        .from("coupons")
        .select("code, discount_type, discount_value, is_active, max_uses, current_uses, expires_at")
        .ilike("code", normalizedCode)
        .eq("is_active", true)
        .maybeSingle();

      if (!couponError && coupon) {
        const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();
        const isExhausted = coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses;

        const { data: existingUse } = await supabaseAdmin
          .from("coupon_uses")
          .select("id")
          .eq("coupon_code", coupon.code)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!isExpired && !isExhausted && !existingUse) {
          discountValue = coupon.discount_value;
          validCouponCode = coupon.code;
          console.log("[register-billing] Valid coupon:", validCouponCode, "Discount:", discountValue);
        }
      }
    }

    // Calculate price
    const originalPrice = planConfig.price;
    const finalPrice = discountValue > 0 
      ? Math.round(originalPrice * (1 - discountValue / 100))
      : originalPrice;
    const creditsToAdd = planConfig.credits;

    console.log("[register-billing] Original:", originalPrice, "Final:", finalPrice, "Credits:", creditsToAdd);

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

    // Verify billing key exists
    const billingKeyResponse = await fetch(`https://api.iamport.kr/subscribe/customers/${customerUid}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const billingKeyData = await billingKeyResponse.json();
    if (billingKeyData.code !== 0) {
      console.error("Billing key verification failed:", billingKeyData);
      return new Response(
        JSON.stringify({ success: false, error: "빌링키 확인 실패" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[register-billing] Billing key verified for customer:", customerUid);

    // If price > 0, make initial payment using billing key
    let paymentImpUid = impUid || `billing_init_${crypto.randomUUID()}`;
    let paymentMerchantUid = merchantUid || `sub_${crypto.randomUUID()}`;

    if (finalPrice > 0) {
      // Make payment via billing key
      const paymentResponse = await fetch("https://api.iamport.kr/subscribe/payments/again", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customer_uid: customerUid,
          merchant_uid: paymentMerchantUid,
          amount: finalPrice,
          name: `The Grant AI ${planType === 'monthly' ? '월간 패스' : '시즌 패스'}`,
        }),
      });

      const paymentData = await paymentResponse.json();
      console.log("[register-billing] Payment response:", paymentData);

      if (paymentData.code !== 0 || paymentData.response?.status !== "paid") {
        console.error("Payment failed:", paymentData);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: paymentData.message || "결제에 실패했습니다.",
            detail: paymentData.response?.fail_reason
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      paymentImpUid = paymentData.response.imp_uid;
      console.log("[register-billing] Payment successful:", paymentImpUid);
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + planConfig.durationDays);

    // Check for duplicate payment
    const { data: existingPayment } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("imp_uid", paymentImpUid)
      .maybeSingle();

    if (existingPayment) {
      console.log("[register-billing] Duplicate payment detected:", paymentImpUid);
      return new Response(
        JSON.stringify({ success: true, message: "이미 처리된 결제입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert payment record
    const { error: paymentError } = await supabaseAdmin.from("payments").insert({
      user_id: user.id,
      imp_uid: paymentImpUid,
      merchant_uid: paymentMerchantUid,
      amount: finalPrice,
      plan_type: planType,
      status: "paid",
      payment_method: "billing",
      credits_added: creditsToAdd,
    });

    if (paymentError) {
      console.error("Payment record error:", paymentError);
      return new Response(
        JSON.stringify({ success: false, error: "결제 기록 저장 실패" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert subscription record
    const { error: subError } = await supabaseAdmin.from("subscriptions").insert({
      user_id: user.id,
      plan_type: planType,
      billing_key: customerUid,
      status: "active",
      expires_at: expiresAt.toISOString(),
    });

    if (subError) {
      console.error("Subscription record error:", subError);
      // Non-fatal, continue
    }

    // Record coupon usage if applicable
    if (validCouponCode) {
      await supabaseAdmin.from("coupon_uses").insert({
        coupon_code: validCouponCode,
        user_id: user.id,
      });

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

    // Update user profile with billing info
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        user_id: user.id,
        email: user.email,
        plan_type: planType,
        credits: creditsToAdd,
        billing_key: customerUid,
        plan_expires_at: expiresAt.toISOString(),
        auto_renew: true,
      }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    console.log("[register-billing] Success! User:", user.id, "Plan:", planType, "Expires:", expiresAt);

    return new Response(
      JSON.stringify({
        success: true,
        planType,
        creditsAdded: creditsToAdd,
        amountPaid: finalPrice,
        expiresAt: expiresAt.toISOString(),
        isSubscription: planType === "monthly",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[register-billing] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
