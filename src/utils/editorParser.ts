/**
 * Tiptap 에디터 콘텐츠 파서 (v300: 완전 재작성)
 * - 정확한 섹션 경계 감지
 * - 문단 간 줄바꿈 자동 추가
 * - 텍스트 흘러넘침 완전 방지
 */

export interface ProjectData {
    [key: string]: string | undefined;
    item_name?: string;
    item_category?: string;
    category?: string;
    representative_job?: string;
    company_name?: string;
    target_output?: string;

    summary_overview?: string;
    summary_problem?: string;
    summary_solution?: string;
    summary_scaleup?: string;
    summary_team?: string;
    summary_image_1_caption?: string;
    summary_image_2_caption?: string;

    prob_necessity?: string;
    prob_market?: string;

    sol_develop?: string;
    sol_diff?: string;

    scale_bm?: string;
    scale_market?: string;
    scale_esg?: string;

    team_competency?: string;

    budget_p1_total_amount?: string;
    budget_p2_total_amount?: string;

    // 2026 초기창업패키지 전용 예산 필드
    budget_gov?: string;
    budget_self_cash?: string;
    budget_self_kind?: string;
    budget_total?: string;

    // 2026 초기창업패키지 일반현황 필드
    info_company_name?: string;
    info_est_date?: string;
    info_reg_number?: string;
    info_address?: string;
    business_type?: string;
    representative_type?: string;

    // 창업아이템 추가 정보
    support_field?: string;
    tech_field?: string;
    region_type?: string;

    // 팀 구성 현황 (최대 5명)
    team_1_position?: string;
    team_1_role?: string;
    team_1_competency?: string;
    team_1_status?: string;
    team_2_position?: string;
    team_2_role?: string;
    team_2_competency?: string;
    team_2_status?: string;
    team_3_position?: string;
    team_3_role?: string;
    team_3_competency?: string;
    team_3_status?: string;
    team_4_position?: string;
    team_4_role?: string;
    team_4_competency?: string;
    team_4_status?: string;
    team_5_position?: string;
    team_5_role?: string;
    team_5_competency?: string;
    team_5_status?: string;

    // 차트 데이터 및 이미지
    tam_size?: string;
    sam_size?: string;
    som_size?: string;
    image_market_chart?: string;
    image_market_growth?: string;
    image_bm_diagram?: string;
    image_tam_sam_som?: string;
}

const MAX_TEAM_ROWS = 10;
const MAX_PARTNER_ROWS = 10;
const MAX_MATERIAL_ROWS = 5;
const MAX_SCHEDULE_ROWS = 15;

// ============= 유틸리티 함수 =============

const extractNodeText = (node: any): string => {
    if (!node) return "";
    if (node.type === "text") return node.text || "";
    if (node.type === "hardBreak") return "\n";
    if (node.content) return node.content.map(extractNodeText).join("");
    return "";
};

const extractCellText = (cell: any): string => {
    if (!cell || !cell.content) return "";
    return cell.content
        .map((child: any) => extractNodeText(child))
        .join("\n")
        .trim();
};

const parseNumber = (text: string): string => {
    if (!text || !text.trim()) return "";
    const cleaned = text.replace(/[,\s원]/g, "");
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? "" : num.toLocaleString();
};

const refineText = (text: string): string => {
    if (!text) return "";
    let processed = text;
    // 불렛 제거
    processed = processed.replace(/^[\s]*[•\-*]\s*/gm, "");
    processed = processed.replace(/^[\s]*\d+\.\s*/gm, "");
    processed = processed
        .replace(/하나\)/g, "첫째,")
        .replace(/둘\)/g, "둘째,")
        .replace(/셋\)/g, "셋째,")
        .replace(/넷\)/g, "넷째,")
        .replace(/다섯\)/g, "다섯째,");
    return processed.trim();
};

const findTableByKeyword = (tables: any[], keywords: string[]): any | null => {
    for (const table of tables) {
        const tableText = extractNodeText(table).replace(/\s/g, "");
        if (keywords.every((k) => tableText.includes(k))) return table;
    }
    return null;
};

// ============= 모든 키 초기화 함수 =============

