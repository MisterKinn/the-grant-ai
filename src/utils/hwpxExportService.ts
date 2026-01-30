/**
 * HWPX 내보내기 서비스 (텍스트 치환 전용)
 * 전략: ZIP 재구성 + mimetype 무압축 보장
 */

import JSZip from "jszip";
import { ProjectData } from "./editorParser";

// 이미지 마커 - 이미지 삽입은 복잡하므로 빈 문자열로 치환
const IMAGE_MARKERS_TO_REMOVE = [
    "{{IMAGE_MARKET_GROWTH}}",
    "{{IMAGE_BM_DIAGRAM}}",
    "{{IMAGE_TAM_SAM_SOM}}",
    "{{IMAGE_PROBLEM_PROCESS}}",
];

// 네임스페이스 접두어 감지 함수
const detectNamespacePrefix = (xmlContent: string): string => {
    const match = xmlContent.match(/<(\w+):p\b/);
    return match ? match[1] : "hp";
};

/**
 * XML 특수문자 이스케이프
 */
const escapeXmlChars = (text: string): string => {
    if (text === undefined || text === null) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
};

/**
 * 문단 강제 분리 (Hard Paragraph Split)
 */
const processMultiLineText = (text: string, prefix: string): string => {
    if (!text) return "";

    let s = String(text);

    // 모든 줄바꿈 문자를 \n으로 통일
    s = s
        .replace(/\\n/g, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\r\n|\r/g, "\n");

    const paragraphs = s.split("\n");
    const escapedParagraphs = paragraphs.map((p) => escapeXmlChars(p));
    const hardSplitTag = `</${prefix}:t></${prefix}:run></${prefix}:p><${prefix}:p><${prefix}:run><${prefix}:t>`;

    return escapedParagraphs.join(hardSplitTag);
};

const skipXmlTag = (s: string, i: number): number => {
    if (s[i] !== "<") return i;
    const end = s.indexOf(">", i);
    return end === -1 ? i : end + 1;
};

const skipWhitespace = (s: string, i: number): number => {
    while (i < s.length && /\s/.test(s[i])) i++;
    return i;
};

const tryMatchOpenDoubleBrace = (
    s: string,
    start: number,
): { openStart: number; openEnd: number } | null => {
    let i = start;
    if (s[i] !== "{") return null;
    const openStart = i;
    i++;
    while (i < s.length) {
        i = skipWhitespace(s, i);
        if (s[i] === "<") {
            i = skipXmlTag(s, i);
            continue;
        }
        break;
    }
    if (s[i] !== "{") return null;
    i++;
    return { openStart, openEnd: i };
};

const findCloseDoubleBrace = (
    s: string,
    start: number,
): { closeStart: number; closeEnd: number } | null => {
    let i = start;
    while (i < s.length) {
        const idx = s.indexOf("}", i);
        if (idx === -1) return null;
        let j = idx + 1;
        while (j < s.length) {
            j = skipWhitespace(s, j);
            if (s[j] === "<") {
                j = skipXmlTag(s, j);
                continue;
            }
            break;
        }
        if (s[j] === "}") {
            return { closeStart: idx, closeEnd: j + 1 };
        }
        i = idx + 1;
    }
    return null;
};

