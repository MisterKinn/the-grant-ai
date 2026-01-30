import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument, GlobalWorkerOptions } from "https://esm.sh/pdfjs-dist@4.0.379/build/pdf.mjs";

// [파일 경로 설정]
import { SYSTEM_PROMPT_PRE_STARTUP, USER_PROMPT_TEMPLATE_PRE_STARTUP } from "./prompts/systemPrompt_PreStartup.ts";
// import { SYSTEM_PROMPT_YOUTH_ACADEMY, USER_PROMPT_TEMPLATE_YOUTH_ACADEMY } from "./prompts/systemPrompt_YouthAcademy.ts";
import { SYSTEM_PROMPT_EARLY_STARTUP, USER_PROMPT_TEMPLATE_EARLY_STARTUP } from "./prompts/systemPrompt_EarlyStartup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ★ 방금 생성하신 버킷 이름
const BUCKET_NAME = "project_files";

type GrantType = "PRE_STARTUP" | "YOUTH_ACADEMY" | "EARLY_STARTUP";

function getSystemPrompt(grantType: GrantType): string {
  switch (grantType) {
    case "EARLY_STARTUP":
      return SYSTEM_PROMPT_EARLY_STARTUP;
    case "YOUTH_ACADEMY":
    case "PRE_STARTUP":
    default:
      return SYSTEM_PROMPT_PRE_STARTUP;
  }
}

function getUserPromptTemplate(grantType: GrantType): string {
  switch (grantType) {
    case "EARLY_STARTUP":
      return USER_PROMPT_TEMPLATE_EARLY_STARTUP;
    case "YOUTH_ACADEMY":
    case "PRE_STARTUP":
    default:
      return USER_PROMPT_TEMPLATE_PRE_STARTUP;
  }
}

async function deductCredit(userId: string, supabaseUrl: string, serviceRoleKey: string) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, plan_type")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return { success: true };

  const isFree = !profile.plan_type || profile.plan_type === "free";
  if (!isFree) {
    await supabase
      .from("profiles")
      .update({ credits: (profile.credits || 0) - 1 })
      .eq("user_id", userId);
  }
  return { success: true };
}

// [핵심] PDF 텍스트 추출 함수 (pdfjs-dist 사용)
async function extractPdfText(supabaseUrl: string, serviceRoleKey: string, filePath: string): Promise<string> {
  try {
    console.log(`[PDF 파싱 시작] 경로: ${filePath} / 버킷: ${BUCKET_NAME}`);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. 파일 다운로드
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_NAME).download(filePath);

    if (error) {
      console.error(`[PDF 다운로드 실패] ${error.message}`);
      return "";
    }

    // 2. ArrayBuffer로 변환
    const arrayBuffer = await data.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 3. pdfjs-dist로 텍스트 추출
    GlobalWorkerOptions.workerSrc = "";
    const pdfDoc = await getDocument({ data: uint8Array }).promise;
    
    let fullText = "";
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      // deno-lint-ignore no-explicit-any
      const pageText = textContent.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str || "")
        .join(" ");
      fullText += pageText + "\n";
    }

    const text = fullText.trim();
    console.log(`[PDF 파싱 성공] 추출된 글자 수: ${text.length}자`);

    return text;
  } catch (error) {
    console.error(`[PDF 처리 오류]`, error);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("Key missing");

    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Auth failed" }), { status: 401, headers: corsHeaders });

    const {
      businessIdea,
      problemDescription,
      targetCustomer,
      solution,
      teamInfo,
      grantType = "PRE_STARTUP",
      uploadedFilePath,
      uploadedFileName,
    } = await req.json();

    await deductCredit(user.id, SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const systemPrompt = getSystemPrompt(grantType as GrantType);
    const userPromptTemplate = getUserPromptTemplate(grantType as GrantType);

    // 1. 기본 입력 내용 매핑
    let userPrompt = userPromptTemplate
      .replace("{{businessIdea}}", businessIdea || "")
      .replace("{{problemDescription}}", problemDescription || "")
      .replace("{{targetCustomer}}", targetCustomer || "")
      .replace("{{solution}}", solution || "")
      .replace("{{teamInfo}}", teamInfo || "");

    // 2. PDF 내용 주입 (강력한 제어 프롬프트 적용)
    if (uploadedFilePath) {
      const pdfText = await extractPdfText(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, uploadedFilePath);

      if (pdfText && pdfText.length > 20) {
        userPrompt += `
        
================================================================================
[참고 자료: 업로드된 PDF 파일]
사용자가 입력한 내용의 이해를 돕기 위해 PDF 문서를 추가했습니다.

**[작성 지침 - 절대 준수]**
1. **[Master Data]:** 사용자가 직접 입력한 **아이템 설명(${businessIdea})과 팀 정보, 해결 과제**가 이 사업계획서의 **절대적인 기준**입니다.
2. **[Slave Data]:** PDF 내용은 사용자가 입력한 내용에 **살을 붙이는 용도(구체적 수치, 스펙, 연혁 등)**로만 사용하세요.
3. **[충돌 해결]:** 만약 PDF 내용이 입력된 아이템과 전혀 다른 내용(예: 웰니스 코치 예시 파일 등)이라면, **PDF 내용은 과감히 무시**하고 입력된 텍스트만으로 작성하세요.

**[PDF에서 추출된 텍스트]**
${pdfText.substring(0, 30000)} ...
================================================================================
`;
      }
    }

    // AI 호출
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e: unknown) {
    console.error("[서버 에러]", e);
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: corsHeaders });
  }
});