const initializeAllKeys = (data: ProjectData): void => {
    const basicKeys = [
        "item_name",
        "item_category",
        "category",
        "representative_job",
        "company_name",
        "target_output",
        "summary_overview",
        "summary_problem",
        "summary_solution",
        "summary_scaleup",
        "summary_team",
        "summary_image_1_caption",
        "summary_image_2_caption",
        "prob_necessity",
        "prob_market",
        "sol_develop",
        "sol_diff",
        "scale_bm",
        "scale_market",
        "scale_esg",
        "team_competency",
        "budget_p1_total_amount",
        "budget_p2_total_amount",
        // 2026 초기창업패키지 전용 예산 필드
        "budget_gov",
        "budget_self_cash",
        "budget_self_kind",
        "budget_total",
        // 2026 초기창업패키지 일반현황 필드 (info_)
        "info_company_name",
        "info_est_date",
        "info_reg_number",
        "info_address",
        "business_type",
        "representative_type",
    ];
    basicKeys.forEach((k) => (data[k] = ""));

    // 팀 구성
    for (let i = 1; i <= MAX_TEAM_ROWS; i++) {
        data[`team_${i}_position`] = "";
        data[`team_${i}_role`] = "";
        data[`team_${i}_competency`] = "";
        data[`team_${i}_status`] = "";
    }

    // 파트너
    for (let i = 1; i <= MAX_PARTNER_ROWS; i++) {
        data[`partner_${i}_name`] = "";
        data[`partner_${i}_competency`] = "";
        data[`partner_${i}_plan`] = "";
        data[`partner_${i}_date`] = "";
    }

    // 예산(1단계, 2단계) - 1단계와 2단계 항목이 다름
    // 1단계: 재료비, 인건비, 외주용역비, 광고선전비, 창업활동비, 기타
    // 2단계: 재료비, 인건비, 외주용역비, 지급수수료, 무형자산취득비, 광고선전비, 창업활동비, 기타
    const budget_p1_categories = [
        "material",
        "personnel",
        "outsourcing",
        "advertising",
        "activity",
        "etc",
    ];
    const budget_p2_categories = [
        "material",
        "personnel",
        "outsourcing",
        "fee",
        "intangible",
        "advertising",
        "activity",
        "etc",
    ];

    for (const cat of budget_p1_categories) {
        data[`budget_p1_${cat}_basis`] = "";
        data[`budget_p1_${cat}_amount`] = "";
    }
    for (const cat of budget_p2_categories) {
        data[`budget_p2_${cat}_basis`] = "";
        data[`budget_p2_${cat}_amount`] = "";
    }

    // 일정
    for (let i = 1; i <= MAX_SCHEDULE_ROWS; i++) {
        data[`schedule_${i}_task`] = "";
        data[`schedule_${i}_period`] = "";
        data[`schedule_${i}_detail`] = "";
        data[`overall_schedule_${i}_task`] = "";
        data[`overall_schedule_${i}_period`] = "";
        data[`overall_schedule_${i}_detail`] = "";
    }
};

// ============= 테이블 파서 =============

const parseOverviewTable = (table: any, data: ProjectData) => {
    if (!table) return;
    const rows = table.content || [];

    let imageRowIndex = -1;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const cells = row.content || [];
        if (cells.length < 2) continue;

        for (let i = 0; i < cells.length - 1; i += 2) {
            const label = extractCellText(cells[i]).replace(/\s/g, "");
            const value = extractCellText(cells[i + 1]);

            if (label.includes("명칭")) data["item_name"] = value;
            if (label.includes("범주")) {
                data["item_category"] = value;
                data["category"] = value;
            }
            if (label.includes("아이템개요")) data["summary_overview"] = value;
            if (label.includes("문제인식")) data["summary_problem"] = value;
            if (label.includes("실현가능성")) data["summary_solution"] = value;
            if (label.includes("성장전략")) data["summary_scaleup"] = value;
            if (label.includes("팀구성")) data["summary_team"] = value;

            if (label.includes("이미지")) {
                imageRowIndex = rowIndex;
            }
        }
    }

    // 이미지 캡션: 이미지 행 다음 행에서 추출
    if (imageRowIndex >= 0 && imageRowIndex + 1 < rows.length) {
        const captionRow = rows[imageRowIndex + 1];
        const captionCells = captionRow.content || [];

        const firstCellText =
            captionCells.length > 0
                ? extractCellText(captionCells[0]).replace(/\s/g, "")
                : "";
        if (!firstCellText.includes("이미지")) {
            if (captionCells.length >= 1) {
                data["summary_image_1_caption"] = extractCellText(
                    captionCells[0],
                );
            }
            if (captionCells.length >= 2) {
                data["summary_image_2_caption"] = extractCellText(
                    captionCells[1],
                );
            }
        }
    }
};

