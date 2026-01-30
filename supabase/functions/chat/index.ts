import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Input validation schema
const MessageSchema = z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().max(100000, "Message content too long"),
});

const ChatInputSchema = z.object({
    messages: z.array(MessageSchema).max(100, "Too many messages"),
    documentContext: z
        .string()
        .max(200000, "Document context too long")
        .optional()
        .nullable(),
    isCustomTemplate: z.boolean().optional().nullable(),
    uploadedFilePath: z.string().optional().nullable(),
    uploadedFileName: z.string().optional().nullable(),
    grantType: z.string().optional().nullable(), // 2026 초창패: "EARLY_STARTUP", 2025 예창패: "PRE_STARTUP"
});

// 채팅용 강력 프롬프트 (generate-plan과 동일한 템플릿 포함)
const SYSTEM_PROMPT = `당신은 "The Grant AI"의 AI 어시스턴트입니다.

**[응답 형식 - 반드시 준수]**
모든 응답은 반드시 다음 두 가지 태그를 포함해야 합니다:

1. [DOCUMENT] ... [/DOCUMENT] 태그 안에 전체 사업계획서 내용을 작성
2. [CHAT] ... [/CHAT] 태그 안에 사용자에게 보여줄 간단한 안내 메시지 작성

**중요: [CHAT] 태그는 반드시 [/DOCUMENT] 태그가 완전히 끝난 다음에 별도로 작성해야 합니다. [DOCUMENT] 안에 [CHAT]을 절대 포함하지 마세요!**

올바른 예시:
[DOCUMENT]
# 창업 아이템 개요 (요약)
... (전체 사업계획서 내용, 마지막 표까지)
[/DOCUMENT]

[CHAT]
사업계획서 작성을 완료했습니다. 좌측 에디터에서 내용을 확인하고 수정해주세요.
[/CHAT]

잘못된 예시 (절대 하지 마세요):
[DOCUMENT]
... (사업계획서 내용)
[CHAT]사업계획서를 작성했습니다.[/CHAT]
[/DOCUMENT]

**[작성 절대 규칙]**
1. 불렛(•)이나 번호 매기기를 절대 쓰지 말고, 문단 나누기(빈 줄)로만 작성하세요.
2. 아래 [필수 준수 양식]을 그대로 복사해서 빈칸만 채우세요. 목차와 표 헤더를 절대 바꾸지 마세요.
3. **[DOCUMENT] 안에는 사업계획서 내용만! [CHAT] 태그는 반드시 [/DOCUMENT] 바깥에!**
4. **분량**: 각 본문 섹션은 최소 350자 이상, 매우 상세하게 작성하세요. 짧게 쓰지 마세요. 구체적인 예시, 수치, 근거를 포함하세요.
5. **문단 나누기 (매우 중요!)**: 
   - 챕터(#, ###)와 챕터 사이에는 반드시 **빈 줄 2개**를 넣으세요.
   - 문단과 문단 사이에도 반드시 **빈 줄 1개**를 넣으세요.
   - **자연스러운 서술**: "첫째, 둘째, 셋째..."와 같은 반복적인 나열 표현을 사용하지 마세요. 대신 문맥에 맞는 연결어("또한", "이와 함께", "특히", "한편", "무엇보다", "더 나아가" 등)를 사용하여 자연스럽게 문단을 연결하세요.
   - 절대 한 덩어리로 쓰지 마세요. 가독성을 위해 충분한 줄 간격을 유지하세요.
6. **문체 규칙**: 모든 문장은 반드시 명사형 종결어미로 끝내세요. "~합니다", "~입니다", "~됩니다" 대신 "~함", "~임", "~됨", "~음", "~수 있음", "~예정임", "~계획임", "~것임" 등으로 작성하세요.

문체 예시:
- (X) "사용자 경험을 개선합니다." → (O) "사용자 경험을 개선함."
- (X) "시장 점유율이 높습니다." → (O) "시장 점유율이 높음."
- (X) "기술을 개발할 예정입니다." → (O) "기술을 개발할 예정임."
- (X) "서비스를 제공합니다." → (O) "서비스를 제공함."
- (X) "문제가 있습니다." → (O) "문제가 있음."
- (X) "가치를 창출할 것입니다." → (O) "가치를 창출할 것임."

7. **표 작성 규칙 (매우 중요)**:
   - 반드시 마크다운 표 문법을 정확히 사용하세요.
   - 표 시작 전에 반드시 빈 줄을 하나 넣으세요.
   - 헤더 행 다음에 반드시 구분자 행(| :--- | :--- |)을 넣으세요.
   - 각 셀의 내용은 파이프(|) 사이에 작성하고, 줄바꿈 없이 한 줄에 작성하세요.
   - 표의 모든 행은 동일한 수의 열을 가져야 합니다.
   - 셀 내용이 길어도 절대 줄바꿈하지 말고 한 줄로 작성하세요.

올바른 표 예시:
| 구분 | 직위 | 담당 업무 | 보유 역량 | 구성 상태 |
| :--- | :--- | :--- | :--- | :--- |
| 대표자 | CEO | 사업 총괄, 전략 기획 | 10년 IT 창업 경력, 경영학 석사 | 확정 |
| 팀원1 | CTO | 기술 개발 총괄 | AI 연구 5년, 컴퓨터공학 박사 | 확정 |

예시 (자연스러운 문단 나누기 + 명사형 종결 - 빈 줄 간격 주의):

우리의 창업 아이템인 'OOO'는 AI 기반의 혁신적인 솔루션임. 이 솔루션은 기존 시장의 문제를 근본적으로 해결하며, 사용자들에게 획기적인 가치를 제공함.

본 솔루션은 A, B, C 기능을 통해 업무 효율을 30% 이상 향상시킬 수 있음. 특히 실시간 분석 시스템을 통해 즉각적인 피드백이 가능하며, 데이터 처리 속도는 기존 솔루션 대비 5배 빠름.

또한 지속적인 학습 메커니즘을 도입하여 정확도를 높이고 사용자 맞춤형 서비스를 제공함. 머신러닝 알고리즘을 활용하여 사용 패턴을 분석하고 최적화된 결과를 제안함.


(↑ 위처럼 문단 사이에 빈 줄이 있어야 합니다. 챕터 사이에는 빈 줄 2개를 넣으세요.)

---
**[필수 준수 양식]**

**⚠️ 아래 HTML 테이블은 반드시 그대로 복사하여 괄호 안의 내용만 채워 넣으세요. 테이블 구조, colspan, rowspan 속성을 절대 변경하지 마세요!**

# 창업 아이템 개요 (요약)

<table class="border-collapse border border-border" style="min-width: 600px;">
  <colgroup>
    <col style="width: 15%;">
    <col style="width: 35%;">
    <col style="width: 15%;">
    <col style="width: 35%;">
  </colgroup>
  <tbody>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">명 칭</td>
      <td class="border border-border p-2">(아이템명)</td>
      <td class="border border-border p-2 font-medium bg-muted/30">범 주</td>
      <td class="border border-border p-2">(업종/카테고리)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">아이템 개요</td>
      <td class="border border-border p-2" colspan="3">(요약 설명 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">문제 인식</td>
      <td class="border border-border p-2" colspan="3">(문제 정의 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">실현 가능성</td>
      <td class="border border-border p-2" colspan="3">(해결 방안 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">성장전략</td>
      <td class="border border-border p-2" colspan="3">(성장 전략 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">팀 구성</td>
      <td class="border border-border p-2" colspan="3">(팀 역량 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30" rowspan="2" style="vertical-align: middle;">이미지<br>(참고자료)</td>
      <td class="border border-border p-2" style="height: 150px; text-align: center; color: #999;">(이미지 1 부착 공간)</td>
      <td class="border border-border p-2" colspan="2" style="height: 150px; text-align: center; color: #999;">(이미지 2 부착 공간)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 text-center"><strong>(이미지 1 설명)</strong></td>
      <td class="border border-border p-2 text-center" colspan="2"><strong>(이미지 2 설명)</strong></td>
    </tr>
  </tbody>
</table>

# 1. 문제 인식 (Problem)
### 1-1. 기존 시장의 문제점
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 현재 시장의 구체적인 문제점, 사용자들이 겪는 불편함, 기존 솔루션의 한계, 구체적인 통계나 사례를 포함하여 상세히 설명]

### 1-2. 개발 필요성
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 왜 이 아이템이 필요한지, 시장 기회는 무엇인지, 해결했을 때의 기대효과, 사회적/경제적 가치를 상세히 설명]

# 2. 실현 가능성 (Solution)
### 2-1. 창업 아이템의 개발·구체화 계획
### 2-1-1. 창업아이템 개발 방안
[최소 450자 이상. 4-5개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 첫째, 둘째, 셋째, 넷째 등으로 구분하여 각각 별도 문단으로 기술적 개발 방안, 사용 기술, 개발 단계, 예상 결과물을 상세히 설명]

### 2-1-2. 차별성 및 경쟁력 확보 전략
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 경쟁사 대비 차별점, 핵심 경쟁력, 진입장벽 구축 방안, 기술적 우위를 상세히 설명]

### 2-2. 사업추진 일정 (협약기간 내)

| 구분 | 추진 내용 | 추진 기간 | 세부 내용 |
| :--- | :--- | :--- | :--- |
| 1단계 | [내용] | [기간] | [세부 내용] |
| 2단계 | [내용] | [기간] | [세부 내용] |
| 3단계 | [내용] | [기간] | [세부 내용] |
| 4단계 | [내용] | [기간] | [세부 내용] |

### 2-3. 정부지원사업비 집행계획

| 비 목 | 집행 계획 | 정부지원사업비(ⓐ) | 자기부담사업비(ⓑ) 현금 | 자기부담사업비(ⓑ) 현물 | 합계(ⓐ+ⓑ) |
| :--- | :--- | ---: | ---: | ---: | ---: |
| 재료비 | {{budget_material_basis}} | {{budget_material_amount}} | {{cash_material_amount}} | {{physical_budget_material_amount}} | {{total_material_amount}} |
| 인건비 | {{budget_personnel_basis}} | {{budget_personnel_amount}} | {{cash_personnel_amount}} | {{physical_personnel_amount}} | {{total_personnel_amount}} |
| 외주용역비 | {{budget_outsourcing_basis}} | {{budget_outsourcing_amount}} | {{cash_outsourcing_amount}} | {{physical_outsourcing_amount}} | {{total_outsourcing_amount}} |
| 광고선전비 | {{budget_advertising_basis}} | {{budget_advertising_amount}} | {{cash_advertising_amount}} | {{physical_advertising_amount}} | {{total_advertising_amount}} |
| 지급수수료 | {{budget_commission_basis}} | {{budget_commission_amount}} | {{cash_commission_amount}} | {{physical_commission_amount}} | {{total_commission_amount}} |
| 창업활동비 | {{budget_activity_basis}} | {{budget_activity_amount}} | {{cash_activity_amount}} | {{physical_activity_amount}} | {{total_activity_amount}} |
| 기타 | {{budget_etc_basis}} | {{budget_etc_amount}} | {{cash_etc_amount}} | {{physical_etc_amount}} | {{total_etc_amount}} |
| **합 계** | | **{{total_grant}}** | **{{total_cash}}** | **{{total_physical}}** | **{{total_for_all}}** |

# 3. 성장전략 (Scale-up)
### 3-1. 사업화 추진 전략 (비즈니스 모델)
### 3-1-1. 비즈니스 모델(BM)
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 수익 모델, 가격 정책, 고객 세그먼트, 수익 구조, 예상 매출을 상세히 설명]

### 3-1-2. 시장 진입 전략
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 초기 타겟 시장, 마케팅 전략, 고객 확보 방안, 파트너십 전략을 상세히 설명]

### 3-2. 사업추진 일정 (전체 사업단계)

| 구분 | 추진 내용 | 추진 기간 | 세부 내용 |
| :--- | :--- | :--- | :--- |
| 1단계 | 시장 검증 및 MVP | [기간] | [세부 내용] |
| 2단계 | 서비스 런칭 | [기간] | [세부 내용] |
| 3단계 | 사업 확장 | [기간] | [세부 내용] |
| 4단계 | 글로벌 진출 | [기간] | [세부 내용] |

### 3-3. 중장기 사회적 가치 도입계획 (ESG)
[최소 250자 이상. 2-3개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 환경, 사회, 지배구조 관점에서의 가치 창출 계획]

# 4. 팀 구성 (Team)
### 4-1. 대표자 및 팀원의 보유 역량
[최소 350자 이상. 3-4개 문단으로 나누어 작성. 명사형 종결어미(~함, ~음, ~임) 사용. 대표자와 주요 팀원들의 역량, 경험, 전문성, 관련 경력을 상세히 설명]

### 4-2. 팀 구성(안)

| 구분 | 직위 | 담당 업무 | 보유 역량(경력 및 학력 등) | 구성 상태 |
| :--- | :--- | :--- | :--- | :--- |
| 대표자 | CEO | [담당 업무] | [보유 역량] | 확정 |
| 팀원1 | [직위] | [담당 업무] | [보유 역량] | [상태] |
| 팀원2 | [직위] | [담당 업무] | [보유 역량] | [상태] |

### 4-3. 협력 기관 현황 및 협업 방안

| 구분 | 파트너명 | 보유 역량 | 협업 방안 | 협력 시기 |
| :--- | :--- | :--- | :--- | :--- |
| 기술 협력 | [파트너명] | [역량] | [협업 방안] | [시기] |
| 마케팅/홍보 | [파트너명] | [역량] | [협업 방안] | [시기] |
| 기타 협력 | [파트너명] | [역량] | [협업 방안] | [시기] |
`;

