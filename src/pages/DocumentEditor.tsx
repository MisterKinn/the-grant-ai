import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
    MessageSquare,
    Save,
    Loader2,
    Lock,
    LogIn,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";
import {
    TiptapEditor,
    TiptapEditorHandle,
} from "@/components/app/TiptapEditor";
import { ChatPanel, ChatPanelHandle } from "@/components/app/ChatPanel";
import { ExportButton } from "@/components/app/ExportButton";
import {
    ChartPreview,
    ChartPreviewHandle,
    ChartData,
} from "@/components/app/ChartPreview";
import {
    BusinessInfoPanel,
    BusinessInfoPanelHandle,
    BusinessInfo,
} from "@/components/app/BusinessInfoPanel";
import {
    extractChartDataFromText,
    removeChartDataFromText,
} from "@/utils/chartDataParser";
import { EditableMarkdownContent } from "@/components/hwpx/EditableMarkdownContent";
import { HwpxDiagnosticTests } from "@/components/app/HwpxDiagnosticTests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
// PdfUploader removed - PDF text extraction now integrated into AI assistant

/**
 * Parse AI-generated markdown table to extract label:value pairs
 * Handles format: | 항목 | 내용 | with rows like | 소속 | 유노바 |
 */
function parseAiGeneratedValues(content: string): Map<string, string> {
    const values = new Map<string, string>();

    // Match markdown table rows: | label | value |
    const tableRowPattern = /^\|([^|]+)\|([^|]+)\|/gm;
    let match;

    while ((match = tableRowPattern.exec(content)) !== null) {
        const label = match[1].trim().replace(/\*\*/g, "");
        const value = match[2].trim();

        // Skip header row and separator
        if (label === "항목" || label === ":---" || label.includes("---"))
            continue;

        if (label && value) {
            values.set(label, value);
        }
    }

    // Also try colon format: 항목: 값
    const colonPattern = /^([^:：\n]+)[：:](.+)$/gm;
    while ((match = colonPattern.exec(content)) !== null) {
        const label = match[1].trim().replace(/\*\*/g, "");
        const value = match[2].trim();
        if (label && value && !values.has(label)) {
            values.set(label, value);
        }
    }

    console.log(
        "[parseAiGeneratedValues] Parsed",
        values.size,
        "values:",
        Array.from(values.entries()),
    );

    return values;
}

/**
 * Merge AI-generated values into the original HWPX HTML structure
 * Finds cells by their label text and fills the corresponding value cells
 * ENHANCED: Aggressive matching - fills ALL cells, handles complex table structures
 */