const parseScheduleTable = (table: any, data: ProjectData, prefix: string) => {
    if (!table) return;
    const rows = table.content || [];
    let rowIdx = 1;
    for (let i = 1; i < rows.length && rowIdx <= MAX_SCHEDULE_ROWS; i++) {
        const cells = rows[i].content || [];
        if (cells.length < 2) continue;

        let task = "",
            period = "",
            detail = "";
        if (cells.length >= 4) {
            task = extractCellText(cells[1]);
            period = extractCellText(cells[2]);
            detail = extractCellText(cells[3]);
        } else if (cells.length === 3) {
            task = extractCellText(cells[1]);
            period = extractCellText(cells[2]);
        }

        if (!task && !period) continue;
        data[`${prefix}_${rowIdx}_task`] = task;
        data[`${prefix}_${rowIdx}_period`] = period;
        data[`${prefix}_${rowIdx}_detail`] = detail;
        rowIdx++;
    }
};

const parseBudgetTable = (table: any, data: ProjectData, prefix: string) => {
    if (!table) return;
    const rows = table.content || [];

    // 1단계/2단계 다른 매핑 사용
    const categoryMap: Record<string, string> = {
        재료: "material",
        인건: "personnel",
        외주: "outsourcing",
        용역: "outsourcing",
        지급수수료: "fee",
        수수료: "fee",
        무형자산: "intangible",
        무형: "intangible",
        광고: "advertising",
        마케팅: "advertising",
        홍보: "advertising",
        창업활동: "activity",
        활동: "activity",
        기타: "etc",
    };

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].content || [];
        if (cells.length < 2) continue;

        const cat = extractCellText(cells[0]).replace(/\s/g, "");
        const basis = extractCellText(cells[1]);
        const amt = cells.length > 2 ? extractCellText(cells[2]) : "";

        if (cat.includes("합계") || cat.includes("총")) {
            data[`${prefix}_total_amount`] = parseNumber(amt);
            continue;
        }

        if (!basis && !amt) continue;

        let found = false;
        for (const [keyword, key] of Object.entries(categoryMap)) {
            if (cat.includes(keyword)) {
                data[`${prefix}_${key}_basis`] = basis;
                data[`${prefix}_${key}_amount`] = parseNumber(amt);
                found = true;
                break;
            }
        }

        if (!found) {
            data[`${prefix}_etc_basis`] = basis;
            data[`${prefix}_etc_amount`] = parseNumber(amt);
        }
    }
};

const parseTeamTable = (table: any, data: ProjectData) => {
    if (!table) return;
    const rows = table.content || [];
    let idx = 1;

    console.log(`🔍 parseTeamTable: found ${rows.length} rows`);

    for (let i = 1; i < rows.length && idx <= MAX_TEAM_ROWS; i++) {
        const cells = rows[i].content || [];
        console.log(`  Row ${i}: ${cells.length} cells`);
        if (cells.length < 2) continue;

        // 테이블 구조: 구분 | 직위 | 담당 업무 | 보유 역량 | 구성 상태
        // cells[0] = 구분 (대표자, 팀원1 등)
        // cells[1] = 직위 (CEO, CTO 등)
        // cells[2] = 담당 업무
        // cells[3] = 보유 역량
        // cells[4] = 구성 상태

        const division = extractCellText(cells[0]); // 구분
        const position = cells.length > 1 ? extractCellText(cells[1]) : ""; // 직위
        const role = cells.length > 2 ? extractCellText(cells[2]) : ""; // 담당 업무
        const competency = cells.length > 3 ? extractCellText(cells[3]) : ""; // 보유 역량
        const status = cells.length > 4 ? extractCellText(cells[4]) : ""; // 구성 상태

        console.log(
            `    division: ${division}, position: ${position}, role: ${role}`,
        );

        // 헤더 행 스킵
        if (division.includes("구분") || position.includes("직위")) continue;
        // 빈 행 스킵
        if (!division && !position && !role) continue;

        data[`team_${idx}_position`] = position;
        data[`team_${idx}_role`] = role;
        data[`team_${idx}_competency`] = competency;
        data[`team_${idx}_status`] = status;

        console.log(
            `  ✅ Saved team_${idx}: pos=${position}, role=${role}, comp=${competency}, stat=${status}`,
        );
        idx++;
    }

    console.log(`🔍 parseTeamTable: saved ${idx - 1} team members`);
};