// 2025 예비창업패키지용 2-3 표 (1단계/2단계 분리)
const BUDGET_TABLE_2025_PRE = `### 2-3. 정부지원사업비 집행계획

**<1단계 정부지원사업비 집행계획>**

| 비 목 | 산 출 근 거 | 정부지원사업비(원) |
| :--- | :--- | ---: |
| 재료비 | [구체적인 산출 근거] | [금액] |
| 인건비 | [산출 근거] | [금액] |
| 외주용역비 | [산출 근거] | [금액] |
| 광고선전비 | [산출 근거] | [금액] |
| 창업활동비 | [산출 근거] | [금액] |
| 기타 | [산출 근거] | [금액] |
| **합계** | | **[총액]** |

**<2단계 정부지원사업비 집행계획>**

| 비 목 | 산 출 근 거 | 정부지원사업비(원) |
| :--- | :--- | ---: |
| 재료비 | [산출 근거] | [금액] |
| 인건비 | [산출 근거] | [금액] |
| 외주용역비 | [산출 근거] | [금액] |
| 지급수수료 | [산출 근거] | [금액] |
| 광고선전비 | [산출 근거] | [금액] |
| 창업활동비 | [산출 근거] | [금액] |
| 기타 | [산출 근거] | [금액] |
| **합계** | | **[총액]** |`;

