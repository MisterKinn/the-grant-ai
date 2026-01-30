import {
    useState,
    useEffect,
    forwardRef,
    useImperativeHandle,
    useRef,
} from "react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// Support field type for checkboxes
type SupportField = "제조" | "지식서비스";

// Tech field type for checkboxes
type TechField =
    | "기계·소재"
    | "전기·전자"
    | "정보·통신"
    | "화공·섬유"
    | "바이오·의료·생명"
    | "에너지·자원"
    | "공예·디자인";

// Region type for checkboxes
type RegionField =
    | "특별지원 지역"
    | "우대지원 지역"
    | "일반지역"
    | "지방우대 비해당 지역";

// Team member status
type TeamStatus = "확정" | "예정" | "";

export interface BusinessInfo {
    // 일반현황 (General Info)
    info_company_name: string;
    info_est_date: string;
    info_reg_number: string;
    info_address: string;
    business_type: "개인사업자" | "법인사업자";
    representative_type: "단독" | "공동" | "각자대표";

    // 창업아이템 정보
    item_name: string;
    target_output: string;
    support_field: SupportField | "";
    tech_field: TechField | "";

    // 사업비 정보 (일반현황 표)
    budget_gov: string;
    budget_self_cash: string;
    budget_self_kind: string;
    budget_total: string;

    // 정부지원사업비 총액 (원 단위 숫자)
    budget_gov_amount: number;

    // 사업비 집행 계획 (비목별)
    budget_material_basis: string;
    budget_material_amount: number;
    budget_personnel_basis: string;
    budget_personnel_amount: number;
    budget_outsourcing_basis: string;
    budget_outsourcing_amount: number;
    budget_advertising_basis: string;
    budget_advertising_amount: number;
    budget_commission_basis: string;
    budget_commission_amount: number;
    budget_activity_basis: string;
    budget_activity_amount: number;
    budget_etc_basis: string;
    budget_etc_amount: number;

    // 지방우대 지역
    region_type: RegionField | "";

    // 팀 구성 현황 (최대 5명)
    team_1_position: string;
    team_1_role: string;
    team_1_competency: string;
    team_1_status: TeamStatus;
    team_2_position: string;
    team_2_role: string;
    team_2_competency: string;
    team_2_status: TeamStatus;
    team_3_position: string;
    team_3_role: string;
    team_3_competency: string;
    team_3_status: TeamStatus;
    team_4_position: string;
    team_4_role: string;
    team_4_competency: string;
    team_4_status: TeamStatus;
    team_5_position: string;
    team_5_role: string;
    team_5_competency: string;
    team_5_status: TeamStatus;
}

export interface BusinessInfoPanelHandle {
    getBusinessInfo: () => BusinessInfo;
    setBusinessInfo: (info: Partial<BusinessInfo>) => void;
    extractFromContent: (content: string) => void;
}

interface BusinessInfoPanelProps {
    className?: string;
    defaultCompanyName?: string;
    editorContent?: string; // Plain text content from editor
    chatContent?: string; // Chat messages content (user input)
    onChange?: (info: BusinessInfo) => void;
}

// Helper function to strip HTML tags
const stripHtml = (html: string): string => {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
};