function mergeValuesIntoHwpxStructure(
    originalHtml: string,
    values: Map<string, string>,
): string {
    console.log(
        "[mergeValues] Starting AGGRESSIVE merge with",
        values.size,
        "values",
    );

    if (values.size === 0) {
        console.log("[mergeValues] No values to merge, returning original");
        return originalHtml;
    }

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(originalHtml, "text/html");

    // Build a map of normalized labels to their values for faster lookup
    const normalizedValues = new Map<string, string>();
    for (const [label, value] of values) {
        // Normalize: remove spaces, special chars, lowercase
        const normalized = label
            .replace(/\s+/g, "")
            .replace(/[^\w가-힣]/g, "")
            .toLowerCase();
        normalizedValues.set(normalized, value);
        // Also add the original label
        normalizedValues.set(label.trim(), value);
    }

    // Find all table rows
    const allRows = doc.querySelectorAll("tr");
    let matchCount = 0;
    const filledLabels = new Set<string>();

    allRows.forEach((row) => {
        const cells = row.querySelectorAll("td, th");

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            // Get cell text without placeholders
            const cellText =
                cell.textContent
                    ?.trim()
                    .replace(/\{\{[^}]+\}\}/g, "")
                    .trim() || "";
            const normalizedCellText = cellText
                .replace(/\s+/g, "")
                .replace(/[^\w가-힣]/g, "")
                .toLowerCase();

            // Try to find a matching value
            let matchedValue: string | undefined;
            let matchedLabel: string | undefined;

            // Try exact match first
            if (normalizedValues.has(cellText)) {
                matchedValue = normalizedValues.get(cellText);
                matchedLabel = cellText;
            }
            // Try normalized match
            else if (
                normalizedCellText &&
                normalizedValues.has(normalizedCellText)
            ) {
                matchedValue = normalizedValues.get(normalizedCellText);
                matchedLabel = normalizedCellText;
            }
            // Try partial match (label contains or is contained in cell text)
            else if (normalizedCellText) {
                for (const [label, value] of values) {
                    const normalizedLabel = label
                        .replace(/\s+/g, "")
                        .replace(/[^\w가-힣]/g, "")
                        .toLowerCase();
                    if (
                        normalizedCellText.includes(normalizedLabel) ||
                        normalizedLabel.includes(normalizedCellText)
                    ) {
                        if (
                            normalizedCellText.length > 1 &&
                            normalizedLabel.length > 1
                        ) {
                            matchedValue = value;
                            matchedLabel = label;
                            break;
                        }
                    }
                }
            }

            if (
                matchedValue &&
                matchedLabel &&
                !filledLabels.has(matchedLabel)
            ) {
                // Found a label - now fill the NEXT cell(s) in this row
                for (let j = i + 1; j < cells.length; j++) {
                    const nextCell = cells[j];
                    const nextCellText =
                        nextCell.textContent
                            ?.trim()
                            .replace(/\{\{[^}]+\}\}/g, "")
                            .trim() || "";

                    // Skip if this cell looks like another label (short text without placeholders that's in our value map)
                    const isAnotherLabel =
                        normalizedValues.has(nextCellText) ||
                        normalizedValues.has(
                            nextCellText
                                .replace(/\s+/g, "")
                                .replace(/[^\w가-힣]/g, "")
                                .toLowerCase(),
                        );

                    if (isAnotherLabel && nextCellText.length > 0) {
                        // This cell is a label, not a value cell - stop looking
                        break;
                    }

                    // Fill this cell if it's empty, has placeholder, or has any existing content
                    // (we overwrite with AI-generated content)
                    if (
                        nextCell.hasAttribute("data-placeholder") ||
                        nextCell.textContent?.includes("{{") ||
                        nextCellText === "" ||
                        nextCellText.length < 50
                    ) {
                        // Short text likely means unfilled
                        nextCell.textContent = matchedValue;
                        console.log(
                            `[mergeValues] ✓ Filled "${matchedLabel}" → "${matchedValue.substring(0, 30)}..."`,
                        );
                        matchCount++;
                        filledLabels.add(matchedLabel);
                        break;
                    }
                }
            }
        }
    });

    // Second pass: For any remaining values that weren't matched, try to find cells by data-original attribute
    for (const [label, value] of values) {
        if (filledLabels.has(label)) continue;

        const cellsWithOriginal = doc.querySelectorAll("[data-original]");
        cellsWithOriginal.forEach((cell) => {
            const original = cell.getAttribute("data-original") || "";
            if (original.includes(label) || label.includes(original)) {
                cell.textContent = value;
                console.log(
                    `[mergeValues] ✓ Filled via data-original "${label}"`,
                );
                matchCount++;
                filledLabels.add(label);
            }
        });
    }

    console.log(
        "[mergeValues] Matched and filled",
        matchCount,
        "cells out of",
        values.size,
        "values",
    );

    // Get the result and clean up placeholders
    const result = doc.body.innerHTML.replace(/\{\{[^}]+\}\}/g, "");

    console.log("[mergeValues] Merge complete");
    return result;
}

interface DocumentData {
    id: string;
    title: string;
    content: any;
    plain_text: string;
    status: string;
    created_at?: string;
    updated_at: string;
    support_type?: string;
    hwpx_template_path?: string;
}