const parsePartnerTable = (table: any, data: ProjectData) => {
    if (!table) return;
    const rows = table.content || [];
    let idx = 1;

    console.log(`🔍 parsePartnerTable: found ${rows.length} rows`);

    // 최대 3개만 처리
    const MAX_PARTNERS = 3;

    for (let i = 1; i < rows.length && idx <= MAX_PARTNERS; i++) {
        const cells = rows[i].content || [];
        console.log(`  Row ${i}: ${cells.length} cells`);
        if (cells.length < 2) continue;

        // 테이블 구조: 구분 | 파트너명 | 보유 역량 | 협업 방안 | 협력 시기
        const division = extractCellText(cells[0]); // 구분
        const name = cells.length > 1 ? extractCellText(cells[1]) : ""; // 파트너명
        const competency = cells.length > 2 ? extractCellText(cells[2]) : ""; // 보유 역량
        const plan = cells.length > 3 ? extractCellText(cells[3]) : ""; // 협업 방안
        const date = cells.length > 4 ? extractCellText(cells[4]) : ""; // 협력 시기

        console.log(
            `    division: ${division}, name: ${name}, competency: ${competency}`,
        );

        // 헤더 행 스킵
        if (division.includes("구분") || name.includes("파트너명")) continue;
        // 빈 행 스킵
        if (!division && !name) continue;

        data[`partner_${idx}_name`] = name;
        data[`partner_${idx}_cap`] = competency; // 템플릿: partner_X_cap
        data[`partner_${idx}_plan`] = plan;
        data[`partner_${idx}_date`] = date;

        console.log(
            `  ✅ Saved partner_${idx}: name=${name}, comp=${competency}`,
        );
        idx++;
    }

    console.log(`🔍 parsePartnerTable: saved ${idx - 1} partners`);
};

// ============= 섹션 파싱 (v300: 완전 재작성) =============

// 🔥 섹션 헤더 정규표현식 패턴 (정확한 매칭)
const SECTION_PATTERNS: {
    pattern: RegExp;
    key: string;
    isTerminator?: boolean;
}[] = [
    // 1-1, 1-2
    { pattern: /1-1[.\s]*기존\s*시장/, key: "prob_necessity" },
    { pattern: /1-2[.\s]*개발\s*필요성/, key: "prob_market" },

    // 2-1-1, 2-1-2
    { pattern: /2-1-1[.\s]*창업\s*아이템\s*개발/, key: "sol_develop" },
    { pattern: /2-1-2[.\s]*차별성/, key: "sol_diff" },

    // 2-2, 2-3 (Terminator - 표 섹션)
    { pattern: /2-2[.\s]*사업\s*추진/, key: "", isTerminator: true },
    { pattern: /2-3[.\s]*정부\s*지원/, key: "", isTerminator: true },

    // 3-1-1, 3-1-2
    { pattern: /3-1-1[.\s]*비즈니스\s*모델/, key: "scale_bm" },
    { pattern: /3-1-2[.\s]*시장\s*진입/, key: "scale_market" },

    // 3-2, 3-3
    { pattern: /3-2[.\s]*사업\s*추진/, key: "", isTerminator: true },
    { pattern: /3-3[.\s]*(중장기|사회적\s*가치|ESG)/, key: "scale_esg" },

    // 4-1, 4-2, 4-3
    { pattern: /4-1[.\s]*(대표자|보유\s*역량)/, key: "team_competency" },
    { pattern: /4-2[.\s]*팀\s*구성/, key: "", isTerminator: true },
    { pattern: /4-3[.\s]*협력\s*기관/, key: "", isTerminator: true },
];