// Helper function to extract business info from AI-generated content
const extractBusinessInfoFromContent = (
    content: string,
): Partial<BusinessInfo> => {
    const extracted: Partial<BusinessInfo> = {};

    if (!content) return extracted;

    // Strip HTML tags first
    const cleanContent = stripHtml(content);

    // ========== 기업 기본 정보 추출 ==========

    // 기업명/회사명 추출
    const companyPatterns = [
        /기업[명]?\s*[:：]\s*([^\n,]+)/i,
        /회사[명]?\s*[:：]\s*([^\n,]+)/i,
        /상호\s*[:：]\s*([^\n,]+)/i,
        /\(주\)\s*([가-힣A-Za-z0-9]+)/i,
    ];
    for (const pattern of companyPatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            extracted.info_company_name = match[1]
                .trim()
                .replace(/\*+/g, "")
                .substring(0, 50);
            break;
        }
    }

    // 사업자등록번호 추출 (다양한 형식 지원)
    const regNumberPatterns = [
        /사업자\s*등록\s*번호\s*[:：]?\s*([0-9\-]+)/i,
        /사업자번호\s*[:：]?\s*([0-9\-]+)/i,
        /등록번호\s*[:：]?\s*([0-9\-]+)/i,
        /([0-9]{3}-[0-9]{2}-[0-9]{5})/, // 표준 형식
        /([0-9]{4}-[0-9]{4}-[0-9]{4})/, // 대체 형식
    ];
    for (const pattern of regNumberPatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            extracted.info_reg_number = match[1].trim();
            break;
        }
    }

    // 개업연월일/설립일 추출
    const estDatePatterns = [
        /개업\s*연월일\s*[:：]?\s*([0-9]{4}[.\-\/][0-9]{1,2}[.\-\/][0-9]{1,2})/i,
        /설립일\s*[:：]?\s*([0-9]{4}[.\-\/][0-9]{1,2}[.\-\/][0-9]{1,2})/i,
        /창업일\s*[:：]?\s*([0-9]{4}[.\-\/][0-9]{1,2}[.\-\/][0-9]{1,2})/i,
        /설립\s*[:：]?\s*([0-9]{4}[.\-\/][0-9]{1,2}[.\-\/][0-9]{1,2})/i,
        /([0-9]{4}년\s*[0-9]{1,2}월\s*[0-9]{1,2}일)/i,
    ];
    for (const pattern of estDatePatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            extracted.info_est_date = match[1].trim();
            break;
        }
    }

    // 주소/소재지 추출
    const addressPatterns = [
        /소재지\s*[:：]?\s*([^\n]+(?:시|구|동|로|길)[^\n]*)/i,
        /주소\s*[:：]?\s*([^\n]+(?:시|구|동|로|길)[^\n]*)/i,
        /사업장\s*[:：]?\s*([^\n]+(?:시|구|동|로|길)[^\n]*)/i,
        /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\n]*(?:시|구|동|로|길)[^\n]*/i,
    ];
    for (const pattern of addressPatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            extracted.info_address = match[1]
                .trim()
                .replace(/\*+/g, "")
                .substring(0, 100);
            break;
        }
    }

    // ========== 창업아이템 정보 추출 ==========

    // Extract item name from various patterns
    const itemNamePatterns = [
        /창업\s*아이템\s*개요[^:]*[:：]?\s*([^\n]+)/i,
        /창업아이템[명]?\s*[:：]?\s*([^\n,।]{3,50})/i,
        /아이템[명]?\s*[:：]?\s*([^\n,।]{3,50})/i,
        /제품[명]?\s*[:：]?\s*([^\n,।]{3,50})/i,
        /서비스[명]?\s*[:：]?\s*([^\n,।]{3,50})/i,
    ];

    for (const pattern of itemNamePatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            const value = match[1].trim().replace(/\*+/g, "").substring(0, 100);
            if (value.length > 2) {
                extracted.item_name = value;
                break;
            }
        }
    }

    // If no item name, try to infer from title-like patterns
    if (!extracted.item_name) {
        const titlePatterns = [
            /(?:AI|인공지능)\s*기반\s+([^\n.]{5,40})/i,
            /([가-힣A-Za-z0-9\s]+(?:플랫폼|앱|시스템|솔루션|서비스))/i,
        ];
        for (const pattern of titlePatterns) {
            const match = cleanContent.match(pattern);
            if (
                match &&
                match[1] &&
                match[1].length > 3 &&
                match[1].length < 50
            ) {
                extracted.item_name = match[1].trim();
                break;
            }
        }
    }

    // Extract target output (산출물)
    const outputPatterns = [
        /산출물\s*[:：]?\s*([^\n]+)/i,
        /예상\s*산출물\s*[:：]?\s*([^\n]+)/i,
        /목표\s*산출물\s*[:：]?\s*([^\n]+)/i,
        /개발\s*산출물\s*[:：]?\s*([^\n]+)/i,
    ];

    for (const pattern of outputPatterns) {
        const match = cleanContent.match(pattern);
        if (match && match[1]) {
            extracted.target_output = match[1]
                .trim()
                .replace(/\*+/g, "")
                .substring(0, 100);
            break;
        }
    }

    // If no target_output, infer from item name or content
    if (!extracted.target_output && extracted.item_name) {
        extracted.target_output = extracted.item_name;
    } else if (!extracted.target_output) {
        // Look for common output types
        const outputTypes = [
            { keyword: "웹 플랫폼", output: "웹 플랫폼" },
            { keyword: "모바일 앱", output: "모바일 애플리케이션" },
            { keyword: "SaaS", output: "SaaS 플랫폼" },
            { keyword: "플랫폼", output: "플랫폼 서비스" },
            { keyword: "솔루션", output: "솔루션" },
            { keyword: "앱", output: "모바일 애플리케이션" },
            { keyword: "소프트웨어", output: "소프트웨어" },
            { keyword: "SW", output: "소프트웨어" },
            { keyword: "AI", output: "AI 솔루션" },
        ];
        for (const { keyword, output } of outputTypes) {
            if (cleanContent.includes(keyword)) {
                extracted.target_output = output;
                break;
            }
        }
    }

    // Detect support field based on content keywords with scoring
    const manufacturingKw = [
        "제조",
        "생산",
        "하드웨어",
        "장치",
        "설비",
        "부품",
        "기기",
    ];
    const serviceKw = [
        "지식",
        "서비스",
        "플랫폼",
        "소프트웨어",
        "SW",
        "앱",
        "AI",
        "인공지능",
        "데이터",
        "SaaS",
        "웹",
        "클라우드",
    ];

    let mfgScore = 0,
        svcScore = 0;
    for (const kw of manufacturingKw) if (cleanContent.includes(kw)) mfgScore++;
    for (const kw of serviceKw) if (cleanContent.includes(kw)) svcScore++;

    if (mfgScore > svcScore) {
        extracted.support_field = "제조";
    } else {
        extracted.support_field = "지식서비스"; // Default for most IT startups
    }

    // Detect tech field based on content keywords with scoring
    const techKeywordMap: { keywords: string[]; field: TechField }[] = [
        {
            keywords: ["기계", "소재", "금속", "로봇", "자동화"],
            field: "기계·소재",
        },
        {
            keywords: ["전기", "전자", "반도체", "배터리", "센서"],
            field: "전기·전자",
        },
        {
            keywords: [
                "정보",
                "통신",
                "IT",
                "AI",
                "인공지능",
                "빅데이터",
                "클라우드",
                "앱",
                "플랫폼",
                "소프트웨어",
                "SW",
                "웹",
                "SaaS",
                "딥러닝",
            ],
            field: "정보·통신",
        },
        { keywords: ["화공", "화학", "섬유", "고분자"], field: "화공·섬유" },
        {
            keywords: ["바이오", "의료", "생명", "헬스케어", "건강", "제약"],
            field: "바이오·의료·생명",
        },
        {
            keywords: ["에너지", "자원", "신재생", "태양광", "풍력"],
            field: "에너지·자원",
        },
        {
            keywords: ["공예", "디자인", "패션", "예술", "콘텐츠"],
            field: "공예·디자인",
        },
    ];

    let maxScore = 0;
    let detectedTechField: TechField = "정보·통신"; // Default
    for (const { keywords, field } of techKeywordMap) {
        let score = 0;
        for (const kw of keywords) {
            if (cleanContent.toLowerCase().includes(kw.toLowerCase())) score++;
        }
        if (score > maxScore) {
            maxScore = score;
            detectedTechField = field;
        }
    }
    extracted.tech_field = detectedTechField;

    // Set default region as 일반지역
    extracted.region_type = "일반지역";

    // ========== 2-3 정부지원사업비 집행계획 표에서 합계 추출 ==========
    // 마크다운 표의 합계 행: | **합 계** | | **25,000,000** | **2,500,000** | **0** | **27,500,000** |
    const budgetTotalRegex = /\|\s*\*?\*?합\s*계\*?\*?\s*\|\s*[^|]*\|\s*\*?\*?([0-9,]+)\*?\*?\s*\|\s*\*?\*?([0-9,]+)\*?\*?\s*\|\s*\*?\*?([0-9,]+)\*?\*?\s*\|\s*\*?\*?([0-9,]+)\*?\*?\s*\|/i;
    const budgetMatch = cleanContent.match(budgetTotalRegex);
    
    if (budgetMatch) {
        const govAmount = budgetMatch[1].replace(/,/g, '');
        const cashAmount = budgetMatch[2].replace(/,/g, '');
        const kindAmount = budgetMatch[3].replace(/,/g, '');
        const totalAmount = budgetMatch[4].replace(/,/g, '');
        
        // 숫자로 변환해서 포맷팅
        const formatAmount = (num: string) => {
            const n = parseInt(num, 10);
            if (isNaN(n)) return "0";
            return n.toLocaleString('ko-KR');
        };
        
        extracted.budget_gov = formatAmount(govAmount);
        extracted.budget_self_cash = formatAmount(cashAmount);
        extracted.budget_self_kind = formatAmount(kindAmount);
        extracted.budget_total = formatAmount(totalAmount);
        
        console.log("[extractBusinessInfo] 2-3 예산 추출:", {
            budget_gov: extracted.budget_gov,
            budget_self_cash: extracted.budget_self_cash,
            budget_self_kind: extracted.budget_self_kind,
            budget_total: extracted.budget_total
        });
    } else {
        // 기본값 (추출 실패 시)
        extracted.budget_gov = "100,000,000";
        extracted.budget_self_cash = "10,000,000";
        extracted.budget_self_kind = "0";
        extracted.budget_total = "110,000,000";
    }

    // Set target_output if not already set (use item_name as fallback)
    if (!extracted.target_output && extracted.item_name) {
        extracted.target_output = extracted.item_name;
    }

    // ========== 4-2 팀 구성(안) 표에서 팀원 정보 추출 ==========
    // 마크다운 표 형식: | 팀원1 | CTO | AI 알고리즘 개발 | 20년 경력 | 확정 |
    const teamTableRegex =
        /\|\s*(팀원\d+|팀원 ?\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*(확정|예정|구성|미구성)?\s*\|/gi;
    let teamMatch;
    let teamIndex = 1;

    while (
        (teamMatch = teamTableRegex.exec(cleanContent)) !== null &&
        teamIndex <= 5
    ) {
        const [, memberType, position, role, competency, status] = teamMatch;

        // 팀원만 추출 (대표자 본인 제외)
        if (memberType) {
            (extracted as any)[`team_${teamIndex}_position`] =
                position?.trim() || "";
            (extracted as any)[`team_${teamIndex}_role`] = role?.trim() || "";
            (extracted as any)[`team_${teamIndex}_competency`] =
                competency?.trim() || "";
            // 구성/미구성을 확정/예정으로 매핑
            let mappedStatus = status?.trim() || "확정";
            if (mappedStatus === "구성") mappedStatus = "확정";
            if (mappedStatus === "미구성") mappedStatus = "예정";
            (extracted as any)[`team_${teamIndex}_status`] =
                mappedStatus as TeamStatus;
            teamIndex++;
        }
    }

    // HTML 테이블에서도 추출 시도 (에디터가 HTML로 렌더링하는 경우)
    // <td>팀원1</td><td>CTO</td><td>담당업무</td><td>역량</td><td>확정</td>
    if (teamIndex === 1) {
        // 마크다운 추출 실패 시 HTML 패턴 시도
        const htmlTeamRegex =
            /<td[^>]*>\s*(팀원\d+|팀원 ?\d+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*(확정|예정|구성|미구성)?\s*<\/td>/gi;
        let htmlMatch;

        while (
            (htmlMatch = htmlTeamRegex.exec(content)) !== null &&
            teamIndex <= 5
        ) {
            const [, , position, role, competency, status] = htmlMatch;
            (extracted as any)[`team_${teamIndex}_position`] =
                position?.trim() || "";
            (extracted as any)[`team_${teamIndex}_role`] = role?.trim() || "";
            (extracted as any)[`team_${teamIndex}_competency`] =
                competency?.trim() || "";
            let mappedStatus = status?.trim() || "확정";
            if (mappedStatus === "구성") mappedStatus = "확정";
            if (mappedStatus === "미구성") mappedStatus = "예정";
            (extracted as any)[`team_${teamIndex}_status`] =
                mappedStatus as TeamStatus;
            teamIndex++;
        }
    }

    console.log("[extractBusinessInfo] 팀 추출 결과:", {
        team_1_position: (extracted as any).team_1_position,
        team_2_position: (extracted as any).team_2_position,
        teamIndex,
    });

    return extracted;
};

const initialBusinessInfo: BusinessInfo = {
    info_company_name: "",
    info_est_date: "",
    info_reg_number: "",
    info_address: "",
    business_type: "개인사업자",
    representative_type: "단독",
    item_name: "",
    target_output: "",
    support_field: "",
    tech_field: "",
    budget_gov: "",
    budget_self_cash: "",
    budget_self_kind: "",
    budget_total: "",
    // 정부지원사업비 총액 (기본 1억원)
    budget_gov_amount: 100000000,
    // 사업비 집행 계획 (비목별 기본값)
    budget_material_basis: "",
    budget_material_amount: 3000000,
    budget_personnel_basis: "",
    budget_personnel_amount: 50000000,
    budget_outsourcing_basis: "",
    budget_outsourcing_amount: 20000000,
    budget_advertising_basis: "",
    budget_advertising_amount: 10000000,
    budget_commission_basis: "",
    budget_commission_amount: 5000000,
    budget_activity_basis: "",
    budget_activity_amount: 7000000,
    budget_etc_basis: "",
    budget_etc_amount: 5000000,
    region_type: "",
    team_1_position: "",
    team_1_role: "",
    team_1_competency: "",
    team_1_status: "",
    team_2_position: "",
    team_2_role: "",
    team_2_competency: "",
    team_2_status: "",
    team_3_position: "",
    team_3_role: "",
    team_3_competency: "",
    team_3_status: "",
    team_4_position: "",
    team_4_role: "",
    team_4_competency: "",
    team_4_status: "",
    team_5_position: "",
    team_5_role: "",
    team_5_competency: "",
    team_5_status: "",
};

export const BusinessInfoPanel = forwardRef<
    BusinessInfoPanelHandle,
    BusinessInfoPanelProps
>(
    (
        { className, defaultCompanyName, editorContent, chatContent, onChange },
        ref,
    ) => {
        // Initialize with ALL defaults already applied
        const [businessInfo, setBusinessInfoState] = useState<BusinessInfo>(
            () => ({
                ...initialBusinessInfo,
                // 일반현황 기본 정보 - AI가 채울 빈 값으로 초기화
                info_company_name: defaultCompanyName || "",
                info_est_date: "",
                info_reg_number: "",
                info_address: "",
                business_type: "개인사업자",
                representative_type: "단독",
                // 창업아이템 정보 - AI가 채울 빈 값
                item_name: "",
                target_output: "",
                // 지원 분야 및 기술 분야 - 기본 선택 없음
                support_field: "",
                tech_field: "",
                // 사업비 정보 - 기본값
                budget_gov: "",
                budget_self_cash: "",
                budget_self_kind: "",
                budget_total: "",
                // 정부지원사업비 총액 (기본 0)
                budget_gov_amount: 0,
                // 사업비 집행 계획 (비목별) - 빈 값
                budget_material_basis: "",
                budget_material_amount: 0,
                budget_personnel_basis: "",
                budget_personnel_amount: 0,
                budget_outsourcing_basis: "",
                budget_outsourcing_amount: 0,
                budget_advertising_basis: "",
                budget_advertising_amount: 0,
                budget_commission_basis: "",
                budget_commission_amount: 0,
                budget_activity_basis: "",
                budget_activity_amount: 0,
                budget_etc_basis: "",
                budget_etc_amount: 0,
                // 지방우대 지역 - 기본 선택 없음
                region_type: "",
                // 팀 구성 현황 - AI가 채울 빈 값
                team_1_position: "",
                team_1_role: "",
                team_1_competency: "",
                team_1_status: "",
            }),
        );
        const [hasExtracted, setHasExtracted] = useState(false);
        const lastContentLengthRef = useRef<number>(0);

        // Update company name when default changes
        useEffect(() => {
            if (defaultCompanyName && defaultCompanyName !== "제목 없음") {
                setBusinessInfoState((prev) => ({
                    ...prev,
                    info_company_name: defaultCompanyName,
                }));
            }
        }, [defaultCompanyName]);

        // Auto-extract from chat content (user messages have priority)
        useEffect(() => {
            if (chatContent && chatContent.length > 50) {
                const extracted = extractBusinessInfoFromContent(chatContent);
                if (Object.keys(extracted).length > 0) {
                    setBusinessInfoState((prev) => {
                        const updated = { ...prev };

                        // 기업 기본 정보 추출 (채팅에서 제공된 정보는 항상 우선)
                        if (extracted.info_company_name) {
                            updated.info_company_name =
                                extracted.info_company_name;
                        }
                        if (extracted.info_reg_number) {
                            updated.info_reg_number = extracted.info_reg_number;
                        }
                        if (extracted.info_est_date) {
                            updated.info_est_date = extracted.info_est_date;
                        }
                        if (extracted.info_address) {
                            updated.info_address = extracted.info_address;
                        }

                        return updated;
                    });
                }
            }
        }, [chatContent]);

        // Auto-extract from editor content when it changes substantially
        useEffect(() => {
            // 팀 구성 정보는 항상 추출 시도 (4-2 표가 문서 끝에 있으므로)
            if (editorContent && editorContent.length > 200) {
                // 기본 정보는 처음 한 번만, 팀 정보는 항상 추출
                const shouldExtractBasic =
                    !hasExtracted &&
                    (editorContent.length >
                        lastContentLengthRef.current + 300 ||
                        editorContent.length > 1000);

                // 팀 정보는 4-2 표가 포함되어 있으면 항상 추출
                const hasTeamTable =
                    editorContent.includes("팀원1") ||
                    editorContent.includes("팀원 1");

                if (shouldExtractBasic || hasTeamTable) {
                    console.log("[BusinessInfoPanel] 추출 시도:", {
                        editorContentLength: editorContent.length,
                        hasTeamTable,
                        shouldExtractBasic,
                    });

                    const extracted =
                        extractBusinessInfoFromContent(editorContent);
                    if (Object.keys(extracted).length > 0) {
                        setBusinessInfoState((prev) => {
                            const updated = { ...prev };

                            // 기업 기본 정보 추출 (처음 한 번만)
                            if (shouldExtractBasic) {
                                if (extracted.info_company_name) {
                                    updated.info_company_name =
                                        extracted.info_company_name;
                                }
                                if (extracted.info_reg_number) {
                                    updated.info_reg_number =
                                        extracted.info_reg_number;
                                }
                                if (extracted.info_est_date) {
                                    updated.info_est_date =
                                        extracted.info_est_date;
                                }
                                if (extracted.info_address) {
                                    updated.info_address =
                                        extracted.info_address;
                                }

                                // 창업아이템 정보 추출
                                if (extracted.item_name && !prev.item_name) {
                                    updated.item_name = extracted.item_name;
                                }
                                if (
                                    extracted.target_output &&
                                    !prev.target_output
                                ) {
                                    updated.target_output =
                                        extracted.target_output;
                                }
                                if (extracted.support_field) {
                                    updated.support_field =
                                        extracted.support_field;
                                }
                                if (extracted.tech_field) {
                                    updated.tech_field = extracted.tech_field;
                                }
                            }

                            // 팀 구성 현황 추출 (4-2 표에서) - 항상 추출
                            for (let i = 1; i <= 5; i++) {
                                const posKey =
                                    `team_${i}_position` as keyof BusinessInfo;
                                const roleKey =
                                    `team_${i}_role` as keyof BusinessInfo;
                                const compKey =
                                    `team_${i}_competency` as keyof BusinessInfo;
                                const statusKey =
                                    `team_${i}_status` as keyof BusinessInfo;

                                if ((extracted as any)[posKey]) {
                                    (updated as any)[posKey] = (
                                        extracted as any
                                    )[posKey];
                                }
                                if ((extracted as any)[roleKey]) {
                                    (updated as any)[roleKey] = (
                                        extracted as any
                                    )[roleKey];
                                }
                                if ((extracted as any)[compKey]) {
                                    (updated as any)[compKey] = (
                                        extracted as any
                                    )[compKey];
                                }
                                if ((extracted as any)[statusKey]) {
                                    (updated as any)[statusKey] = (
                                        extracted as any
                                    )[statusKey];
                                }
                            }

                            return updated;
                        });
                        lastContentLengthRef.current = editorContent.length;
                        // Mark as extracted after substantial content
                        if (editorContent.length > 1000) {
                            setHasExtracted(true);
                        }
                    }
                }
            }
        }, [editorContent, hasExtracted]);

        // Notify parent of changes
        useEffect(() => {
            onChange?.(businessInfo);
        }, [businessInfo]);

        useImperativeHandle(ref, () => ({
            getBusinessInfo: () => businessInfo,
            setBusinessInfo: (info: Partial<BusinessInfo>) => {
                setBusinessInfoState((prev) => ({ ...prev, ...info }));
            },
            extractFromContent: (content: string) => {
                const extracted = extractBusinessInfoFromContent(content);
                if (Object.keys(extracted).length > 0) {
                    setBusinessInfoState((prev) => {
                        const updated = { ...prev };
                        for (const [key, value] of Object.entries(extracted)) {
                            if (value && !prev[key as keyof BusinessInfo]) {
                                (updated as any)[key] = value;
                            }
                        }
                        return updated;
                    });
                }
            },
        }));

        const updateField = <K extends keyof BusinessInfo>(
            field: K,
            value: BusinessInfo[K],
        ) => {
            setBusinessInfoState((prev) => ({ ...prev, [field]: value }));
        };

        // Common cell styles
        const labelCellClass =
            "bg-gray-100 px-3 py-2 font-medium text-gray-700 border border-gray-300 text-sm";
        const valueCellClass = "px-2 py-1 border border-gray-300";
        const inputClass =
            "border-0 bg-transparent h-8 px-1 rounded-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm";

        return (
            <div className={cn("", className)}>
                {/* Title - styled like h1 in ProseMirror */}
                <h1 className="text-2xl font-bold mb-4">일반현황</h1>

                {/* First Table: 기업 기본 정보 */}
                <table className="w-full border-collapse mb-4">
                    <tbody>
                        {/* Row 1: 기업명 & 개업연월일 */}
                        <tr>
                            <td
                                className={labelCellClass}
                                style={{ width: "15%" }}
                            >
                                기업명
                            </td>
                            <td
                                className={valueCellClass}
                                style={{ width: "35%" }}
                            >
                                <Input
                                    value={businessInfo.info_company_name}
                                    onChange={(e) =>
                                        updateField(
                                            "info_company_name",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="예: (주)그랜트AI"
                                />
                            </td>
                            <td
                                className={labelCellClass}
                                style={{ width: "15%" }}
                            >
                                <div>개업연월일</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    개인 : 개업연월일,
                                    <br />
                                    법인 : 법인설립등기일
                                </div>
                            </td>
                            <td
                                className={valueCellClass}
                                style={{ width: "35%" }}
                            >
                                <Input
                                    value={businessInfo.info_est_date}
                                    onChange={(e) =>
                                        updateField(
                                            "info_est_date",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="YYYY.MM.DD"
                                />
                            </td>
                        </tr>
                        {/* Row 2: 사업자 구분 & 대표자 유형 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>사업자 구분</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (모집마감일 기준)
                                </div>
                            </td>
                            <td className={valueCellClass}>
                                <Select
                                    value={businessInfo.business_type}
                                    onValueChange={(
                                        value: "개인사업자" | "법인사업자",
                                    ) => updateField("business_type", value)}
                                >
                                    <SelectTrigger className="border-0 bg-transparent h-8 px-1 focus:ring-0 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="개인사업자">
                                            개인사업자
                                        </SelectItem>
                                        <SelectItem value="법인사업자">
                                            법인사업자
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </td>
                            <td className={labelCellClass}>
                                <div>대표자 유형</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (모집마감일 기준)
                                </div>
                            </td>
                            <td className={valueCellClass}>
                                <Select
                                    value={businessInfo.representative_type}
                                    onValueChange={(
                                        value: "단독" | "공동" | "각자대표",
                                    ) =>
                                        updateField(
                                            "representative_type",
                                            value,
                                        )
                                    }
                                >
                                    <SelectTrigger className="border-0 bg-transparent h-8 px-1 focus:ring-0 text-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="단독">
                                            단독
                                        </SelectItem>
                                        <SelectItem value="공동">
                                            공동
                                        </SelectItem>
                                        <SelectItem value="각자대표">
                                            각자대표
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </td>
                        </tr>
                        {/* Row 3: 사업자등록번호 & 사업자 소재지 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>사업자등록번호</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (법인등록번호)
                                </div>
                            </td>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.info_reg_number}
                                    onChange={(e) =>
                                        updateField(
                                            "info_reg_number",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="000-00-00000"
                                />
                            </td>
                            <td className={labelCellClass}>
                                <div>사업자 소재지</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (본사(점))
                                </div>
                            </td>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.info_address}
                                    onChange={(e) =>
                                        updateField(
                                            "info_address",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="예: 서울특별시 강남구"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Second Table: 창업아이템 정보 */}
                <table className="w-full border-collapse mb-4">
                    <colgroup>
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "21.25%" }} />
                        <col style={{ width: "21.25%" }} />
                        <col style={{ width: "21.25%" }} />
                        <col style={{ width: "21.25%" }} />
                    </colgroup>
                    <tbody>
                        {/* 창업아이템명 */}
                        <tr>
                            <td className={labelCellClass}>창업아이템명</td>
                            <td className={valueCellClass} colSpan={4}>
                                <Input
                                    value={businessInfo.item_name}
                                    onChange={(e) =>
                                        updateField("item_name", e.target.value)
                                    }
                                    className={inputClass}
                                    placeholder="예: AI 기반 사업계획서 자동 작성 솔루션"
                                />
                            </td>
                        </tr>
                        {/* 산출물 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>산출물</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (협약기간 내 목표)
                                </div>
                            </td>
                            <td className={valueCellClass} colSpan={4}>
                                <Input
                                    value={businessInfo.target_output}
                                    onChange={(e) =>
                                        updateField(
                                            "target_output",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                    placeholder="예: AI 사업계획서 자동 작성 플랫폼"
                                />
                            </td>
                        </tr>
                        {/* 지원 분야 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>지원 분야</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (택 1)
                                </div>
                            </td>
                            <td className={valueCellClass} colSpan={4}>
                                <div className="flex items-center gap-6 py-1">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.support_field ===
                                                "제조"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "support_field",
                                                    checked ? "제조" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        제조
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.support_field ===
                                                "지식서비스"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "support_field",
                                                    checked ? "지식서비스" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        지식서비스
                                    </label>
                                </div>
                            </td>
                        </tr>
                        {/* 전문기술분야 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>전문기술분야</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (택 1)
                                </div>
                            </td>
                            <td className={valueCellClass} colSpan={4}>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "기계·소재"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked ? "기계·소재" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        기계·소재
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "전기·전자"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked ? "전기·전자" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        전기·전자
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "정보·통신"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked ? "정보·통신" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        정보·통신
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "화공·섬유"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked ? "화공·섬유" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        화공·섬유
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "바이오·의료·생명"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked
                                                        ? "바이오·의료·생명"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        바이오·의료·생명
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "에너지·자원"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked
                                                        ? "에너지·자원"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        에너지·자원
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.tech_field ===
                                                "공예·디자인"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "tech_field",
                                                    checked
                                                        ? "공예·디자인"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        공예·디자인
                                    </label>
                                </div>
                            </td>
                        </tr>
                        {/* 총 사업비 구성 계획 */}
                        <tr>
                            <td className={labelCellClass} rowSpan={2}>
                                <div>총 사업비</div>
                                <div>구성 계획</div>
                            </td>
                            <td className={`${labelCellClass} text-center`}>
                                정부지원사업비(A)
                            </td>
                            <td
                                className={`${labelCellClass} text-center`}
                                colSpan={2}
                            >
                                <div>자기부담사업비(B)</div>
                                <div className="flex mt-1">
                                    <span className="text-xs flex-1 text-left border-r border-gray-300 pr-2">
                                        현금
                                    </span>
                                    <span className="text-xs flex-1 text-center pl-2">
                                        현물
                                    </span>
                                </div>
                            </td>
                            <td className={`${labelCellClass} text-center`}>
                                <div>총 사업비</div>
                                <div className="text-xs">(C=A+B)</div>
                            </td>
                        </tr>
                        <tr>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.budget_gov}
                                    onChange={(e) =>
                                        updateField(
                                            "budget_gov",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                />
                            </td>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.budget_self_cash}
                                    onChange={(e) =>
                                        updateField(
                                            "budget_self_cash",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                />
                            </td>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.budget_self_kind}
                                    onChange={(e) =>
                                        updateField(
                                            "budget_self_kind",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                />
                            </td>
                            <td className={valueCellClass}>
                                <Input
                                    value={businessInfo.budget_total}
                                    onChange={(e) =>
                                        updateField(
                                            "budget_total",
                                            e.target.value,
                                        )
                                    }
                                    className={inputClass}
                                />
                            </td>
                        </tr>
                        {/* 지방우대 지역 해당여부 */}
                        <tr>
                            <td className={labelCellClass}>
                                <div>지방우대 지역</div>
                                <div>해당여부</div>
                            </td>
                            <td className={valueCellClass} colSpan={4}>
                                <div className="flex items-center gap-4 py-1">
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.region_type ===
                                                "특별지원 지역"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "region_type",
                                                    checked
                                                        ? "특별지원 지역"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        특별지원 지역
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.region_type ===
                                                "우대지원 지역"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "region_type",
                                                    checked
                                                        ? "우대지원 지역"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        우대지원 지역
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.region_type ===
                                                "일반지역"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "region_type",
                                                    checked ? "일반지역" : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        일반지역
                                    </label>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <Checkbox
                                            checked={
                                                businessInfo.region_type ===
                                                "지방우대 비해당 지역"
                                            }
                                            onCheckedChange={(checked) =>
                                                updateField(
                                                    "region_type",
                                                    checked
                                                        ? "지방우대 비해당 지역"
                                                        : "",
                                                )
                                            }
                                            className="rounded-none"
                                        />
                                        지방우대 비해당 지역
                                    </label>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Third Table: 팀 구성 현황 */}
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <td
                                className={`${labelCellClass} text-center`}
                                colSpan={5}
                            >
                                <div className="font-bold">팀 구성 현황</div>
                                <div className="text-xs text-gray-500 font-normal">
                                    (대표자 본인 제외)
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td
                                className={`${labelCellClass} text-center`}
                                style={{ width: "8%" }}
                            >
                                순번
                            </td>
                            <td
                                className={`${labelCellClass} text-center`}
                                style={{ width: "15%" }}
                            >
                                직위
                            </td>
                            <td
                                className={`${labelCellClass} text-center`}
                                style={{ width: "20%" }}
                            >
                                담당 업무
                            </td>
                            <td
                                className={`${labelCellClass} text-center`}
                                style={{ width: "37%" }}
                            >
                                보유 역량{" "}
                                <span className="font-normal text-xs">
                                    (경력 및 학력 등)
                                </span>
                            </td>
                            <td
                                className={`${labelCellClass} text-center`}
                                style={{ width: "20%" }}
                            >
                                구성 상태
                            </td>
                        </tr>
                    </thead>
                    <tbody>
                        {[1, 2, 3, 4, 5].map((num) => (
                            <tr key={num}>
                                <td
                                    className={`${valueCellClass} text-center text-sm`}
                                >
                                    {num}
                                </td>
                                <td className={valueCellClass}>
                                    <Input
                                        value={
                                            (businessInfo as any)[
                                                `team_${num}_position`
                                            ]
                                        }
                                        onChange={(e) =>
                                            updateField(
                                                `team_${num}_position` as keyof BusinessInfo,
                                                e.target.value,
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </td>
                                <td className={valueCellClass}>
                                    <Input
                                        value={
                                            (businessInfo as any)[
                                                `team_${num}_role`
                                            ]
                                        }
                                        onChange={(e) =>
                                            updateField(
                                                `team_${num}_role` as keyof BusinessInfo,
                                                e.target.value,
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </td>
                                <td className={valueCellClass}>
                                    <Input
                                        value={
                                            (businessInfo as any)[
                                                `team_${num}_competency`
                                            ]
                                        }
                                        onChange={(e) =>
                                            updateField(
                                                `team_${num}_competency` as keyof BusinessInfo,
                                                e.target.value,
                                            )
                                        }
                                        className={inputClass}
                                    />
                                </td>
                                <td className={valueCellClass}>
                                    <Select
                                        value={
                                            (businessInfo as any)[
                                                `team_${num}_status`
                                            ] || ""
                                        }
                                        onValueChange={(value: TeamStatus) =>
                                            updateField(
                                                `team_${num}_status` as keyof BusinessInfo,
                                                value,
                                            )
                                        }
                                    >
                                        <SelectTrigger className="border-0 bg-transparent h-8 px-1 focus:ring-0 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="확정">
                                                확정
                                            </SelectItem>
                                            <SelectItem value="예정">
                                                예정
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    },
);

BusinessInfoPanel.displayName = "BusinessInfoPanel";
