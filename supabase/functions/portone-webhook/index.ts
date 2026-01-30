import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 플랜 설정
const PLAN_CONFIG: Record<string, { price: number; credits: number; name: string }> = {
  monthly: { price: 33000, credits: 300, name: "월간 패스" },
  season: { price: 198000, credits: 3600, name: "시즌 패스" },
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[Webhook] Received request");

  try {
    // Webhook secret token verification - header-based for better security
    const PORTONE_WEBHOOK_SECRET = Deno.env.get("PORTONE_WEBHOOK_SECRET");
    
    if (PORTONE_WEBHOOK_SECRET) {
      // Check header first (preferred), then fall back to query param for backwards compatibility
      const headerToken = req.headers.get("X-Webhook-Token");
      const url = new URL(req.url);
      const queryToken = url.searchParams.get("token");
      const token = headerToken || queryToken;
      
      if (!token) {
        console.warn("[Webhook] Missing webhook token");
        return new Response(
          JSON.stringify({ success: false, error: "Missing authentication token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Timing-safe comparison to prevent timing attacks
      const tokenBuffer = new TextEncoder().encode(token);
      const secretBuffer = new TextEncoder().encode(PORTONE_WEBHOOK_SECRET);
      
      if (tokenBuffer.length !== secretBuffer.length) {
        console.warn("[Webhook] Invalid webhook token (length mismatch)");
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      let isValid = true;
      for (let i = 0; i < tokenBuffer.length; i++) {
        if (tokenBuffer[i] !== secretBuffer[i]) {
          isValid = false;
        }
      }
      
      if (!isValid) {
        console.warn("[Webhook] Invalid webhook token");
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.log("[Webhook] Token verified successfully via", headerToken ? "header" : "query param");
    } else {
      console.warn("[Webhook] PORTONE_WEBHOOK_SECRET not configured - webhook authentication disabled");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTONE_REST_API_KEY = Deno.env.get("PORTONE_REST_API_KEY");
    const PORTONE_REST_API_SECRET = Deno.env.get("PORTONE_REST_API_SECRET");

    if (!PORTONE_REST_API_KEY || !PORTONE_REST_API_SECRET) {
      console.error("[Webhook] Missing PortOne configuration");
      return new Response(
        JSON.stringify({ success: false, error: "PortOne configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 요청 바디 파싱
    const body = await req.json();
    console.log("[Webhook] Body:", JSON.stringify(body));

    // PortOne V1 웹훅 형식
    // status: "paid" | "ready" | "cancelled" | "failed" 등
    // imp_uid: 결제 고유 ID
    // merchant_uid: 주문 고유 ID
    const { imp_uid, merchant_uid, status } = body;

    if (!imp_uid || !merchant_uid) {
      console.error("[Webhook] Missing imp_uid or merchant_uid");
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Webhook] imp_uid: ${imp_uid}, merchant_uid: ${merchant_uid}, status: ${status}`);

    // 가상계좌 입금 완료 (vbank_paid)
    if (status === "paid") {
      console.log("[Webhook] Processing paid status");

      // PortOne API로 결제 정보 검증
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
        console.error("[Webhook] Token error:", tokenData);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to get PortOne token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessToken = tokenData.response.access_token;

      // 결제 정보 조회
      const paymentResponse = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const paymentData = await paymentResponse.json();
      if (paymentData.code !== 0) {
        console.error("[Webhook] Payment lookup error:", paymentData);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to verify payment" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payment = paymentData.response;
      console.log("[Webhook] PortOne payment status:", payment.status, "amount:", payment.amount);

      // 실제 결제 상태 확인
      if (payment.status !== "paid") {
        console.log(`[Webhook] Payment not paid yet, status: ${payment.status}`);
        return new Response(
          JSON.stringify({ success: true, message: "Payment not paid yet" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // DB에서 기존 결제 정보 조회
      const { data: existingPayment, error: paymentError } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("imp_uid", imp_uid)
        .maybeSingle();

      if (paymentError) {
        console.error("[Webhook] DB lookup error:", paymentError);
        return new Response(
          JSON.stringify({ success: false, error: "DB lookup failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!existingPayment) {
        console.log("[Webhook] Payment not found in DB for imp_uid:", imp_uid);
        return new Response(
          JSON.stringify({ success: false, error: "Payment not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 이미 처리된 결제인지 확인
      if (existingPayment.status === "paid") {
        console.log("[Webhook] Payment already processed:", imp_uid);
        return new Response(
          JSON.stringify({ success: true, message: "Already processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 금액 검증
      if (existingPayment.amount !== payment.amount) {
        console.error("[Webhook] Amount mismatch! DB:", existingPayment.amount, "PortOne:", payment.amount);
        return new Response(
          JSON.stringify({ success: false, error: "Amount mismatch" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 결제 상태 업데이트
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({ status: "paid" })
        .eq("id", existingPayment.id);

      if (updateError) {
        console.error("[Webhook] Payment status update error:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to update payment status" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[Webhook] Payment status updated to paid");

      // 플랜 정보 가져오기
      const planType = existingPayment.plan_type as keyof typeof PLAN_CONFIG;
      const planConfig = PLAN_CONFIG[planType];
      
      if (!planConfig) {
        console.error("[Webhook] Unknown plan type:", planType);
        return new Response(
          JSON.stringify({ success: false, error: "Unknown plan type" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 프로필 업데이트 (플랜 및 크레딧)
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          plan_type: planType,
          credits: planConfig.credits,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", existingPayment.user_id);

      if (profileError) {
        console.error("[Webhook] Profile update error:", profileError);
        // 결제는 완료되었으므로 에러를 반환하지 않음 (로그만 기록)
      }

      console.log(`[Webhook] Profile updated: user=${existingPayment.user_id}, plan=${planType}, credits=${planConfig.credits}`);

      return new Response(
        JSON.stringify({ success: true, message: "Payment confirmed and profile updated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 기타 상태 (cancelled, failed 등)
    if (status === "cancelled" || status === "failed") {
      console.log(`[Webhook] Payment ${status}:`, imp_uid);

      // 결제 상태 업데이트
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({ status })
        .eq("imp_uid", imp_uid);

      if (updateError) {
        console.error("[Webhook] Status update error:", updateError);
      }

      return new Response(
        JSON.stringify({ success: true, message: `Payment ${status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 알 수 없는 상태
    console.log("[Webhook] Unhandled status:", status);
    return new Response(
      JSON.stringify({ success: true, message: "Unhandled status" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Webhook] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});