const cleanXmlPlaceholders = (
    content: string,
): { cleaned: string; cleanedCount: number } => {
    let result = "";
    let cursor = 0;
    let cleanedCount = 0;

    while (cursor < content.length) {
        const nextOpen = content.indexOf("{", cursor);
        if (nextOpen === -1) {
            result += content.substring(cursor);
            break;
        }
        result += content.substring(cursor, nextOpen);

        const open = tryMatchOpenDoubleBrace(content, nextOpen);
        if (!open) {
            result += "{";
            cursor = nextOpen + 1;
            continue;
        }

        const close = findCloseDoubleBrace(content, open.openEnd);
        if (!close) {
            result += content.substring(open.openStart);
            break;
        }

        const rawInside = content.substring(open.openEnd, close.closeStart);
        const cleanedText = rawInside
            .replace(/<[^>]+>/g, "")
            .replace(/[ \t]+/g, "")
            .replace(/[\r\n]+/g, "")
            .trim();

        const isValidVarName = /^[a-zA-Z0-9_]+$/.test(cleanedText);

        if (isValidVarName && cleanedText.length > 0) {
            const originalSnippet = content.substring(
                open.openStart,
                close.closeEnd,
            );
            const normalized = `{{${cleanedText}}}`;
            if (originalSnippet !== normalized) cleanedCount++;
            result += normalized;
        } else {
            result += content.substring(open.openStart, close.closeEnd);
        }
        cursor = close.closeEnd;
    }
    return { cleaned: result, cleanedCount };
};

/**
 * 체크박스 치환 함수
 * 템플릿의 빈 셀(체크박스 영역)에 ☑ 또는 ☐ 문자 삽입
 * 구조: 빈 셀 <hp:run.../> 다음에 텍스트 셀 <hp:t>옵션</hp:t>
 */
const replaceCheckboxes = (content: string, data: ProjectData): string => {
    let result = content;
    const prefix = detectNamespacePrefix(content);

    // 지원 분야 체크박스 (제조, 지식서비스)
    const supportFieldOptions = ["제조", "지식서비스"];
    const selectedSupportField = data["support_field"] || "";

    for (const option of supportFieldOptions) {
        const isSelected = selectedSupportField === option;
        const checkChar = isSelected ? "☑ " : "☐ ";

        // 빈 run 태그 바로 앞의 옵션 텍스트를 찾아서 체크박스 문자 추가
        // 패턴: <hp:t>옵션</hp:t> → <hp:t>☑ 옵션</hp:t> 또는 <hp:t>☐ 옵션</hp:t>
        const pattern = new RegExp(
            `(<${prefix}:t>)(${escapeRegExp(option)})(</${prefix}:t>)`,
            "g",
        );
        result = result.replace(pattern, `$1${checkChar}$2$3`);
    }

    // 전문기술분야 체크박스
    const techFieldOptions = [
        { text: "기계·소재", variations: ["기계·소재", "기계.소재"] },
        { text: "전기·전자", variations: ["전기·전자", "전기.전자"] },
        { text: "정보·통신", variations: ["정보·통신", "정보.통신"] },
        { text: "화공·섬유", variations: ["화공·섬유", "화공.섬유"] },
        {
            text: "바이오·의료·생명",
            variations: ["바이오·의료·생명", "바이오.의료.생명"],
        },
        { text: "에너지·자원", variations: ["에너지·자원", "에너지.자원"] },
        { text: "공예·디자인", variations: ["공예·디자인", "공예.디자인"] },
    ];
    const selectedTechField = data["tech_field"] || "";
    const normalizedSelectedTech = selectedTechField.replace(/·/g, ".");

    for (const { text, variations } of techFieldOptions) {
        const normalizedText = text.replace(/·/g, ".");
        const isSelected =
            normalizedSelectedTech === normalizedText ||
            selectedTechField === text;
        const checkChar = isSelected ? "☑ " : "☐ ";

        for (const variant of variations) {
            const pattern = new RegExp(
                `(<${prefix}:t>)(${escapeRegExp(variant)})(</${prefix}:t>)`,
                "g",
            );
            result = result.replace(pattern, `$1${checkChar}$2$3`);
        }
    }

    // 지방우대 지역 체크박스
    const regionOptions = [
        "특별지원 지역",
        "우대지원 지역",
        "일반지역",
        "지방우대 비해당 지역",
    ];
    const selectedRegion = data["region_type"] || "";

    for (const option of regionOptions) {
        const isSelected = selectedRegion === option;
        const checkChar = isSelected ? "☑ " : "☐ ";

        const pattern = new RegExp(
            `(<${prefix}:t>)(${escapeRegExp(option)})(</${prefix}:t>)`,
            "g",
        );
        result = result.replace(pattern, `$1${checkChar}$2$3`);
    }

    return result;
};

