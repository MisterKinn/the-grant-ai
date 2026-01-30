import {
    useState,
    useRef,
    useEffect,
    forwardRef,
    useImperativeHandle,
    useCallback,
} from "react";
import {
    Send,
    Loader2,
    Trash2,
    Bot,
    User,
    FileText,
    Upload,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChatPanelProps {
    documentContext?: string;
    onDocumentContent?: (content: string, isStreaming: boolean) => void;
    documentId?: string;
    uploadedFilePath?: string | null;
    uploadedFileName?: string | null;
    isCustomTemplate?: boolean;
    onFileUploaded?: (filePath: string, fileName: string) => void;
}

export interface ChatPanelHandle {
    sendMessage: (message: string) => void;
    getMessages: () => { role: string; content: string }[];
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(
    function ChatPanel(
        {
            documentContext,
            onDocumentContent,
            documentId,
            uploadedFilePath,
            uploadedFileName,
            isCustomTemplate,
            onFileUploaded,
        },
        ref,
    ) {
        const { toast } = useToast();
        const [localUploadedFile, setLocalUploadedFile] = useState<{
            path: string;
            name: string;
        } | null>(null);

        // Use either props or local upload state
        const currentFilePath =
            uploadedFilePath || localUploadedFile?.path || null;
        const currentFileName =
            uploadedFileName || localUploadedFile?.name || null;

        const {
            messages,
            isLoading,
            sendMessage: sendChatMessage,
            clearMessages,
        } = useChat(
            documentContext,
            onDocumentContent,
            documentId,
            currentFilePath,
            currentFileName,
            isCustomTemplate,
        );

        const [input, setInput] = useState("");
        const messagesEndRef = useRef<HTMLDivElement>(null);
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);
        const [summaryRequested, setSummaryRequested] = useState(false);
        const [isDragging, setIsDragging] = useState(false);
        const [isUploading, setIsUploading] = useState(false);
        // Expose sendMessage and getMessages methods to parent
        useImperativeHandle(
            ref,
            () => ({
                sendMessage: (message: string) => {
                    if (message.trim() && !isLoading) {
                        sendChatMessage(message);
                    }
                },
                getMessages: () =>
                    messages.map((m) => ({ role: m.role, content: m.content })),
            }),
            [isLoading, sendChatMessage, messages],
        );

        useEffect(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, [messages]);

        // Auto-request business plan generation when a PDF file is uploaded
        useEffect(() => {
            if (
                currentFilePath &&
                currentFileName &&
                !summaryRequested &&
                !isLoading
            ) {
                const isPdf = currentFileName.toLowerCase().endsWith(".pdf");
                if (isPdf) {
                    setSummaryRequested(true);
                    setTimeout(() => {
                        sendChatMessage(
                            `업로드된 PDF 파일 "${currentFileName}"을 바탕으로 사업 계획서를 작성해줘.`,
                        );
                    }, 500);
                }
            }
        }, [
            currentFilePath,
            currentFileName,
            summaryRequested,
            isLoading,
            sendChatMessage,
        ]);

        const handleFileUpload = useCallback(
            async (file: File) => {
                if (!file) return;

                const isPdf = file.name.toLowerCase().endsWith(".pdf");
                if (!isPdf) {
                    toast({
                        variant: "destructive",
                        title: "지원하지 않는 파일 형식",
                        description: "PDF 파일만 업로드할 수 있습니다.",
                    });
                    return;
                }

                if (file.size > 20 * 1024 * 1024) {
                    toast({
                        variant: "destructive",
                        title: "파일 크기 초과",
                        description: "20MB 이하의 파일만 업로드할 수 있습니다.",
                    });
                    return;
                }

                setIsUploading(true);
                setSummaryRequested(false);

                try {
                    const {
                        data: { user },
                    } = await supabase.auth.getUser();
                    if (!user) {
                        toast({
                            variant: "destructive",
                            title: "로그인 필요",
                            description:
                                "파일 업로드를 위해 로그인이 필요합니다.",
                        });
                        return;
                    }

                    const fileExt = file.name.split(".").pop();
                    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

                    const { error: uploadError } = await supabase.storage
                        .from("user-uploads")
                        .upload(fileName, file);

                    if (uploadError) throw uploadError;

                    setLocalUploadedFile({ path: fileName, name: file.name });

                    if (onFileUploaded) {
                        onFileUploaded(fileName, file.name);
                    }

                    toast({
                        title: "업로드 완료",
                        description: `${file.name} 파일이 업로드되었습니다.`,
                    });
                } catch (error) {
                    console.error("File upload error:", error);
                    toast({
                        variant: "destructive",
                        title: "업로드 실패",
                        description: "파일 업로드 중 오류가 발생했습니다.",
                    });
                } finally {
                    setIsUploading(false);
                }
            },
            [toast, onFileUploaded],
        );

        const handleDragOver = useCallback((e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
        }, []);

        const handleDragLeave = useCallback((e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
        }, []);

        const handleDrop = useCallback(
            (e: React.DragEvent) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFileUpload(files[0]);
                }
            },
            [handleFileUpload],
        );

        const handleFileInputChange = (
            e: React.ChangeEvent<HTMLInputElement>,
        ) => {
            const file = e.target.files?.[0];
            if (file) {
                handleFileUpload(file);
            }
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        };

        const clearUploadedFile = () => {
            setLocalUploadedFile(null);
            setSummaryRequested(false);
        };

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (input.trim() && !isLoading) {
                sendChatMessage(input);
                setInput("");
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
            }
        };

        return (
            <div
                className={cn(
                    "flex flex-col h-full bg-card border-l border-border relative",
                    isDragging && "ring-2 ring-primary ring-inset",
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag overlay */}
                {isDragging && (
                    <div className="absolute inset-0 bg-primary/10 z-10 flex items-center justify-center pointer-events-none">
                        <div className="bg-card border-2 border-dashed border-primary rounded-lg p-8 text-center">
                            <Upload
                                size={48}
                                className="mx-auto text-primary mb-2"
                            />
                            <p className="text-primary font-medium">
                                PDF 파일을 여기에 놓으세요
                            </p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Bot size={20} className="text-primary" />
                        <h3 className="font-semibold text-foreground">
                            AI 어시스턴트
                        </h3>
                    </div>
                    {messages.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearMessages}
                            className="text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 size={16} />
                        </Button>
                    )}
                </div>

                {/* Uploaded file indicator */}
                {currentFileName && (
                    <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center gap-2">
                        <FileText size={16} className="text-primary shrink-0" />
                        <span className="text-sm text-foreground truncate flex-1">
                            {currentFileName}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearUploadedFile}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                            <X size={14} />
                        </Button>
                    </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                            <Bot size={48} className="mb-4 text-primary/50" />
                            <p className="text-sm font-medium">AI 어시스턴트</p>
                            <p className="text-xs mt-2 max-w-[200px]">
                                "문제인식 파트 작성해줘" 또는 "전체 사업계획서
                                작성해줘"라고 요청하세요.
                            </p>
                            <p className="text-xs mt-1 text-primary">
                                작성된 내용은 좌측 에디터에 자동으로 삽입됩니다.
                            </p>
                            <div className="mt-4 p-4 border border-dashed border-border rounded-lg">
                                <Upload
                                    size={24}
                                    className="mx-auto text-muted-foreground mb-2"
                                />
                                <p className="text-xs">
                                    PDF 파일을 드래그하거나 아래 버튼으로
                                    업로드하세요
                                </p>
                            </div>
                        </div>
                    ) : (
                        messages.map((message, index) => (
                            <div
                                key={index}
                                className={cn(
                                    "flex gap-3",
                                    message.role === "user"
                                        ? "justify-end"
                                        : "justify-start",
                                )}
                            >
                                {message.role === "assistant" && (
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <Bot
                                            size={16}
                                            className="text-primary"
                                        />
                                    </div>
                                )}
                                <div
                                    className={cn(
                                        "max-w-[80%] rounded-xl px-4 py-2 text-sm",
                                        message.role === "user"
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-foreground",
                                    )}
                                >
                                    <div className="whitespace-pre-wrap">
                                        {message.content}
                                    </div>
                                </div>
                                {message.role === "user" && (
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <User
                                            size={16}
                                            className="text-muted-foreground"
                                        />
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                    {isLoading &&
                        messages[messages.length - 1]?.role === "user" && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <Bot size={16} className="text-primary" />
                                </div>
                                <div className="bg-muted rounded-xl px-4 py-2">
                                    <Loader2
                                        size={16}
                                        className="animate-spin text-primary"
                                    />
                                </div>
                            </div>
                        )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Hidden file input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept=".pdf"
                    className="hidden"
                />

                {/* Input */}
                <form
                    onSubmit={handleSubmit}
                    className="p-4 border-t border-border"
                >
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="shrink-0"
                            title="PDF 파일 업로드"
                        >
                            {isUploading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Upload size={18} />
                            )}
                        </Button>
                        <Textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="예: 문제인식 파트 작성해줘"
                            className="min-h-[44px] max-h-32 resize-none"
                            rows={1}
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!input.trim() || isLoading}
                            className="shrink-0"
                        >
                            {isLoading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Send size={18} />
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        );
    },
);
