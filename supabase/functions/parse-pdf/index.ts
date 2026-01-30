import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath, fileName, bucket } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "filePath is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default to project_files bucket if not specified
    const storageBucket = bucket || "project_files";
    console.log("[parse-pdf] Processing file:", fileName, "path:", filePath, "bucket:", storageBucket);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(storageBucket)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("[parse-pdf] Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[parse-pdf] File downloaded, size:", fileData.size, "bytes");

    // Use Lovable AI for PDF text extraction
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert PDF to base64 using Deno's standard library (handles large files properly)
    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = base64Encode(arrayBuffer);

    console.log("[parse-pdf] Base64 encoded, length:", base64Data.length);
    console.log("[parse-pdf] Sending to Lovable AI for extraction...");

    // Use Lovable AI to extract text from PDF using image_url format with data URL
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64Data}`,
                },
              },
              {
                type: "text",
                text: "이 PDF 문서의 모든 텍스트 내용을 추출해주세요. 원본 형식과 구조를 최대한 유지하면서 텍스트만 출력해주세요. 추가 설명이나 주석 없이 문서 내용만 출력해주세요.",
              },
            ],
          },
        ],
        max_tokens: 16000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[parse-pdf] AI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "AI extraction failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await aiResponse.json();
    const extractedText = aiResult.choices?.[0]?.message?.content || "";

    console.log("[parse-pdf] Extracted text length:", extractedText.length);

    if (extractedText.length < 10) {
      return new Response(
        JSON.stringify({ 
          text: `[이 PDF는 이미지 기반이거나 보호된 문서로, 텍스트 추출이 제한됩니다. 파일명: ${fileName}]`,
          warning: "limited_extraction"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ text: extractedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[parse-pdf] Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
