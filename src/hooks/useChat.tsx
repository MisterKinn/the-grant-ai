import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "./use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

// Extract content between tags incrementally
function extractTagContent(
    text: string,
    startTag: string,
    endTag: string,
): { content: string; isComplete: boolean } {
    const startIdx = text.indexOf(startTag);
    if (startIdx === -1) return { content: "", isComplete: false };

    const contentStart = startIdx + startTag.length;
    const endIdx = text.indexOf(endTag, contentStart);

    if (endIdx === -1) {
        // Tag started but not closed yet - return partial content
        return { content: text.slice(contentStart).trim(), isComplete: false };
    }

    return {
        content: text.slice(contentStart, endIdx).trim(),
        isComplete: true,
    };
}

export function useChat(
    documentContext?: string,
    onDocumentContent?: (content: string, isStreaming: boolean) => void,
    documentId?: string,
    // ▼▼▼ [추가] 파일 정보를 인자로 받습니다 ▼▼▼
    uploadedFilePath?: string | null,
    uploadedFileName?: string | null,
    isCustomTemplate?: boolean,
    grantType?: string | null, // 2026 초창패: "EARLY_STARTUP", 2025 예창패: "PRE_STARTUP"
) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const fullResponseRef = useRef("");
    const prevDocumentIdRef = useRef<string | undefined>(undefined);

    // 🔥 채팅 기록 로드 (documentId 기반) - documentId 변경 시 항상 리셋
    useEffect(() => {
        // documentId가 변경되면 상태 리셋
        if (prevDocumentIdRef.current !== documentId) {
            setMessages([]);
            prevDocumentIdRef.current = documentId;
        }

        if (!documentId) return;

        const loadMessages = async () => {
            try {
                // 해당 문서의 대화 찾기
                const { data: conversation } = await supabase
                    .from("chat_conversations")
                    .select("id")
                    .eq("document_id", documentId)
                    .maybeSingle();

                if (conversation) {
                    // 대화 메시지 로드
                    const { data: chatMessages } = await supabase
                        .from("chat_messages")
                        .select("role, content")
                        .eq("conversation_id", conversation.id)
                        .order("created_at", { ascending: true });

                    if (chatMessages && chatMessages.length > 0) {
                        setMessages(
                            chatMessages.map((m) => ({
                                role: m.role as "user" | "assistant",
                                content: m.content,
                            })),
                        );
                    }
                }
            } catch (error) {
                console.error("Failed to load chat messages:", error);
            }
        };

        loadMessages();
    }, [documentId]);

    // 🔥 메시지 저장 함수
    const saveMessages = useCallback(
        async (newMessages: ChatMessage[]) => {
            if (!documentId) return;

            try {
                // 현재 사용자 확인
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) return;

                // 대화 찾거나 생성
                let { data: conversation } = await supabase
                    .from("chat_conversations")
                    .select("id")
                    .eq("document_id", documentId)
                    .maybeSingle();

                if (!conversation) {
                    const { data: newConv } = await supabase
                        .from("chat_conversations")
                        .insert({ document_id: documentId, user_id: user.id })
                        .select("id")
                        .single();
                    conversation = newConv;
                }

                if (!conversation) return;

                // 기존 메시지 삭제 후 새로 저장
                await supabase
                    .from("chat_messages")
                    .delete()
                    .eq("conversation_id", conversation.id);

                if (newMessages.length > 0) {
                    await supabase.from("chat_messages").insert(
                        newMessages.map((m) => ({
                            conversation_id: conversation!.id,
                            role: m.role,
                            content: m.content,
                        })),
                    );
                }
            } catch (error) {
                console.error("Failed to save chat messages:", error);
            }
        },
        [documentId],
    );

    const sendMessage = useCallback(
        async (content: string) => {
            if (!content.trim() || isLoading) return;

            // 🔥 grantType에 따른 지시 추가 (Edge Function 수정 불가 시 프론트엔드에서 처리)
            let additionalInstruction = "";
            if (grantType === "EARLY_STARTUP") {
                additionalInstruction = `

[중요 지시 1 - 일반현황 정보 추출]
사용자가 제공한 정보에서 아래 필드를 추출하여 작성하세요. 정보가 없으면 합리적으로 추론하세요:
- 기업명: {{info_company_name}}
- 개업연월일: {{info_est_date}} (YYYY.MM.DD 형식)
- 사업자등록번호: {{info_reg_number}} (000-00-00000 형식)
- 사업자 소재지: {{info_address}}
- 사업자 구분: 개인사업자 또는 법인사업자
- 대표자 유형: 단독, 공동, 각자대표 중 하나
- 창업아이템명: {{item_name}}
- 산출물: {{target_output}}
- 지원분야: 제조 또는 지식서비스
- 전문기술분야: 기계·소재, 전기·전자, 정보·통신, 화공·섬유, 바이오·의료·생명, 에너지·자원, 공예·디자인 중 하나

[중요 지시 2 - 2-3 정부지원사업비 집행계획 표 형식]
반드시 아래 6열 단일 표 형식으로 작성하세요. 절대 1단계/2단계로 분리하지 마세요!
금액은 반드시 "3,000,000" 형식으로 작성하세요. "3,000천원" 같은 형식은 절대 사용하지 마세요!

| 비 목 | 집행 계획 | 정부지원사업비(ⓐ) | 자기부담사업비(ⓑ) 현금 | 자기부담사업비(ⓑ) 현물 | 합계(ⓐ+ⓑ) |
| :--- | :--- | ---: | ---: | ---: | ---: |
| 재료비 | [집행 계획] | 3,000,000 | 300,000 | 0 | 3,300,000 |
| 인건비 | [집행 계획] | 5,000,000 | 500,000 | 0 | 5,500,000 |
| 외주용역비 | [집행 계획] | 10,000,000 | 1,000,000 | 0 | 11,000,000 |
| 광고선전비 | [집행 계획] | 2,000,000 | 200,000 | 0 | 2,200,000 |
| 지급수수료 | [집행 계획] | 1,000,000 | 100,000 | 0 | 1,100,000 |
| 창업활동비 | [집행 계획] | 3,000,000 | 300,000 | 0 | 3,300,000 |
| 기타 | [집행 계획] | 1,000,000 | 100,000 | 0 | 1,100,000 |
| **합 계** | | **25,000,000** | **2,500,000** | **0** | **27,500,000** |

`;
            } else if (grantType === "PRE_STARTUP") {
                additionalInstruction = `

[중요 지시 - 2-3 정부지원사업비 집행계획 표 형식]
반드시 1단계/2단계로 분리된 3열 표 형식으로 작성하세요.
금액은 반드시 "3,000,000" 형식으로 작성하세요. "3,000천원" 같은 형식은 절대 사용하지 마세요!

**<1단계 정부지원사업비 집행계획>**
| 비 목 | 산 출 근 거 | 정부지원사업비(원) |
| :--- | :--- | ---: |
| 재료비 | [산출 근거] | 3,000,000 |
...

**<2단계 정부지원사업비 집행계획>**
| 비 목 | 산 출 근 거 | 정부지원사업비(원) |
| :--- | :--- | ---: |
| 재료비 | [산출 근거] | 5,000,000 |
...

`;
            }

            const enhancedContent = additionalInstruction + content;
            const userMsg: ChatMessage = { role: "user", content: enhancedContent };
            // UI에는 원본 메시지만 표시
            setMessages((prev) => [...prev, { role: "user", content }]);
            setIsLoading(true);
            fullResponseRef.current = "";

            // Add initial "writing" message
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "AI가 사업계획서를 작성 중입니다...",
                },
            ]);

            let documentStarted = false;
            let streamError = false;

            try {
                // Get the current session for JWT auth (optional for guest users)
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                // For guest users, use the publishable key instead of session token
                const authHeader = session?.access_token
                    ? `Bearer ${session.access_token}`
                    : `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;

                const resp = await fetch(CHAT_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: authHeader,
                    },
                    body: JSON.stringify({
                        messages: [...messages, userMsg],
                        documentContext,
                        // ▼▼▼ [핵심] 여기에 파일 정보를 실어 보냅니다! ▼▼▼
                        uploadedFilePath,
                        uploadedFileName,
                        isCustomTemplate,
                        grantType, // 2026 초창패: "EARLY_STARTUP", 2025 예창패: "PRE_STARTUP"
                    }),
                });

                if (resp.status === 429) {
                    toast({
                        variant: "destructive",
                        title: "요청 제한",
                        description:
                            "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
                    });
                    setMessages((prev) => prev.slice(0, -1)); // Remove loading message
                    setIsLoading(false);
                    return;
                }

                if (resp.status === 402) {
                    toast({
                        variant: "destructive",
                        title: "크레딧 부족",
                        description:
                            "크레딧이 부족합니다. 플랜을 구독하여 충전하세요.",
                        action: (
                            <ToastAction
                                altText="구독하러 가기"
                                onClick={() =>
                                    (window.location.href = "/#pricing")
                                }
                            >
                                구독하러 가기
                            </ToastAction>
                        ),
                        duration: 10000,
                    });
                    setMessages((prev) => prev.slice(0, -1)); // Remove loading message
                    setIsLoading(false);
                    return;
                }

                if (!resp.ok || !resp.body) {
                    throw new Error("Failed to start stream");
                }

                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let textBuffer = "";
                let streamDone = false;

                while (!streamDone) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    textBuffer += decoder.decode(value, { stream: true });

                    let newlineIndex: number;
                    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
                        let line = textBuffer.slice(0, newlineIndex);
                        textBuffer = textBuffer.slice(newlineIndex + 1);

                        if (line.endsWith("\r")) line = line.slice(0, -1);
                        if (line.startsWith(":") || line.trim() === "")
                            continue;
                        if (!line.startsWith("data: ")) continue;

                        const jsonStr = line.slice(6).trim();
                        if (jsonStr === "[DONE]") {
                            streamDone = true;
                            break;
                        }

                        try {
                            const parsed = JSON.parse(jsonStr);

                            // Check for mid-stream errors (e.g., rate limiting)
                            if (parsed.error) {
                                console.error(
                                    "SSE stream error:",
                                    parsed.error,
                                );
                                const errorMessage =
                                    parsed.error?.metadata?.raw ||
                                    parsed.error?.message ||
                                    "AI 생성 중 오류가 발생했습니다.";

                                // Check if it's a rate limit error
                                if (
                                    errorMessage.includes("429") ||
                                    errorMessage.includes(
                                        "RESOURCE_EXHAUSTED",
                                    ) ||
                                    errorMessage.includes("Resource exhausted")
                                ) {
                                    toast({
                                        variant: "destructive",
                                        title: "요청 제한",
                                        description:
                                            "AI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.",
                                    });
                                } else {
                                    toast({
                                        variant: "destructive",
                                        title: "생성 오류",
                                        description:
                                            "문서 생성 중 오류가 발생했습니다. 다시 시도해주세요.",
                                    });
                                }
                                streamError = true;
                                streamDone = true;
                                break;
                            }

                            const delta = parsed.choices?.[0]?.delta
                                ?.content as string | undefined;
                            if (delta) {
                                fullResponseRef.current += delta;

                                // Stream document content in real-time
                                const docResult = extractTagContent(
                                    fullResponseRef.current,
                                    "[DOCUMENT]",
                                    "[/DOCUMENT]",
                                );
                                if (docResult.content && onDocumentContent) {
                                    if (!documentStarted) {
                                        documentStarted = true;
                                        console.log(
                                            "[useChat] Document streaming started",
                                        );
                                    }
                                    // Stream to editor in real-time
                                    console.log(
                                        "[useChat] Streaming content length:",
                                        docResult.content.length,
                                    );
                                    onDocumentContent(
                                        docResult.content,
                                        !docResult.isComplete,
                                    );
                                }
                            }
                        } catch {
                            textBuffer = line + "\n" + textBuffer;
                            break;
                        }
                    }
                }

                // Final flush
                if (textBuffer.trim()) {
                    for (let raw of textBuffer.split("\n")) {
                        if (!raw) continue;
                        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
                        if (raw.startsWith(":") || raw.trim() === "") continue;
                        if (!raw.startsWith("data: ")) continue;
                        const jsonStr = raw.slice(6).trim();
                        if (jsonStr === "[DONE]") continue;
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const delta = parsed.choices?.[0]?.delta
                                ?.content as string | undefined;
                            if (delta) {
                                fullResponseRef.current += delta;
                            }
                        } catch {
                            /* ignore partial leftovers */
                        }
                    }
                }

                // Extract final chat message and update
                const chatResult = extractTagContent(
                    fullResponseRef.current,
                    "[CHAT]",
                    "[/CHAT]",
                );
                let finalChatMessage: string;

                if (streamError) {
                    finalChatMessage =
                        "⚠️ 문서 생성 중 오류가 발생했습니다. 다시 시도해주세요.";
                } else {
                    finalChatMessage =
                        chatResult.content ||
                        "작성이 완료되었습니다. 좌측 에디터를 확인해주세요.";
                }

                // Update the assistant message with final content
                setMessages((prev) => {
                    const newMessages = [...prev];
                    if (
                        newMessages.length > 0 &&
                        newMessages[newMessages.length - 1].role === "assistant"
                    ) {
                        newMessages[newMessages.length - 1] = {
                            role: "assistant",
                            content: finalChatMessage,
                        };
                    }
                    // 🔥 메시지 저장 (에러 시에도 저장하여 기록 유지)
                    if (!streamError) {
                        saveMessages(newMessages);
                    }
                    return newMessages;
                });

                // Final document content update (mark as complete) - only if no error
                if (!streamError) {
                    const docResult = extractTagContent(
                        fullResponseRef.current,
                        "[DOCUMENT]",
                        "[/DOCUMENT]",
                    );
                    if (docResult.content && onDocumentContent) {
                        onDocumentContent(docResult.content, false);
                    }
                }
            } catch (e) {
                console.error("Chat error:", e);
                setMessages((prev) => prev.slice(0, -1)); // Remove loading message
                toast({
                    variant: "destructive",
                    title: "오류",
                    description: "메시지 전송에 실패했습니다.",
                });
            } finally {
                setIsLoading(false);
            }
        },
        // ▼▼▼ [중요] dependency array에 uploadedFilePath 추가 ▼▼▼
        [
            messages,
            documentContext,
            isLoading,
            toast,
            onDocumentContent,
            saveMessages,
            uploadedFilePath,
            uploadedFileName,
            isCustomTemplate,
        ],
    );

    const clearMessages = useCallback(() => {
        setMessages([]);
        // 🔥 저장된 메시지도 삭제
        saveMessages([]);
    }, [saveMessages]);

    return { messages, isLoading, sendMessage, clearMessages };
}
