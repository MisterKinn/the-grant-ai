import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imp_uid, merchant_uid } = await req.json();
    console.log("[V1 Production] Verifying payment:", { imp_uid, merchant_uid });

    if (!imp_uid) {
      return new Response(
        JSON.stringify({ verified: false, error: "imp_uid is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 포트원 V1 운영 API 키
    const REST_API_KEY = Deno.env.get("PORTONE_REST_API_KEY");
    const REST_API_SECRET = Deno.env.get("PORTONE_REST_API_SECRET");

    if (!REST_API_KEY || !REST_API_SECRET) {
      console.error("Missing API credentials");
      return new Response(
        JSON.stringify({ verified: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. 포트원 액세스 토큰 발급
    const tokenResponse = await fetch("https://api.iamport.kr/users/getToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imp_key: REST_API_KEY,
        imp_secret: REST_API_SECRET,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log("[V1 Production] Token response:", tokenData.code, tokenData.message);

    if (tokenData.code !== 0) {
      return new Response(
        JSON.stringify({ verified: false, error: "Failed to get access token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = tokenData.response.access_token;

    // 2. 결제 정보 조회
    const paymentResponse = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const paymentData = await paymentResponse.json();
    console.log("[V1 Production] Payment data:", paymentData.code, paymentData.response?.status);

    if (paymentData.code !== 0) {
      return new Response(
        JSON.stringify({ verified: false, error: "Failed to get payment info" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payment = paymentData.response;

    // 3. 결제 상태 검증
    // paid: 결제완료, ready: 가상계좌 발급완료
    if (payment.status === "paid" || payment.status === "ready") {
      console.log("[V1 Production] Payment verified successfully:", {
        status: payment.status,
        amount: payment.amount,
        merchant_uid: payment.merchant_uid,
      });

      return new Response(
        JSON.stringify({
          verified: true,
          status: payment.status,
          amount: payment.amount,
          merchant_uid: payment.merchant_uid,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ verified: false, error: `Invalid payment status: ${payment.status}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[V1 Production] Verification error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ verified: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
