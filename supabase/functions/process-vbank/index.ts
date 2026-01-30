import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 플랜 설정
const PLAN_CONFIG: Record<string, { price: number; credits: number; name: string }> = {
  monthly: { price: 33000, credits: 300, name: "월간 패스" },
  season: { price: 198000, credits: 3600, name: "시즌 패스" },
};

// Input validation schema
const VbankInputSchema = z.object({
  planType: z.enum(["monthly", "season"]),
  couponCode: z.string().max(50).regex(/^[A-Za-z0-9_-]*$/).optional().nullable(),
  impUid: z.string().min(1).max(100),
  merchantUid: z.string().min(1).max(100),
  vbankName: z.string().min(1).max(100),
  vbankNum: z.string().min(1).max(50),
  vbankHolder: z.string().min(1).max(100),
  vbankDate: z.number().optional().nullable(),
});

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "이메일 서비스가 설정되지 않았습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    // 사용자 인증 확인
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "인증이 필요합니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // 토큰에서 사용자 정보 가져오기
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "인증에 실패했습니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 요청 바디 파싱 및 검증
    const rawBody = await req.json();
    const parseResult = VbankInputSchema.safeParse(rawBody);
    
    if (!parseResult.success) {
      console.error("[Vbank] Validation error:", parseResult.error.flatten());
      return new Response(
        JSON.stringify({ success: false, error: "유효하지 않은 입력입니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { 
      planType, 
      couponCode, 
      impUid, 
      merchantUid, 
      vbankName, 
      vbankNum, 
      vbankHolder, 
      vbankDate 
    } = parseResult.data;
    
    console.log(`[Vbank] User: ${user.id}, Plan: ${planType}, ImpUid: ${impUid}`);
    console.log(`[Vbank] Bank: ${vbankName}, Account: ${vbankNum}, Holder: ${vbankHolder}`);

    // 플랜 유효성 검사 (이미 스키마에서 검증되지만 타입 안전성을 위해 유지)
    const plan = PLAN_CONFIG[planType];

    // 쿠폰 적용 시 할인 계산
    let finalPrice = plan.price;
    let discountValue = 0;

    if (couponCode) {
      const { data: coupon, error: couponError } = await supabaseAuth
        .from("coupons")
        .select("*")
        .eq("code", couponCode)
        .eq("is_active", true)
        .single();

      if (!couponError && coupon) {
        // 만료 확인
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          console.log(`[Vbank] Coupon expired: ${couponCode}`);
        } else if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
          console.log(`[Vbank] Coupon max uses reached: ${couponCode}`);
        } else {
          // 이미 사용한 쿠폰인지 확인
          const { data: existingUse } = await supabaseAuth
            .from("coupon_uses")
            .select("id")
            .eq("user_id", user.id)
            .eq("coupon_code", couponCode)
            .maybeSingle();

          if (!existingUse) {
            discountValue = coupon.discount_value;
            finalPrice = Math.round(plan.price * (1 - discountValue / 100));
            console.log(`[Vbank] Coupon applied: ${discountValue}% off, Final: ${finalPrice}`);
          }
        }
      }
    }

    // 입금 기한 포맷팅
    const vbankDueDate = vbankDate 
      ? new Date(vbankDate * 1000).toLocaleString("ko-KR", { 
          year: "numeric", 
          month: "long", 
          day: "numeric", 
          hour: "2-digit", 
          minute: "2-digit" 
        })
      : "7일 이내";

    // 중복 결제 확인
    const { data: existingPayment } = await supabaseAuth
      .from("payments")
      .select("id")
      .eq("imp_uid", impUid)
      .maybeSingle();

    if (existingPayment) {
      console.log("[Vbank] Duplicate payment detected:", impUid);
      return new Response(
        JSON.stringify({ success: true, message: "이미 처리된 결제입니다." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // payments 테이블에 pending_deposit 상태로 저장
    const { error: paymentError } = await supabaseAuth
      .from("payments")
      .insert({
        user_id: user.id,
        imp_uid: impUid,
        merchant_uid: merchantUid,
        amount: finalPrice,
        plan_type: planType,
        credits_added: plan.credits,
        status: "pending_deposit",
        payment_method: "vbank",
      });

    if (paymentError) {
      console.error("Payment insert error:", paymentError);
      return new Response(
        JSON.stringify({ success: false, error: "결제 정보 저장에 실패했습니다." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Vbank] Payment record created: ${merchantUid}`);

    // 쿠폰 사용 기록
    if (couponCode && discountValue > 0) {
      await supabaseAuth.from("coupon_uses").insert({
        user_id: user.id,
        coupon_code: couponCode,
      });

      // current_uses 증가
      const { data: currentCoupon } = await supabaseAuth
        .from("coupons")
        .select("current_uses")
        .eq("code", couponCode)
        .single();
      
      if (currentCoupon) {
        await supabaseAuth
          .from("coupons")
          .update({ current_uses: (currentCoupon.current_uses || 0) + 1 })
          .eq("code", couponCode);
      }

      console.log(`[Vbank] Coupon usage recorded: ${couponCode}`);
    }

    // 이메일 발송
    const userEmail = user.email;
    if (!userEmail) {
      console.error("User email not found");
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "이메일 주소가 없어 안내 메일을 발송하지 못했습니다." 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #D4AF37 0%, #F4E4BC 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
    .header h1 { color: #1a1a1a; margin: 0; font-size: 24px; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px; }
    .account-info { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .account-info p { margin: 8px 0; }
    .highlight { color: #D4AF37; font-weight: bold; }
    .amount { font-size: 24px; color: #1a1a1a; font-weight: bold; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>The Grant - 가상계좌 발급 안내</h1>
    </div>
    <div class="content">
      <p>안녕하세요, <strong>The Grant</strong>입니다.</p>
      <p>가상계좌가 발급되었습니다. 아래 계좌로 입금해 주시면 <span class="highlight">자동으로 이용 권한이 활성화</span>됩니다.</p>
      
      <div class="account-info">
        <p><strong>은행명:</strong> ${vbankName}</p>
        <p><strong>계좌번호:</strong> ${vbankNum}</p>
        <p><strong>예금주:</strong> ${vbankHolder}</p>
        <p><strong>결제금액:</strong> <span class="amount">${finalPrice.toLocaleString()}원</span></p>
        <p><strong>신청 플랜:</strong> ${plan.name}</p>
        <p><strong>입금 기한:</strong> <span class="highlight">${vbankDueDate}</span></p>
      </div>

      <div class="warning">
        <strong>⚠️ 주의사항</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>입금 기한 내에 정확한 금액을 입금해 주세요.</li>
          <li>입금자명이 다를 경우 확인이 어려울 수 있습니다.</li>
          <li>입금 확인 후 자동으로 이용 권한이 부여됩니다.</li>
        </ul>
      </div>

      <p>문의사항이 있으시면 언제든지 연락 주세요.</p>
      
      <div class="footer">
        <p>© 2026 The Grant. All rights reserved.</p>
        <p>본 메일은 발신 전용입니다.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const emailResponse = await resend.emails.send({
        from: "The Grant <contact@thegrant.kr>",
        to: [userEmail],
        subject: "[더그랜트] 가상계좌 발급 안내",
        html: emailHtml,
      });

      console.log("[Vbank] Email sent:", emailResponse);
    } catch (emailError) {
      console.error("[Vbank] Email send error:", emailError);
      // 이메일 실패해도 결제 신청은 성공으로 처리
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: `가상계좌가 발급되었으나 이메일 발송에 실패했습니다. 계좌: ${vbankName} ${vbankNum} (${vbankHolder})` 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Vbank] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "서버 오류가 발생했습니다." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
