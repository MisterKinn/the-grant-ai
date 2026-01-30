import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PORTONE_REST_API_KEY = Deno.env.get("PORTONE_REST_API_KEY");
    const PORTONE_REST_API_SECRET = Deno.env.get("PORTONE_REST_API_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PORTONE_REST_API_KEY || !PORTONE_REST_API_SECRET) {
      console.error("Missing configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find expired subscriptions that need renewal
    const now = new Date().toISOString();
    
    const { data: expiredProfiles, error: queryError } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email, plan_type, billing_key, credits, plan_expires_at, auto_renew")
      .not("billing_key", "is", null)
      .eq("auto_renew", true)
      .lt("plan_expires_at", now)
      .in("plan_type", ["monthly", "season"]);

    if (queryError) {
      console.error("Query error:", queryError);
      return new Response(
        JSON.stringify({ success: false, error: "Database query error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[renewal] Found ${expiredProfiles?.length || 0} expired subscriptions`);

    if (!expiredProfiles || expiredProfiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No subscriptions to renew", renewed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        JSON.stringify({ success: false, error: "Payment system error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = tokenData.response.access_token;

    const results = {
      renewed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each expired subscription
    for (const profile of expiredProfiles) {
      try {
        console.log(`[renewal] Processing user: ${profile.user_id}, plan: ${profile.plan_type}`);

        const planConfig = PLAN_CONFIG[profile.plan_type as keyof typeof PLAN_CONFIG];
        if (!planConfig) {
          console.error(`Unknown plan type: ${profile.plan_type}`);
          results.errors.push(`Unknown plan: ${profile.plan_type}`);
          results.failed++;
          continue;
        }

        const merchantUid = `renewal_${profile.user_id}_${Date.now()}`;

        // Make payment via billing key
        const paymentResponse = await fetch("https://api.iamport.kr/subscribe/payments/again", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            customer_uid: profile.billing_key,
            merchant_uid: merchantUid,
            amount: planConfig.price,
            name: `The Grant AI ${profile.plan_type === 'monthly' ? '월간 패스' : '시즌 패스'} 갱신`,
          }),
        });

        const paymentData = await paymentResponse.json();
        console.log(`[renewal] Payment response for ${profile.user_id}:`, paymentData.code, paymentData.response?.status);

        if (paymentData.code !== 0 || paymentData.response?.status !== "paid") {
          console.error(`Payment failed for ${profile.user_id}:`, paymentData);
          
          // Update subscription status to payment_failed
          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "payment_failed" })
            .eq("user_id", profile.user_id)
            .eq("status", "active");

          // Set auto_renew to false to prevent repeated failures
          await supabaseAdmin
            .from("profiles")
            .update({ auto_renew: false })
            .eq("user_id", profile.user_id);

          results.errors.push(`Payment failed for ${profile.email}: ${paymentData.message}`);
          results.failed++;
          continue;
        }

        const impUid = paymentData.response.imp_uid;

        // Calculate new expiration date
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + planConfig.durationDays);

        // Insert payment record
        await supabaseAdmin.from("payments").insert({
          user_id: profile.user_id,
          imp_uid: impUid,
          merchant_uid: merchantUid,
          amount: planConfig.price,
          plan_type: profile.plan_type,
          status: "paid",
          payment_method: "billing_renewal",
          credits_added: planConfig.credits,
        });

        // Insert new subscription record
        await supabaseAdmin.from("subscriptions").insert({
          user_id: profile.user_id,
          plan_type: profile.plan_type,
          billing_key: profile.billing_key,
          status: "active",
          expires_at: newExpiresAt.toISOString(),
        });

        // Update profile with new credits and expiration
        await supabaseAdmin
          .from("profiles")
          .update({
            credits: (profile.credits || 0) + planConfig.credits,
            plan_expires_at: newExpiresAt.toISOString(),
          })
          .eq("user_id", profile.user_id);

        console.log(`[renewal] Successfully renewed for ${profile.user_id}, new expires: ${newExpiresAt}`);
        results.renewed++;

      } catch (err) {
        console.error(`[renewal] Error processing ${profile.user_id}:`, err);
        results.errors.push(`Error for ${profile.email}: ${err instanceof Error ? err.message : "Unknown"}`);
        results.failed++;
      }
    }

    console.log(`[renewal] Complete. Renewed: ${results.renewed}, Failed: ${results.failed}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${expiredProfiles.length} subscriptions`,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[renewal] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