// 정규식 특수문자 이스케이프
const escapeRegExp = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * 지역별 자기부담비율 계산
 * - 특별지원 지역: 정부 90%, 자기부담 10% (현금만)
 * - 우대지원 지역: 정부 80%, 자기부담 20% (현금 10%, 현물 10%)
 * - 일반지역: 정부 75%, 자기부담 25% (현금 10%, 현물 15%)
 * - 지방우대 비해당 지역: 정부 70%, 자기부담 30% (현금 10%, 현물 20%)
 */
const getRegionRatios = (
    regionType: string,
): { govRatio: number; cashRatio: number; physicalRatio: number } => {
    switch (regionType) {
        case "특별지원 지역":
            return { govRatio: 0.9, cashRatio: 0.1, physicalRatio: 0 };
        case "우대지원 지역":
            return { govRatio: 0.8, cashRatio: 0.1, physicalRatio: 0.1 };
        case "일반지역":
            return { govRatio: 0.75, cashRatio: 0.1, physicalRatio: 0.15 };
        case "지방우대 비해당 지역":
            return { govRatio: 0.7, cashRatio: 0.1, physicalRatio: 0.2 };
        default:
            return { govRatio: 0.75, cashRatio: 0.1, physicalRatio: 0.15 }; // 기본값: 일반지역
    }
};

/**
 * 금액을 천원 단위 문자열로 변환 (예: 3000000 → "3,000천원")
 */
const formatThousandWon = (amount: number): string => {
    const thousands = Math.round(amount / 1000);
    return `${thousands.toLocaleString()}천원`;
};

/**
 * 사업비 집행 계획 데이터 계산
 * BusinessInfo의 비목별 금액과 산출 근거를 사용
 * 정부지원사업비는 최대 1억원(100,000천원)
 */
const calculateBudgetData = (data: ProjectData): ProjectData => {
    const regionType = data["region_type"] || "일반지역";
    const { govRatio, cashRatio, physicalRatio } = getRegionRatios(regionType);

    // 정부지원사업비 (사용자 입력값 또는 기본 1억원)
    const govAmount = Number(data["budget_gov_amount"]) || 100000000;

    // 총사업비 계산 (정부지원사업비 / 정부비율)
    const totalProjectAmount = Math.round(govAmount / govRatio);
    const selfCashAmount = Math.round(totalProjectAmount * cashRatio);
    const selfPhysicalAmount = Math.round(totalProjectAmount * physicalRatio);

    // 일반현황 표의 사업비 (백만원 단위)
    data["budget_gov"] = `${Math.round(govAmount / 1000000)}백만원`;
    data["budget_self_cash"] = `${Math.round(selfCashAmount / 1000000)}백만원`;
    data["budget_self_kind"] =
        selfPhysicalAmount > 0
            ? `${Math.round(selfPhysicalAmount / 1000000)}백만원`
            : "0";
    data["budget_total"] = `${Math.round(totalProjectAmount / 1000000)}백만원`;

    // 사업비 집행 계획 표 - BusinessInfo에서 비목별 금액 가져오기
    const budgetItems = {
        material: Number(data["budget_material_amount"]) || 3000000,
        personnel: Number(data["budget_personnel_amount"]) || 50000000,
        outsourcing: Number(data["budget_outsourcing_amount"]) || 20000000,
        advertising: Number(data["budget_advertising_amount"]) || 10000000,
        commission: Number(data["budget_commission_amount"]) || 5000000,
        activity: Number(data["budget_activity_amount"]) || 7000000,
        etc: Number(data["budget_etc_amount"]) || 5000000,
    };

    // 각 비목에 대해 자기부담(현금/현물) 계산
    let totalGovSum = 0;
    let totalCashSum = 0;
    let totalPhysicalSum = 0;
    let totalAllSum = 0;

    for (const [key, govBudget] of Object.entries(budgetItems)) {
        // 해당 비목의 총 금액 = 정부지원 / 정부비율
        const totalItemAmount = Math.round(govBudget / govRatio);
        const cashAmount = Math.round(totalItemAmount * cashRatio);
        const physicalAmount = Math.round(totalItemAmount * physicalRatio);
        const totalAmount = govBudget + cashAmount + physicalAmount;

        totalGovSum += govBudget;
        totalCashSum += cashAmount;
        totalPhysicalSum += physicalAmount;
        totalAllSum += totalAmount;

        // 천원 단위로 변환
        data[`budget_${key}_amount`] = formatThousandWon(govBudget);
        data[`cash_${key}_amount`] = formatThousandWon(cashAmount);
        data[`physical_${key}_amount`] =
            physicalAmount > 0 ? formatThousandWon(physicalAmount) : "-";
        data[`total_${key}_amount`] = formatThousandWon(totalAmount);

        // 산출 근거 (BusinessInfo에서 가져오기)
        const basisKey = `budget_${key}_basis`;
        if (!data[basisKey] || data[basisKey] === "") {
            // 기본 산출 근거
            const defaultBasis: Record<string, string> = {
                material: "개발 장비 및 재료 구매",
                personnel: "개발 인력 인건비",
                outsourcing: "전문 외주 개발 비용",
                advertising: "마케팅 및 홍보비",
                commission: "법률/회계 자문료",
                activity: "창업 활동 비용",
                etc: "기타 운영 비용",
            };
            data[basisKey] = defaultBasis[key] || "";
        }
    }

    // physical_budget_material_amount (템플릿의 오타 대응)
    data["physical_budget_material_amount"] =
        data["physical_material_amount"] || "-";

    // 합계 행
    data["total_grant"] = formatThousandWon(totalGovSum);
    data["total_cash"] = formatThousandWon(totalCashSum);
    data["total_physical"] =
        totalPhysicalSum > 0 ? formatThousandWon(totalPhysicalSum) : "-";
    data["total_for_all"] = formatThousandWon(totalAllSum);

    return data;
};