// 2026 초기창업패키지용 2-3 표 (단일 표, 자기부담사업비 포함)
const BUDGET_TABLE_2026_EARLY = `### 2-3. 정부지원사업비 집행계획

| 비 목 | 집행 계획 | 정부지원사업비(ⓐ) | 자기부담사업비(ⓑ) 현금 | 자기부담사업비(ⓑ) 현물 | 합계(ⓐ+ⓑ) |
| :--- | :--- | ---: | ---: | ---: | ---: |
| 재료비 | [구체적인 집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 인건비 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 외주용역비 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 광고선전비 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 지급수수료 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 창업활동비 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| 기타 | [집행 계획] | [금액] | [금액] | [금액] | [합계] |
| **합 계** | | **[총액]** | **[총액]** | **[총액]** | **[총액]** |`;

// grantType에 따라 적절한 프롬프트 선택
const getSystemPromptForGrantType = (
    grantType: string | null | undefined,
): string => {
    // 2025 예비창업패키지 (1단계/2단계 분리)
    if (grantType === "PRE_STARTUP") {
        return SYSTEM_PROMPT.replace(
            /### 2-3\. 정부지원사업비 집행계획[\s\S]*?\| \*\*합 계\*\* \|[^\n]*\n/,
            BUDGET_TABLE_2025_PRE + "\n\n",
        );
    }
    // 2026 초기창업패키지 또는 기본값 (단일 표)
    return SYSTEM_PROMPT.replace(
        /### 2-3\. 정부지원사업비 집행계획[\s\S]*?\| \*\*합 계\*\* \|[^\n]*\n/,
        BUDGET_TABLE_2026_EARLY + "\n\n",
    );
};