export default function DocumentEditor() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { toast } = useToast();
    const { user, profile } = useAuth();

    const [document, setDocument] = useState<DocumentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState<any>(null);
    const [plainText, setPlainText] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [initialPromptSent, setInitialPromptSent] = useState(false);
    const [chartData, setChartData] = useState<ChartData | undefined>(
        undefined,
    );

    // 비로그인 사용자를 위한 로그인 유도 오버레이
    const [showGuestLoginOverlay, setShowGuestLoginOverlay] = useState(false);

    // 무료 회원을 위한 스크롤 감지 상태 (구독 유도 버튼 표시용)
    const [showSubscriptionCTA, setShowSubscriptionCTA] = useState(false);

    // HWPX 진단 테스트 패널 토글
    const [showDiagnosticTests, setShowDiagnosticTests] = useState(false);

    // PDF uploader removed - PDF text extraction now integrated into AI assistant

    const editorContentRef = useRef<any>(null);
    const editorRef = useRef<TiptapEditorHandle>(null);
    const chatPanelRef = useRef<ChatPanelHandle>(null);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const chartPreviewRef = useRef<ChartPreviewHandle>(null);
    const businessInfoRef = useRef<BusinessInfoPanelHandle>(null);

    // 2026 초기창업패키지 일반현황 정보
    const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);

    // 채팅 메시지 내용 (사용자가 제공한 정보 추출용)
    const [chatMessagesContent, setChatMessagesContent] = useState("");

    // Store original HWPX HTML structure (never overwritten by AI)
    const originalHwpxContentRef = useRef<string | null>(null);

    // 유료 회원 체크
    const isPaidUser =
        profile?.plan_type === "monthly" || profile?.plan_type === "season";
    const isRestrictedUser = !isPaidUser;
    const isGuestUser = !user;

    // [확인됨] 여기서 파일 경로를 받습니다.
    const initialPrompt = (location.state as any)?.initialPrompt;
    const stateIsCustomTemplate =
        (location.state as any)?.isCustomTemplate === true;
    const stateGrantType = (location.state as any)?.grantType;
    const uploadedFilePath = (location.state as any)?.uploadedFilePath;
    const uploadedFileName = (location.state as any)?.uploadedFileName;
    const stateHwpxParsedPlainText = (location.state as any)
        ?.hwpxParsedPlainText;
    const stateHwpxTemplatePath = (location.state as any)?.hwpxTemplatePath;

    // Derive grantType and hwpxTemplatePath from database OR location.state
    // Database takes precedence for persistence across sessions
    const isCustomTemplate =
        document?.support_type === "custom" || stateIsCustomTemplate;

    // Map support_type to grantType
    const deriveGrantTypeFromSupportType = (
        supportType?: string,
    ):
        | "PRE_STARTUP"
        | "YOUTH_ACADEMY"
        | "EARLY_STARTUP"
        | "STARTUP_CENTRAL"
        | "CUSTOM" => {
        switch (supportType) {
            case "early_startup":
                return "EARLY_STARTUP";
            case "youth_academy":
                return "YOUTH_ACADEMY";
            case "custom":
                return "CUSTOM";
            case "preliminary":
            default:
                return "PRE_STARTUP";
        }
    };

    const grantType = isCustomTemplate
        ? "CUSTOM"
        : stateGrantType ||
          deriveGrantTypeFromSupportType(document?.support_type);
    const supportType =
        document?.support_type ||
        (stateGrantType === "EARLY_STARTUP" ? "early_startup" : "preliminary");
    const hwpxTemplatePath =
        document?.hwpx_template_path || stateHwpxTemplatePath;
    const hwpxParsedPlainText = stateHwpxParsedPlainText;

    // Debug logging
    console.log(
        "[DocumentEditor] isCustomTemplate:",
        isCustomTemplate,
        "stateIsCustomTemplate:",
        stateIsCustomTemplate,
        "document?.support_type:",
        document?.support_type,
        "grantType:",
        grantType,
    );

    useEffect(() => {
        // Open chat when there's an initial prompt (both custom and standard templates)
        if (initialPrompt && !initialPromptSent) {
            setChatOpen(true);
        }
    }, [initialPrompt, initialPromptSent]);

    // 🔥 문서 ID 변경 시 상태 초기화 및 문서 로드
    useEffect(() => {
        // ID 변경 시 상태 초기화
        setDocument(null);
        setTitle("");
        setContent(null);
        setPlainText("");
        setLoading(true);
        editorContentRef.current = null;

        const fetchDocument = async () => {
            if (!id) return;

            // Guest document handling
            if (id.startsWith("guest-")) {
                try {
                    const stored = localStorage.getItem("guest_document");
                    if (stored) {
                        const guestDoc = JSON.parse(stored);
                        setDocument(guestDoc);
                        setTitle(guestDoc.title);
                        setContent(guestDoc.content || {});
                        setPlainText(guestDoc.plain_text || "");
                        editorContentRef.current = guestDoc.content || {};
                    } else {
                        toast({
                            variant: "destructive",
                            title: "문서를 찾을 수 없습니다",
                        });
                        navigate("/app");
                    }
                } catch {
                    toast({
                        variant: "destructive",
                        title: "문서를 불러오는데 실패했습니다",
                    });
                    navigate("/app");
                } finally {
                    setLoading(false);
                }
                return;
            }

            try {
                const { data, error } = await supabase
                    .from("documents")
                    .select("*")
                    .eq("id", id)
                    .maybeSingle();

                if (error) throw error;

                if (!data) {
                    toast({
                        variant: "destructive",
                        title: "문서를 찾을 수 없습니다",
                    });
                    navigate("/app");
                    return;
                }

                setDocument(data);
                setTitle(data.title);
                setContent(data.content || {});
                setPlainText(data.plain_text || "");
                editorContentRef.current = data.content || {};
            } catch (error: any) {
                console.error("Error fetching document:", error);
                toast({
                    variant: "destructive",
                    title: "오류",
                    description: "문서를 불러오는데 실패했습니다.",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchDocument();
    }, [id, navigate, toast]);

    // 비로그인 사용자가 문서 생성 후 AI 응답을 받으면 로그인 오버레이 표시
    useEffect(() => {
        if (isGuestUser && plainText.length >= 500 && !showGuestLoginOverlay) {
            setShowGuestLoginOverlay(true);
        }
    }, [isGuestUser, plainText, showGuestLoginOverlay]);

    // For CUSTOM templates: store original HWPX content in ref and set plainText
    useEffect(() => {
        if (isCustomTemplate && hwpxParsedPlainText && !loading && document) {
            // Store the original HWPX content in ref (NEVER overwrite this)
            if (!originalHwpxContentRef.current) {
                originalHwpxContentRef.current = hwpxParsedPlainText;
                console.log(
                    "[DocumentEditor] Stored original HWPX content, length:",
                    hwpxParsedPlainText.length,
                );
            }

            // If no initial prompt, just display the original content
            if (!initialPrompt) {
                setPlainText(hwpxParsedPlainText);
                setInitialPromptSent(true); // Prevent AI auto-trigger
            }
        }
    }, [
        isCustomTemplate,
        hwpxParsedPlainText,
        loading,
        document,
        initialPrompt,
    ]);

    // Auto-send initial prompt to AI for both custom and standard templates
    useEffect(() => {
        if (
            initialPrompt &&
            !initialPromptSent &&
            !loading &&
            document &&
            chatOpen &&
            chatPanelRef.current
        ) {
            setInitialPromptSent(true);
            setTimeout(() => {
                chatPanelRef.current?.sendMessage(initialPrompt);
            }, 100);
        }
    }, [initialPrompt, initialPromptSent, loading, document, chatOpen]);

    // 문서 내용이 충분히 생성된 후(약 1000자 이상) CTA 노출
    useEffect(() => {
        if (!isRestrictedUser) return;
        // 문서 내용이 1000자 이상일 때 구독 유도 표시
        if (plainText.length >= 1000 && !showSubscriptionCTA) {
            setShowSubscriptionCTA(true);
        }
    }, [plainText, isRestrictedUser, showSubscriptionCTA]);

    const saveDocument = async (showToast = false) => {
        if (!id) return;
        setSaving(true);

        try {
            // Guest document - save to localStorage
            if (id.startsWith("guest-")) {
                const guestDoc = {
                    id,
                    user_id: "guest",
                    title,
                    content: editorContentRef.current,
                    plain_text: plainText,
                    status: "draft",
                    created_at:
                        document?.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                };
                localStorage.setItem(
                    "guest_document",
                    JSON.stringify(guestDoc),
                );
                if (showToast)
                    toast({
                        title: "저장 완료",
                        description: "문서가 저장되었습니다.",
                    });
                return;
            }

            // Regular document - save to database
            const { error } = await supabase
                .from("documents")
                .update({
                    title,
                    content: editorContentRef.current,
                    plain_text: plainText,
                })
                .eq("id", id);

            if (error) throw error;
            if (showToast)
                toast({
                    title: "저장 완료",
                    description: "문서가 저장되었습니다.",
                });
        } catch (error: any) {
            console.error("Error saving document:", error);
            toast({
                variant: "destructive",
                title: "저장 실패",
                description: "문서 저장에 실패했습니다.",
            });
        } finally {
            setSaving(false);
        }
    };

    const debouncedSave = useDebouncedCallback(() => saveDocument(false), 2000);

    const handleContentUpdate = useCallback(
        (newContent: any, newPlainText: string) => {
            setContent(newContent);
            setPlainText(newPlainText);
            editorContentRef.current = newContent;
            debouncedSave();
        },
        [debouncedSave],
    );

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTitle(e.target.value);
        debouncedSave();
    };

    const handleDocumentContent = useCallback(
        (markdownContent: string, isCurrentlyStreaming: boolean) => {
            console.log(
                "[DocumentEditor] handleDocumentContent called, isCustomTemplate:",
                isCustomTemplate,
                "length:",
                markdownContent.length,
                "streaming:",
                isCurrentlyStreaming,
            );
            setIsStreaming(isCurrentlyStreaming);

            // 채팅 메시지 업데이트 (BusinessInfoPanel에서 사용자 입력 정보 추출용)
            if (chatPanelRef.current) {
                const messages = chatPanelRef.current.getMessages();
                const allContent = messages.map((m) => m.content).join("\n");
                setChatMessagesContent(allContent);
            }

            // Extract chart data from content if present
            const parsedChartData = extractChartDataFromText(markdownContent);
            if (parsedChartData) {
                setChartData(parsedChartData);
            }

            // Remove chart data blocks from content before setting to editor
            const cleanedContent = removeChartDataFromText(markdownContent);

            // For CUSTOM templates: merge AI values into original HWPX structure
            // CRITICAL: Always use the original content from ref, never the current plainText
            const originalContent =
                originalHwpxContentRef.current || hwpxParsedPlainText;
            if (isCustomTemplate && originalContent) {
                // Parse AI's markdown table to extract label:value pairs
                const aiValues = parseAiGeneratedValues(cleanedContent);
                console.log(
                    "[DocumentEditor] Parsed AI values:",
                    aiValues.size,
                    "entries",
                );
                console.log(
                    "[DocumentEditor] Using original HWPX content, length:",
                    originalContent.length,
                );

                // Merge values into the original HWPX structure (NOT the current plainText)
                const mergedContent = mergeValuesIntoHwpxStructure(
                    originalContent,
                    aiValues,
                );
                setPlainText(mergedContent);

                if (!isCurrentlyStreaming) {
                    debouncedSave();
                }
                return;
            }

            // For TiptapEditor (standard templates)
            if (editorRef.current) {
                editorRef.current.setMarkdownContent(cleanedContent);
            }

            // Always update plainText (works for both custom and standard templates)
            setPlainText(cleanedContent);

            // When streaming is complete
            if (!isCurrentlyStreaming) {
                if (editorRef.current) {
                    // Standard template: get content from Tiptap editor
                    setTimeout(() => {
                        const finalContent = (
                            editorRef.current as any
                        )?.editor?.getJSON?.();
                        const finalText =
                            (editorRef.current as any)?.editor?.getText?.() ||
                            cleanedContent;
                        if (finalContent) {
                            setContent(finalContent);
                            editorContentRef.current = finalContent;
                            setPlainText(finalText);
                        }
                        // Save immediately when streaming completes (not debounced)
                        saveDocument(false);
                    }, 100);
                } else {
                    // Custom template: content is already in plainText, just save immediately
                    saveDocument(false);
                }
            }
        },
        [isCustomTemplate, hwpxParsedPlainText],
    );

    // 3개 차트 캡처 함수
    const getChartImages = async (): Promise<{
        image_market_growth?: string;
        image_bm_diagram?: string;
        image_tam_sam_som?: string;
    }> => {
        const images: { [key: string]: string } = {};

        if (!chartPreviewRef.current) return images;

        const refs = chartPreviewRef.current.getRefs();

        try {
            // 1. Market Growth (인덱스 0)
            if (refs[0]) {
                const canvas = await html2canvas(refs[0], {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    logging: false,
                } as any);
                images.image_market_growth = canvas.toDataURL("image/png");
            }

            // 2. Business Model (인덱스 1)
            if (refs[1]) {
                const canvas = await html2canvas(refs[1], {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    logging: false,
                } as any);
                images.image_bm_diagram = canvas.toDataURL("image/png");
            }

            // 3. TAM/SAM/SOM (인덱스 2)
            if (refs[2]) {
                const canvas = await html2canvas(refs[2], {
                    scale: 2,
                    backgroundColor: "#ffffff",
                    logging: false,
                } as any);
                images.image_tam_sam_som = canvas.toDataURL("image/png");
            }
        } catch (error) {
            console.error("Chart capture error:", error);
        }

        return images;
    };

    const handleUpgradeClick = () => {
        navigate("/#pricing");
        setTimeout(() => {
            const pricingEl = window.document.getElementById("pricing");
            if (pricingEl) {
                pricingEl.scrollIntoView({ behavior: "smooth" });
            }
        }, 150);
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!document) return null;

    return (
        <div className="h-full flex flex-col">
            <header className="px-4 py-3 border-b border-border flex items-center gap-4 bg-card">
                <Input
                    value={title}
                    onChange={handleTitleChange}
                    className="text-lg font-semibold border-none bg-transparent focus-visible:ring-0 px-0 h-auto"
                    placeholder="제목 없는 문서"
                />
                <div className="flex items-center gap-2 ml-auto">
                    <ExportButton
                        title={title}
                        content={content}
                        plainText={plainText}
                        grantType={grantType}
                        supportType={supportType}
                        hwpxTemplatePath={hwpxTemplatePath}
                        originalPlainText={hwpxParsedPlainText}
                        businessInfo={businessInfo}
                        getLatestContent={() => {
                            // For custom templates, use plainText directly
                            if (isCustomTemplate) {
                                return { content: null, plainText };
                            }
                            // For standard templates, use editor content
                            const editor = editorRef.current?.editor;
                            return editor
                                ? {
                                      content: editor.getJSON(),
                                      plainText: editor.getText(),
                                  }
                                : null;
                        }}
                        getChartImages={getChartImages}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveDocument(true)}
                        disabled={saving}
                    >
                        {saving ? (
                            <Loader2 size={16} className="animate-spin mr-2" />
                        ) : (
                            <Save size={16} className="mr-2" />
                        )}
                        저장
                    </Button>
                    <Button
                        variant={chatOpen ? "default" : "outline"}
                        size="sm"
                        onClick={() => setChatOpen(!chatOpen)}
                    >
                        <MessageSquare size={16} className="mr-2" />
                        AI 어시스턴트
                    </Button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden relative min-h-0">
                <div
                    ref={editorContainerRef}
                    className={cn(
                        "flex-1 min-w-0 relative transition-all duration-300 overflow-y-auto",
                        chatOpen && "hidden md:block",
                    )}
                >
                    <div className="min-h-full">
                        {isCustomTemplate ? (
                            <div className="p-6 max-w-5xl mx-auto pb-32 space-y-4">
                                {/* HWPX 진단 테스트 패널 */}
                                <div className="border border-border rounded-lg overflow-hidden">
                                    <button
                                        onClick={() =>
                                            setShowDiagnosticTests(
                                                !showDiagnosticTests,
                                            )
                                        }
                                        className="w-full flex items-center justify-between p-3 bg-accent/50 hover:bg-accent transition-colors text-sm font-medium"
                                    >
                                        <span>
                                            🔬 HWPX 내보내기 진단 테스트
                                        </span>
                                        {showDiagnosticTests ? (
                                            <ChevronUp size={16} />
                                        ) : (
                                            <ChevronDown size={16} />
                                        )}
                                    </button>
                                    {showDiagnosticTests && (
                                        <div className="p-4">
                                            <HwpxDiagnosticTests
                                                templatePath={hwpxTemplatePath}
                                                markdownContent={plainText}
                                                fileName={
                                                    title || "custom_export"
                                                }
                                            />
                                        </div>
                                    )}
                                </div>

                                <EditableMarkdownContent
                                    key={`custom-${id}-${plainText.length}`}
                                    content={plainText}
                                    onContentChange={(newContent) => {
                                        setPlainText(newContent);
                                        debouncedSave();
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="min-h-full">
                                <TiptapEditor
                                    key={id}
                                    ref={editorRef}
                                    content={content}
                                    onUpdate={handleContentUpdate}
                                    isStreaming={isStreaming}
                                    slotAfterHeading={
                                        grantType === "EARLY_STARTUP" ? (
                                            <BusinessInfoPanel
                                                ref={businessInfoRef}
                                                defaultCompanyName={title}
                                                editorContent={plainText}
                                                chatContent={
                                                    chatMessagesContent
                                                }
                                                onChange={setBusinessInfo}
                                            />
                                        ) : undefined
                                    }
                                />
                            </div>
                        )}

                        {/* 차트 미리보기 영역 - 현재 비활성화 */}
                        {/* <div className="px-8 pb-8">
              <ChartPreview ref={chartPreviewRef} data={chartData} />
            </div> */}

                        {isRestrictedUser && showSubscriptionCTA && (
                            <div
                                className="absolute left-0 right-0 bottom-0 z-10 pointer-events-none select-none"
                                style={{
                                    top: "50%",
                                    background:
                                        "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.95) 15%, rgba(255,255,255,1) 100%)",
                                    backdropFilter: "blur(4px)",
                                }}
                            ></div>
                        )}
                    </div>

                    {isRestrictedUser && showSubscriptionCTA && (
                        <div className="sticky bottom-8 left-0 right-0 z-50 flex justify-center pointer-events-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-card/95 backdrop-blur border border-border rounded-2xl p-6 text-center shadow-2xl max-w-md mx-4">
                                <Lock
                                    size={32}
                                    className="mx-auto text-primary mb-3"
                                />
                                <h3 className="text-lg font-bold text-foreground mb-3">
                                    나머지 내용을 확인하려면
                                    <br />
                                    구독을 시작해주세요.
                                </h3>
                                <Button
                                    onClick={handleUpgradeClick}
                                    className="w-full font-semibold shadow-md"
                                >
                                    전체 내용 확인하기 (구독)
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {chatOpen && (
                    <div className="w-full md:w-96 shrink-0 border-l border-border bg-card">
                        <ChatPanel
                            ref={chatPanelRef}
                            documentContext={plainText}
                            onDocumentContent={handleDocumentContent}
                            documentId={id}
                            uploadedFilePath={uploadedFilePath}
                            uploadedFileName={uploadedFileName}
                            isCustomTemplate={isCustomTemplate}
                        />
                    </div>
                )}
            </div>

            {/* 비로그인 사용자용 로그인 유도 오버레이 */}
            {isGuestUser && showGuestLoginOverlay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 블러 배경 */}
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-md"
                        style={{
                            background:
                                "linear-gradient(to bottom, rgba(var(--background), 0.6) 0%, rgba(var(--background), 0.95) 100%)",
                        }}
                    />

                    {/* 로그인 유도 카드 */}
                    <div className="relative bg-card border border-border rounded-2xl p-8 text-center shadow-2xl max-w-md mx-4 animate-in fade-in zoom-in-95 duration-300">
                        <LogIn
                            size={48}
                            className="mx-auto text-primary mb-4"
                        />
                        <h3 className="text-xl font-bold text-foreground mb-2">
                            전체 내용을 확인하려면
                            <br />
                            로그인이 필요합니다
                        </h3>
                        <p className="text-muted-foreground mb-6 text-sm">
                            무료 회원가입 후 사업계획서 초안을 확인하세요.
                            <br />
                            로그인 후 작성 중인 문서가 자동으로 저장됩니다.
                        </p>
                        <div className="flex flex-col gap-3">
                            <Button
                                onClick={() => navigate("/auth")}
                                className="w-full font-semibold shadow-md"
                            >
                                <LogIn size={18} className="mr-2" />
                                로그인 / 회원가입
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => navigate("/")}
                                className="w-full text-muted-foreground"
                            >
                                나중에 하기
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