/**
 * 변수 치환 함수
 */
const replaceVariables = (
    content: string,
    data: ProjectData,
    prefix: string,
): {
    result: string;
    replacedVars: string[];
    emptyVars: string[];
} => {
    const replacedVars: string[] = [];
    const emptyVars: string[] = [];

    const { cleaned: cleanedContent } = cleanXmlPlaceholders(content);

    const varPattern = /\{\{([a-zA-Z0-9_]+)\}\}/g;

    let substituted = cleanedContent.replace(varPattern, (match, varName) => {
        const rawValue = (data as any)?.[varName];
        const value =
            rawValue === undefined || rawValue === null ? "" : String(rawValue);

        if (value.trim() !== "") {
            replacedVars.push(varName);
            return processMultiLineText(value, prefix);
        } else {
            emptyVars.push(varName);
            return "";
        }
    });

    // 잔여 플레이스홀더 정리
    const completePattern = /\{\{[^}]*\}\}/g;
    substituted = substituted.replace(completePattern, "");
    const incompletePattern = /\{\{[a-zA-Z0-9_]+\}/g;
    substituted = substituted.replace(incompletePattern, "");

    return { result: substituted, replacedVars, emptyVars };
};

/**
 * 지원사업 유형에 따른 템플릿 경로 결정
 */
const getTemplatePath = (supportType?: string): string => {
    switch (supportType) {
        case "early_startup":
            return "/template_2026_early.hwpx";
        case "preliminary":
        default:
            return "/template_2025_pre.hwpx";
    }
};

/**
 * UTF-8 문자열을 Uint8Array로 변환
 */
const stringToUint8Array = (str: string): Uint8Array => {
    return new TextEncoder().encode(str);
};

/**
 * HWPX 메인 내보내기 함수 (텍스트 치환 전용)
 *
 * CRITICAL: HWPX 파일 구조 요구사항
 * 1. mimetype 파일이 ZIP의 첫 번째 엔트리여야 함
 * 2. mimetype 파일은 압축되지 않아야 함 (STORE 메서드)
 * 3. mimetype 내용은 정확히 "application/hwp+zip"이어야 함
 */
