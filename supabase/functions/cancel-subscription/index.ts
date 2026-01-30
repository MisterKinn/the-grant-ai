import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
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
      return new Response(
        JSON.stringify({ success: false, error: "인증에 실패했습니다." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[cancel-subscription] User:", user.id);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's profile with billing info
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("billing_key, plan_type, plan_expires_at")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: "프로필을 찾을 수 없습니다." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.billing_key) {
      return new Response(
        JSON.stringify({ success: false, error: "활성화된 구독이 없습니다." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get PortOne access token to delete billing key
    if (PORTONE_REST_API_KEY && PORTONE_REST_API_SECRET) {
      try {
        const tokenResponse = await fetch("https://api.iamport.kr/users/getToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imp_key: PORTONE_REST_API_KEY,
            imp_secret: PORTONE_REST_API_SECRET,
          }),
        });

        const tokenData = await tokenResponse.json();
        if (tokenData.code === 0) {
          const accessToken = tokenData.response.access_token;

          // Delete billing key from PortOne
          const deleteResponse = await fetch(`https://api.iamport.kr/subscribe/customers/${profile.billing_key}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          const deleteData = await deleteResponse.json();
          console.log("[cancel-subscription] Billing key deletion:", deleteData.code === 0 ? "success" : "failed");
        }
      } catch (err) {
        console.error("[cancel-subscription] Error deleting billing key:", err);
        // Continue anyway - we'll still update our database
      }
    }

    // Update subscription status
    await supabaseAdmin
      .from("subscriptions")
      .update({ 
        status: "cancelled",
        cancelled_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("status", "active");

    // Update profile - disable auto_renew but keep current access until expiration
    await supabaseAdmin
      .from("profiles")
      .update({
        auto_renew: false,
        billing_key: null, // Remove billing key
      })
      .eq("user_id", user.id);

    console.log("[cancel-subscription] Subscription cancelled for:", user.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "구독이 취소되었습니다. 현재 이용 기간이 끝날 때까지 계속 이용하실 수 있습니다.",
        expiresAt: profile.plan_expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[cancel-subscription] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