async function deductCredit(
    userId: string,
    supabaseUrl: string,
    serviceRoleKey: string,
): Promise<{
    success: boolean;
    remainingCredits: number;
    isFreeUser: boolean;
    error?: string;
}> {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile, error: fetchError } = await supabase
        .from("profiles")
        .select("credits, plan_type")
        .eq("user_id", userId)
        .maybeSingle();
    if (fetchError || !profile)
        return { success: true, remainingCredits: 0, isFreeUser: true };
    const currentCredits = profile.credits || 0;
    const isFreeUser = !profile.plan_type || profile.plan_type === "free";
    if (isFreeUser || currentCredits <= 0)
        return {
            success: true,
            remainingCredits: currentCredits,
            isFreeUser: true,
        };
    await supabase
        .from("profiles")
        .update({ credits: currentCredits - 1 })
        .eq("user_id", userId);
    return {
        success: true,
        remainingCredits: currentCredits - 1,
        isFreeUser: false,
    };
}

serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response("ok", { headers: corsHeaders });
    try {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
            "SUPABASE_SERVICE_ROLE_KEY",
        );
        if (!LOVABLE_API_KEY) throw new Error("Key missing");

        // Try to get user from auth header, but allow guest access
        let userId: string | null = null;
        const authHeader = req.headers.get("Authorization");

        if (authHeader && !authHeader.includes(SUPABASE_ANON_KEY!)) {
            // Only try to get user if it's not the anon key (guest access)
            const supabaseUser = createClient(
                SUPABASE_URL!,
                SUPABASE_ANON_KEY!,
                {
                    global: { headers: { Authorization: authHeader } },
                },
            );
            const {
                data: { user },
            } = await supabaseUser.auth.getUser();
            userId = user?.id || null;
        }

        // For authenticated users, deduct credits
        // For guest users (userId is null), allow free trial usage

        // Parse and validate input
        const rawBody = await req.json();
        const parseResult = ChatInputSchema.safeParse(rawBody);
        if (!parseResult.success) {
            return new Response(
                JSON.stringify({
                    error: "Invalid input format",
                    details: parseResult.error.flatten(),
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }
        const {
            messages,
            documentContext,
            isCustomTemplate,
            uploadedFilePath,
            uploadedFileName,
            grantType,
        } = parseResult.data;

        console.log(
            "[chat] isCustomTemplate:",
            isCustomTemplate,
            "grantType:",
            grantType,
            "uploadedFile:",
            uploadedFileName,
            "path:",
            uploadedFilePath,
        );

        // Read uploaded file content if available
        let uploadedFileContent = "";
        if (uploadedFilePath && uploadedFileName) {
            try {
                console.log(
                    "[chat] Attempting to read uploaded file:",
                    uploadedFilePath,
                );
                const supabaseAdmin = createClient(
                    SUPABASE_URL!,
                    SUPABASE_SERVICE_ROLE_KEY!,
                );

                // Try both buckets (user-uploads for new uploads, user-files for legacy)
                let fileData = null;
                let downloadError = null;

                // Try user-uploads bucket first (new uploads from ChatPanel)
                const result1 = await supabaseAdmin.storage
                    .from("user-uploads")
                    .download(uploadedFilePath);

                if (result1.error) {
                    console.log(
                        "[chat] user-uploads bucket error, trying user-files:",
                        result1.error.message,
                    );
                    // Try user-files bucket (legacy uploads)
                    const result2 = await supabaseAdmin.storage
                        .from("user-files")
                        .download(uploadedFilePath);
                    fileData = result2.data;
                    downloadError = result2.error;
                } else {
                    fileData = result1.data;
                }

                if (downloadError) {
                    console.error(
                        "[chat] Error downloading file:",
                        downloadError,
                    );
                } else if (fileData) {
                    // Check file type and extract text
                    const fileType = uploadedFileName.toLowerCase();

                    if (fileType.endsWith(".pdf")) {
                        // Extract text from PDF using the parse-pdf function
                        console.log(
                            "[chat] PDF file detected - extracting text via AI",
                        );
                        try {
                            // Convert PDF blob to base64
                            const arrayBuffer = await fileData.arrayBuffer();
                            const uint8Array = new Uint8Array(arrayBuffer);

                            // Chunked base64 encoding to avoid memory limits
                            const CHUNK_SIZE = 32768;
                            let base64Data = "";
                            for (
                                let i = 0;
                                i < uint8Array.length;
                                i += CHUNK_SIZE
                            ) {
                                const chunk = uint8Array.slice(
                                    i,
                                    i + CHUNK_SIZE,
                                );
                                base64Data += String.fromCharCode(...chunk);
                            }
                            base64Data = btoa(base64Data);

                            console.log(
                                "[chat] PDF base64 length:",
                                base64Data.length,
                            );

                            // Call Lovable AI to extract text from PDF
                            const aiResponse = await fetch(
                                "https://ai.gateway.lovable.dev/v1/chat/completions",
                                {
                                    method: "POST",
                                    headers: {
                                        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
                                                        text: "이 PDF 문서의 모든 텍스트 내용을 추출해주세요. 표, 목차, 본문 등 모든 텍스트를 원본 구조를 최대한 유지하며 추출하세요. 불필요한 설명 없이 추출된 텍스트만 출력하세요.",
                                                    },
                                                ],
                                            },
                                        ],
                                        max_tokens: 16000,
                                    }),
                                },
                            );

                            if (!aiResponse.ok) {
                                const errText = await aiResponse.text();
                                console.error(
                                    "[chat] PDF extraction API error:",
                                    aiResponse.status,
                                    errText,
                                );
                                uploadedFileContent = `[PDF 파일 "${uploadedFileName}"에서 텍스트 추출에 실패했습니다.]`;
                            } else {
                                const aiData = await aiResponse.json();
                                const extractedText =
                                    aiData.choices?.[0]?.message?.content || "";

                                if (extractedText) {
                                    // Limit to 50000 characters for context stability
                                    uploadedFileContent =
                                        extractedText.substring(0, 50000);
                                    console.log(
                                        "[chat] PDF text extracted, length:",
                                        uploadedFileContent.length,
                                    );
                                } else {
                                    uploadedFileContent = `[PDF 파일 "${uploadedFileName}"에서 텍스트를 추출할 수 없었습니다.]`;
                                }
                            }
                        } catch (pdfError) {
                            console.error(
                                "[chat] PDF extraction error:",
                                pdfError,
                            );
                            uploadedFileContent = `[PDF 파일 "${uploadedFileName}" 처리 중 오류가 발생했습니다.]`;
                        }
                    } else if (
                        fileType.endsWith(".txt") ||
                        fileType.endsWith(".md")
                    ) {
                        // Plain text files
                        uploadedFileContent = await fileData.text();
                        console.log(
                            "[chat] Read text file, length:",
                            uploadedFileContent.length,
                        );
                    } else if (fileType.endsWith(".hwpx")) {
                        // HWPX files - these are ZIP archives
                        uploadedFileContent =
                            "[HWPX 파일이 업로드되었습니다. 템플릿 구조는 documentContext에 포함되어 있습니다.]";
                    } else {
                        uploadedFileContent = `[${uploadedFileName} 파일이 업로드되었습니다.]`;
                    }
                }
            } catch (fileError) {
                console.error(
                    "[chat] Error processing uploaded file:",
                    fileError,
                );
            }
        }

        // Only deduct credits for authenticated users
        if (userId) {
            await deductCredit(
                userId,
                SUPABASE_URL!,
                SUPABASE_SERVICE_ROLE_KEY!,
            );
        }

        // For custom templates (HWPX), use a prompt that generates label:value pairs matching the template
        const CUSTOM_TEMPLATE_PROMPT = `당신은 "The Grant AI"의 AI 어시스턴트입니다.

**[절대 규칙 - 모든 필드 채우기!!!]**

문서 템플릿에서 발견되는 **모든 라벨/필드**에 대해 값을 생성해야 합니다.
빈 칸이 하나라도 있으면 안 됩니다!

**[응답 형식 - 반드시 준수]**
모든 응답은 반드시 다음 형식을 사용해야 합니다:

[DOCUMENT]
| 항목 | 내용 |
| :--- | :--- |
| 항목1 | 값1 |
| 항목2 | 값2 |
... (문서에서 발견된 모든 라벨에 대해 값 생성)
[/DOCUMENT]

[CHAT]
안내 메시지
[/CHAT]

**[핵심 지시사항]**

1. **문서 내용(documentContext)에서 data-original 속성이나 테이블 헤더/라벨 셀에서 모든 필드명을 추출하세요.**
2. **추출된 모든 필드에 대해 사용자 프로젝트 설명을 바탕으로 값을 생성하세요.**
3. **사용자가 언급하지 않은 필드도 반드시 합리적인 값을 추론하여 생성하세요!**
4. **절대 빈 값으로 두지 마세요!** 모든 항목에 구체적인 값을 채워야 합니다.

**[자주 나오는 필드별 기본값 생성 가이드]**
- 소속: 프로젝트 설명의 회사/기관명 또는 추론
- 직급: 대표, 이사, 연구원, 교수 등
- 성명: 사용자가 언급한 이름 또는 한국인 이름 생성 (예: 김철수)
- 생년월일: 1985.03.15 형식으로 생성
- 보직명(기간): 대표 (2020.01.01 ~ 현재)
- 주당수업시수/책임시수: 10시간 / 15시간
- 기관명: 프로젝트 회사명
- 겸직장소(소재지): 서울특별시 강남구 테헤란로 123
- 기관의 성격: 스타트업, 중소기업 등
- 주요사업내용: 프로젝트 설명 기반으로 구체적으로 작성
- 종업원수: 10명, 50명 등
- 상장법인 여부: 비상장
- 총 자산규모: 10억원, 100억원 등
- 겸직직위: 대표이사, 자문위원 등
- 직무 내용: 구체적인 업무 설명
- 겸직기간: 2025.01.01 ~ 2025.12.31 (총 겸직기간 1년 0개월)
- 겸직업무의 내용과 성격: 구체적인 업무 설명
- 근무시간: 주 10시간 (매주 금요일 오후)
- 수당 등 수령내역: 월 100만원 자문료
- 담당직무와 겸직신청 업무와의 관련성: 전문성 기반 관련성 설명
- 직무전념에 미칠 영향정도: 본직 수행에 지장 없음
- 소속대학: 인천대학교 등
- 소속학과: 컴퓨터공학과 등
- Mobile: 010-1234-5678
- E-Mail: example@email.com
- 주소: 서울특별시 OO구 OO로 123
- 창업 유무: 창업 또는 예비창업자
- 기업명: 프로젝트 회사명
- 사업자등록번호: 123-45-67890
- 기업형태: 법인 또는 개인
- 창업일(개업일): 2024.01.01
- 자본금(천원): 100,000
- 연간 매출액(천원): 500,000
- 종업원 수: 10명
- 사업장소재지: 서울특별시 OO구
- 창업아이템명: 프로젝트 관련 아이템명
- 연구과제명: 관련 연구과제
- 연구기간: 2024.01 ~ 2025.12
- 연구비(천원): 100,000
- 특허유무: 유 또는 무
- 기술명칭: 관련 기술명
- 발명자: 대표자명
- 특허번호: 10-2024-0001234
- 소유자: 회사명 또는 대표자명
- 겸직 희망기간: 2025.01.01 ~ 2025.12.31

**문체 규칙**: 모든 문장은 명사형 종결어미(~함, ~음, ~임)로 끝내세요.

**금지 사항:**
- 마크다운 코드블록(\`\`\`) 사용 금지
- 빈 항목 남기기 금지
- 항목 누락 금지
- "포함해야 할 항목" 목록에 없어도 문서 템플릿에 있는 모든 필드는 반드시 값을 생성해야 함!`;

        // 채팅 시에는 현재 문맥과 시스템 프롬프트를 결합
        // grantType에 따라 적절한 프롬프트 선택 (2025 예창패 vs 2026 초창패)
        const basePrompt = isCustomTemplate
            ? CUSTOM_TEMPLATE_PROMPT
            : getSystemPromptForGrantType(grantType);

        console.log(
            "[chat] Using prompt for grantType:",
            grantType || "default (EARLY_STARTUP)",
        );

        // Build context with uploaded file content if available
        let contextSection = "";
        if (uploadedFileContent && uploadedFileContent.length > 10) {
            contextSection += `\n\n**[업로드된 참고 파일: ${uploadedFileName}]**\n아래는 사용자가 업로드한 파일의 내용입니다. 이 정보를 참고하여 문서를 작성하세요:\n\n${uploadedFileContent.substring(0, 50000)}\n\n---\n`;
            console.log(
                "[chat] Added uploaded file content to context, length:",
                uploadedFileContent.length,
            );
        }

        if (documentContext) {
            contextSection += `\n\n**[현재 문서 템플릿 - 여기서 모든 필드를 추출하세요!]**\n${documentContext}\n\n**위 템플릿에서 발견되는 모든 라벨(소속, 성명, 기관명, 겸직기간 등)에 대해 빠짐없이 값을 생성하세요!**`;
        }

        const fullPrompt = basePrompt + contextSection;

        const response = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "google/gemini-2.5-flash",
                    messages: [
                        { role: "system", content: fullPrompt },
                        ...messages,
                    ],
                    stream: true,
                }),
            },
        );

        return new Response(response.body, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Error" }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