export const exportToHwpx = async (
    data: ProjectData,
    fileName: string,
    supportType?: string,
): Promise<void> => {
    try {
        // 지역별 자기부담비율에 따른 사업비 데이터 계산
        const enrichedData = calculateBudgetData({ ...data });

        const templatePath = getTemplatePath(supportType);
        console.log(
            `🚀 HWPX 내보내기: ${fileName}, template: ${templatePath}, supportType: ${supportType}`,
        );
        console.log(`📊 [DEBUG] ========== 상세 진단 시작 ==========`);
        console.log(`📊 [DEBUG] region_type: ${enrichedData["region_type"]}`);
        console.log(`📊 [DEBUG] budget_gov: ${enrichedData["budget_gov"]}`);

        const response = await fetch(templatePath);
        if (!response.ok)
            throw new Error(`Template load failed: ${response.status}`);

        const originalArrayBuffer = await response.arrayBuffer();
        console.log(
            `📊 [DEBUG] 원본 템플릿 크기: ${originalArrayBuffer.byteLength} bytes`,
        );

        const originalZip = await JSZip.loadAsync(originalArrayBuffer);

        // 파일 목록 로깅
        const allFiles = Object.keys(originalZip.files);
        console.log(
            `📁 전체 파일 목록 (${allFiles.length}개):`,
            allFiles.join(", "),
        );

        // mimetype 상세 확인
        const mimetypeFile = originalZip.file("mimetype");
        if (mimetypeFile) {
            const mimetypeContent = await mimetypeFile.async("string");
            const mimetypeBytes = await mimetypeFile.async("uint8array");
            console.log(`📄 [DEBUG] mimetype 내용: "${mimetypeContent}"`);
            console.log(
                `📄 [DEBUG] mimetype 바이트 길이: ${mimetypeBytes.length}`,
            );
            console.log(
                `📄 [DEBUG] mimetype 압축 여부: ${mimetypeFile.options?.compression || "unknown"}`,
            );
        } else {
            console.error(`❌ [DEBUG] mimetype 파일 없음!`);
        }

        // 각 파일의 압축 정보 로깅
        console.log(`📊 [DEBUG] 원본 파일별 압축 정보:`);
        for (const filePath of allFiles.slice(0, 15)) {
            const file = originalZip.files[filePath];
            if (!file.dir) {
                const content = await file.async("uint8array");
                console.log(
                    `  - ${filePath}: ${content.length} bytes, dir=${file.dir}`,
                );
            }
        }

        const xmlFiles = allFiles.filter((f) => f.endsWith(".xml"));
        console.log(`📁 XML 파일 목록: ${xmlFiles.join(", ")}`);

        // 수정된 XML 파일들을 저장할 맵
        const modifiedXmlFiles = new Map<string, string>();
        let totalReplacements = 0;

        for (const xmlFile of xmlFiles) {
            let fileContent = await originalZip.file(xmlFile)?.async("string");
            if (!fileContent) continue;

            const prefix = detectNamespacePrefix(fileContent);

            // ============================================
            // CRITICAL FIX: linesegarray 요소 제거
            // linesegarray는 라인 레이아웃 정보(horzsize, textpos 등)를 담고 있음
            // 텍스트 치환 후 이 값들이 유효하지 않게 되어 문서가 손상됨
            // 2025 템플릿: 0개, 2026 템플릿: 451개 (이것이 손상의 원인)
            // ============================================
            const linesegBefore = (
                fileContent.match(/<hp:linesegarray>/g) || []
            ).length;
            if (linesegBefore > 0) {
                fileContent = fileContent.replace(
                    /<hp:linesegarray>.*?<\/hp:linesegarray>/gs,
                    "",
                );
                console.log(
                    `🔧 ${xmlFile}: ${linesegBefore}개 linesegarray 제거`,
                );
            }

            // 이미지 마커 제거
            for (const marker of IMAGE_MARKERS_TO_REMOVE) {
                if (fileContent.includes(marker)) {
                    console.log(`🖼️ 이미지 마커 제거: ${marker}`);
                    fileContent = fileContent.replace(
                        new RegExp(marker.replace(/[{}]/g, "\\$&"), "g"),
                        "",
                    );
                }
            }

            // 체크박스 치환 (☐ → ☑)
            const beforeCheckboxCount = (fileContent.match(/☐/g) || []).length;
            fileContent = replaceCheckboxes(fileContent, enrichedData);
            const afterCheckboxCount = (fileContent.match(/☐/g) || []).length;
            const checkboxReplacements =
                beforeCheckboxCount - afterCheckboxCount;
            if (checkboxReplacements > 0) {
                console.log(
                    `☑ ${xmlFile}: ${checkboxReplacements}개 체크박스 치환`,
                );
            }

            const { result, replacedVars } = replaceVariables(
                fileContent,
                enrichedData,
                prefix,
            );

            if (replacedVars.length > 0 || checkboxReplacements > 0) {
                modifiedXmlFiles.set(xmlFile, result);
                totalReplacements += replacedVars.length;
                console.log(
                    `📝 ${xmlFile}: ${replacedVars.length}개 변수 치환`,
                );
            }
        }

        console.log(`✅ 총 ${totalReplacements}개 텍스트 항목 처리 완료`);

        // ============================================
        // HWPX 파일 재구성 (2025와 동일한 파일 순서 강제)
        // ============================================
        console.log(`📊 [DEBUG] ========== HWPX 파일 재구성 ==========`);

        // HWPX 파일 순서 (2025 템플릿과 동일)
        const HWPX_FILE_ORDER = [
            "mimetype",
            "version.xml",
            "Contents/header.xml",
            "Contents/section0.xml",
            "Preview/PrvText.txt",
            "Scripts/headerScripts",
            "Scripts/sourceScripts",
            "settings.xml",
            "Preview/PrvImage.png",
            "META-INF/container.rdf",
            "Contents/content.hpf",
            "META-INF/container.xml",
            "META-INF/manifest.xml",
        ];

        // 새 ZIP 생성 - 정확한 파일 순서로
        const newZip = new JSZip();

        for (const filePath of HWPX_FILE_ORDER) {
            const file = originalZip.files[filePath];
            if (!file) {
                console.log(`⚠️ [DEBUG] 파일 없음 (스킵): ${filePath}`);
                continue;
            }

            if (filePath === "mimetype") {
                // mimetype은 정확한 내용으로, STORE 압축
                newZip.file("mimetype", "application/hwp+zip", {
                    compression: "STORE",
                });
                console.log(`📄 [DEBUG] mimetype 추가 (STORE)`);
            } else if (modifiedXmlFiles.has(filePath)) {
                // 수정된 XML 파일
                const modifiedContent = modifiedXmlFiles.get(filePath)!;
                newZip.file(filePath, modifiedContent, {
                    compression: "DEFLATE",
                });
                console.log(`📝 [DEBUG] 수정된 파일 추가: ${filePath}`);
            } else {
                // 원본 파일 그대로
                const content = await file.async("uint8array");
                const shouldStore =
                    filePath.endsWith(".png") ||
                    filePath.endsWith(".jpg") ||
                    filePath.startsWith("Scripts/");
                newZip.file(filePath, content, {
                    compression: shouldStore ? "STORE" : "DEFLATE",
                });
                console.log(
                    `📄 [DEBUG] 원본 파일 추가: ${filePath} (${shouldStore ? "STORE" : "DEFLATE"})`,
                );
            }
        }

        // ZIP 생성
        const arrayBuffer = await newZip.generateAsync({
            type: "arraybuffer",
        });

        console.log(`📦 Generated HWPX size: ${arrayBuffer.byteLength} bytes`);

        if (arrayBuffer.byteLength < 100) {
            throw new Error(
                "Generated HWPX file is too small - template may not have loaded correctly",
            );
        }

        // ============================================
        // 다운로드
        // ============================================
        const finalName = fileName.endsWith(".hwpx")
            ? fileName
            : `${fileName}.hwpx`;
        const blob = new Blob([arrayBuffer], {
            type: "application/vnd.hancom.hwpx",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`✅ HWPX 내보내기 완료: ${finalName}`);
    } catch (e) {
        console.error("❌ HWPX Export Error:", e);
        throw e;
    }
};
/**
 * 🧪 테스트 1: 템플릿을 그대로 다운로드 (JSZip 처리 없음)
 * 이것이 안 되면 템플릿 파일 자체에 문제가 있음
 */
export const testDownloadRawTemplate = async (
    supportType?: string,
): Promise<void> => {
    const templatePath =
        supportType === "early_startup"
            ? "/template_2026_early.hwpx"
            : "/template_2025_pre.hwpx";

    console.log(`🧪 Raw template download test: ${templatePath}`);

    const response = await fetch(templatePath);
    if (!response.ok)
        throw new Error(`Template load failed: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();
    console.log(`📦 Raw template size: ${arrayBuffer.byteLength} bytes`);

    const blob = new Blob([arrayBuffer], {
        type: "application/vnd.hancom.hwpx",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `raw_test_${supportType || "pre"}.hwpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * 🧪 테스트 2: 템플릿을 JSZip으로 로드 후 아무 수정 없이 재생성
 * 이것이 안 되면 JSZip 재생성 로직에 문제가 있음
 */
export const testJszipPassthrough = async (
    supportType?: string,
): Promise<void> => {
    const templatePath =
        supportType === "early_startup"
            ? "/template_2026_early.hwpx"
            : "/template_2025_pre.hwpx";

    console.log(`🧪 JSZip passthrough test: ${templatePath}`);

    const response = await fetch(templatePath);
    if (!response.ok)
        throw new Error(`Template load failed: ${response.status}`);

    const originalArrayBuffer = await response.arrayBuffer();
    console.log(`📦 Original size: ${originalArrayBuffer.byteLength} bytes`);

    const originalZip = await JSZip.loadAsync(originalArrayBuffer);
    const allFiles = Object.keys(originalZip.files);
    console.log(`📁 Files in ZIP: ${allFiles.length}`);

    // 새 ZIP 생성 (2025와 완전히 동일한 방식)
    const newZip = new JSZip();

    // 1. mimetype을 첫 번째로 추가 (압축 안 함)
    newZip.file("mimetype", "application/hwp+zip", { compression: "STORE" });

    // 2. 나머지 파일들을 순서대로 추가
    const orderedFiles = allFiles
        .filter((f) => f !== "mimetype" && !originalZip.files[f].dir)
        .sort();

    for (const filePath of orderedFiles) {
        const file = originalZip.files[filePath];
        if (file.dir) continue;

        const content = await file.async("uint8array");

        // PNG, Scripts 등은 STORE, 나머지는 DEFLATE
        const shouldStore =
            filePath.endsWith(".png") ||
            filePath.endsWith(".jpg") ||
            filePath.endsWith(".jpeg") ||
            filePath.startsWith("Scripts/");

        newZip.file(filePath, content, {
            compression: shouldStore ? "STORE" : "DEFLATE",
        });
    }

    // CRITICAL: generateAsync에서 compression 옵션을 제거해야 함
    // 이 옵션이 있으면 개별 파일에 설정한 compression이 무시됨
    const arrayBuffer = await newZip.generateAsync({
        type: "arraybuffer",
        // compression 옵션 제거 - 개별 파일 설정 유지
    });

    console.log(`📦 Regenerated size: ${arrayBuffer.byteLength} bytes`);

    const blob = new Blob([arrayBuffer], {
        type: "application/vnd.hancom.hwpx",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jszip_test_${supportType || "pre"}.hwpx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