// 추가 Terminator 패턴 (표 시작 신호)
const EXTRA_TERMINATORS = [
    /<1단계/,
    /<2단계/,
    /정부지원사업비/,
    /집행계획/,
    /사업추진\s*일정/,
    /팀\s*구성\s*\(안\)/,
    /협력\s*기관\s*현황/,
];

const detectSectionKey = (
    text: string,
): { key: string; isTerminator: boolean } | null => {
    const cleanText = text.replace(/\s+/g, " ").trim();

    for (const { pattern, key, isTerminator } of SECTION_PATTERNS) {
        if (pattern.test(cleanText)) {
            return { key, isTerminator: isTerminator || false };
        }
    }

    // 추가 Terminator 체크
    for (const pattern of EXTRA_TERMINATORS) {
        if (pattern.test(cleanText)) {
            return { key: "", isTerminator: true };
        }
    }

    return null;
};

// 섹션 제목인지 확인 (본문에서 제외)
const isSectionHeader = (text: string): boolean => {
    const cleanText = text.replace(/\s+/g, " ").trim();

    // 번호가 포함된 헤더 패턴
    if (/^#|^###|^##/.test(text)) return true;
    if (/^[1-4]-[1-3](-[1-2])?\./.test(cleanText)) return true;
    if (/^[1-4]\.\s*(문제|실현|성장|팀)/.test(cleanText)) return true;

    return false;
};

const extractGranularSections = (content: any[], data: ProjectData): void => {
    let currentKey = "";
    const paragraphs: Map<string, string[]> = new Map();

    const addParagraph = (key: string, text: string) => {
        if (!key || !text) return;

        // 섹션 헤더는 본문에서 제외
        if (isSectionHeader(text)) {
            console.log(`⛔ Skipping header: [${text.substring(0, 50)}...]`);
            return;
        }

        const refined = refineText(text);
        if (!refined) return;

        if (!paragraphs.has(key)) {
            paragraphs.set(key, []);
        }
        paragraphs.get(key)!.push(refined);
    };

    for (const node of content) {
        // 테이블은 스킵
        if (node.type === "table") continue;

        const text = extractNodeText(node).trim();
        if (!text) continue;

        // 대분류 헤더 스킵 (1. 문제 인식, 2. 실현 가능성 등)
        if (/^[1-4]\.\s*(문제|실현|성장|팀)/.test(text)) {
            continue;
        }

        // 섹션 감지
        const detected = detectSectionKey(text);

        if (detected) {
            if (detected.isTerminator) {
                // Terminator: 현재 섹션 저장 중단
                console.log(
                    `🛑 Terminator: [${text.substring(0, 40)}...] -> stopping [${currentKey}]`,
                );
                currentKey = "";
            } else if (detected.key) {
                // 새 섹션 시작
                console.log(
                    `🎯 Section Start: [${text.substring(0, 40)}...] -> {{${detected.key}}}`,
                );
                currentKey = detected.key;
            }
            continue; // 헤더 자체는 본문에 포함하지 않음
        }

        // 본문 추가
        if (currentKey) {
            addParagraph(currentKey, text);
        }
    }

    // 🔥 문단 간 빈 줄 추가하여 저장
    for (const [key, texts] of paragraphs) {
        // 각 문단을 빈 줄로 구분
        data[key] = texts.join("\n\n");
    }
};

// ============= 메인 파서 =============

export const parseEditorContent = (
    content: any,
    plainText: string,
): ProjectData => {
    console.log("🚀 Parsing started (v300 - Complete Rewrite)");
    const data: ProjectData = {};

    // 모든 키 초기화
    initializeAllKeys(data);

    if (!content?.content) return data;

    const tables = content.content.filter((n: any) => n.type === "table");

    // Overview 테이블
    const overviewTable = findTableByKeyword(tables, ["명칭", "범주"]);
    if (overviewTable) parseOverviewTable(overviewTable, data);

    // 일정 테이블
    const scheduleTables = tables.filter((t: any) => {
        const text = extractNodeText(t);
        return text.includes("추진기간") || text.includes("추진 기간");
    });
    if (scheduleTables[0])
        parseScheduleTable(scheduleTables[0], data, "schedule");
    if (scheduleTables[1])
        parseScheduleTable(scheduleTables[1], data, "overall_schedule");

    // 예산 테이블
    const budgetTables = tables.filter((t: any) => {
        const text = extractNodeText(t);
        return (
            text.includes("비목") ||
            text.includes("산출근거") ||
            text.includes("산 출 근 거")
        );
    });
    if (budgetTables[0]) parseBudgetTable(budgetTables[0], data, "budget_p1");
    if (budgetTables[1]) parseBudgetTable(budgetTables[1], data, "budget_p2");

    // 팀 테이블 - 구분/직위/담당업무/보유역량/구성상태 구조
    const teamTable = tables.find((t: any) => {
        const text = extractNodeText(t).replace(/\s/g, "");
        // "팀구성" 또는 "직위+담당+보유역량" 패턴 찾기
        return (
            (text.includes("구성상태") || text.includes("담당업무")) &&
            text.includes("직위") &&
            !text.includes("파트너명")
        );
    });
    if (teamTable) {
        console.log("🎯 Found team table");
        parseTeamTable(teamTable, data);
    } else {
        console.log("⚠️ Team table not found");
    }

    // 파트너 테이블 - 파트너명/보유역량/협업방안 구조
    const partnerTable = tables.find((t: any) => {
        const text = extractNodeText(t).replace(/\s/g, "");
        return (
            text.includes("파트너명") ||
            text.includes("협력기관") ||
            text.includes("협업방안")
        );
    });
    if (partnerTable) {
        console.log("🎯 Found partner table");
        parsePartnerTable(partnerTable, data);
    } else {
        console.log("⚠️ Partner table not found");
    }

    // 줄글 섹션 파싱
    extractGranularSections(content.content, data);

    // 기본값 설정
    if (!data["company_name"] && data["item_name"])
        data["company_name"] = data["item_name"];
    if (!data["representative_job"]) data["representative_job"] = "대표";
    if (
        !data["target_output"] ||
        data["target_output"] === "예비창업패키지 사업계획서"
    ) {
        data["target_output"] = data["item_category"]
            ? `${data["item_category"]} 기반 서비스`
            : "AI 기반 웹/앱 서비스 플랫폼";
    }
    if (data["item_category"] && !data["category"])
        data["category"] = data["item_category"];

    // 2026 초기창업패키지 일반현황 기본값 설정
    // info_company_name은 company_name 또는 item_name 사용
    if (!data["info_company_name"]) {
        data["info_company_name"] =
            data["company_name"] || data["item_name"] || "";
    }
    // 사업자 구분: 개인사업자 / 법인사업자 중 선택
    if (!data["business_type"]) {
        data["business_type"] = "개인사업자";
    }
    // 대표자 유형: 단독 / 공동 / 각자대표 중 선택
    if (!data["representative_type"]) {
        data["representative_type"] = "단독";
    }
    // 개업연월일 기본값 (현재 날짜 기준)
    if (!data["info_est_date"]) {
        data["info_est_date"] = ""; // 빈 값 (사용자가 입력해야 함)
    }
    // 사업자등록번호 기본값
    if (!data["info_reg_number"]) {
        data["info_reg_number"] = ""; // 빈 값 (사용자가 입력해야 함)
    }
    // 사업자 소재지 기본값
    if (!data["info_address"]) {
        data["info_address"] = ""; // 빈 값 (사용자가 입력해야 함)
    }

    // 차트용 기본 데이터 할당 (추후 에디터 입력값과 연동 예정)
    if (!data["tam_size"]) data["tam_size"] = "100";
    if (!data["sam_size"]) data["sam_size"] = "50";
    if (!data["som_size"]) data["som_size"] = "20";

    console.log("✅ Parsing completed (v300)");
    console.log("📊 Section samples:", {
        prob_necessity: data["prob_necessity"]?.substring(0, 80) + "...",
        prob_market: data["prob_market"]?.substring(0, 80) + "...",
        sol_develop: data["sol_develop"]?.substring(0, 80) + "...",
        sol_diff: data["sol_diff"]?.substring(0, 80) + "...",
        scale_bm: data["scale_bm"]?.substring(0, 80) + "...",
    });
    console.log("📊 Budget totals:", {
        p1: data["budget_p1_total_amount"],
        p2: data["budget_p2_total_amount"],
    });

    return data;
};

export const extractDataFromEditor = parseEditorContent;
