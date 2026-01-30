import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { ChartNode } from "@/components/editor/extensions/ChartNode";
import {
    useEffect,
    useCallback,
    useRef,
    useImperativeHandle,
    forwardRef,
} from "react";
import {
    Bold,
    Italic,
    Heading1,
    Heading2,
    Heading3,
    Undo,
    Redo,
    ImageIcon,
    Loader2,
    TableIcon,
    Merge,
    SplitSquareHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TiptapEditorProps {
    content: any;
    onUpdate: (content: any, plainText: string) => void;
    placeholder?: string;
    isStreaming?: boolean;
    /** Optional slot to render after the heading (before the main table) */
    slotAfterHeading?: React.ReactNode;
}

export interface TiptapEditorHandle {
    setMarkdownContent: (markdown: string) => void;
    clearContent: () => void;
    editor: ReturnType<typeof useEditor> | null;
}

export const TiptapEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
    (
        {
            content,
            onUpdate,
            placeholder = "AI가 사업계획서를 작성합니다...",
            isStreaming = false,
            slotAfterHeading,
        },
        ref,
    ) => {
        const fileInputRef = useRef<HTMLInputElement>(null);
        const { toast } = useToast();
        const [uploading, setUploading] = useState(false);
        const [, forceUpdate] = useState({});
        const streamingRef = useRef(false);
        const selectionUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

        // Ensure content is valid for Tiptap - must be string or proper JSON structure
        const initialContent =
            content && typeof content === "object" && content.type === "doc"
                ? content
                : "";

        const editor = useEditor({
            extensions: [
                StarterKit.configure({
                    hardBreak: {
                        keepMarks: true,
                    },
                    // 리스트 기능 비활성화 - HWPX 파싱 정확도를 위해
                    bulletList: false,
                    orderedList: false,
                    listItem: false,
                }),
                Placeholder.configure({
                    placeholder,
                    emptyEditorClass: "is-editor-empty",
                    showOnlyWhenEditable: true,
                    showOnlyCurrent: true,
                }),
                Image.configure({
                    inline: false,
                    allowBase64: true,
                }),
                Table.configure({
                    resizable: true,
                    HTMLAttributes: {
                        class: "border-collapse border border-border",
                    },
                }),
                TableRow,
                TableCell.configure({
                    HTMLAttributes: {
                        class: "border border-border p-2",
                    },
                }),
                TableHeader.configure({
                    HTMLAttributes: {
                        class: "border border-border p-2 bg-muted font-semibold",
                    },
                }),
                Markdown.configure({
                    html: true,
                    transformPastedText: true,
                    transformCopiedText: true,
                }),
                ChartNode,
            ],
            content: initialContent,
            onUpdate: ({ editor }) => {
                if (!streamingRef.current) {
                    const json = editor.getJSON();
                    const text = editor.getText();
                    onUpdate(json, text);
                }
            },
            // Debounced selection update for better performance during table cell drag
            onSelectionUpdate: () => {
                if (selectionUpdateTimeoutRef.current) {
                    clearTimeout(selectionUpdateTimeoutRef.current);
                }
                selectionUpdateTimeoutRef.current = setTimeout(() => {
                    forceUpdate({});
                }, 50);
            },
        });

        // Update streaming ref when prop changes
        useEffect(() => {
            streamingRef.current = isStreaming;
        }, [isStreaming]);

        // Expose methods to parent via ref
        useImperativeHandle(
            ref,
            () => ({
                setMarkdownContent: (markdown: string) => {
                    if (!editor) return;
                    // Set content directly - real-time streaming from API
                    editor.commands.setContent(markdown);
                },
                clearContent: () => {
                    if (editor) {
                        editor.commands.clearContent();
                    }
                },
                // Expose editor for getting final content after streaming
                editor,
            }),
            [editor],
        );

        useEffect(() => {
            if (
                editor &&
                !streamingRef.current &&
                content &&
                typeof content === "object" &&
                content.type === "doc"
            ) {
                const currentContent = JSON.stringify(editor.getJSON());
                const newContent = JSON.stringify(content);
                if (currentContent !== newContent) {
                    editor.commands.setContent(content);
                }
            }
        }, [content, editor]);

        const handleImageUpload = async (file: File) => {
            if (!file.type.startsWith("image/")) {
                toast({
                    variant: "destructive",
                    title: "오류",
                    description: "이미지 파일만 업로드할 수 있습니다.",
                });
                return;
            }

            setUploading(true);
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) throw new Error("Not authenticated");

                const fileExt = file.name.split(".").pop();
                const fileName = `${user.id}/${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from("project_files")
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                // Use signed URL for private bucket (7 days expiration)
                const { data: signedData, error: signError } =
                    await supabase.storage
                        .from("project_files")
                        .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

                if (signError) throw signError;
                if (!signedData?.signedUrl)
                    throw new Error("Failed to generate signed URL");

                editor
                    ?.chain()
                    .focus()
                    .setImage({ src: signedData.signedUrl })
                    .run();

                // Store file metadata for future URL regeneration
                await supabase.from("uploaded_files").insert({
                    user_id: user.id,
                    file_name: file.name,
                    file_path: fileName,
                    file_type: file.type,
                    file_size: file.size,
                });

                toast({
                    title: "업로드 완료",
                    description: "이미지가 삽입되었습니다.",
                });
            } catch (error: any) {
                console.error("Error uploading image:", error);
                toast({
                    variant: "destructive",
                    title: "업로드 실패",
                    description: "이미지 업로드에 실패했습니다.",
                });
            } finally {
                setUploading(false);
            }
        };

        const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                handleImageUpload(file);
            }
            e.target.value = "";
        };

        const ToolbarButton = useCallback(
            ({
                onClick,
                isActive,
                children,
                disabled,
            }: {
                onClick: () => void;
                isActive?: boolean;
                children: React.ReactNode;
                disabled?: boolean;
            }) => (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onClick}
                    disabled={disabled}
                    className={cn(
                        "h-8 w-8 p-0",
                        isActive && "bg-muted text-primary",
                    )}
                >
                    {children}
                </Button>
            ),
            [],
        );

        if (!editor) {
            return null;
        }

        return (
            <div className="flex flex-col h-full">
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                />

                {/* Toolbar */}
                <div className="border-b border-border px-4 py-2 flex items-center gap-1 flex-wrap bg-card">
                    <ToolbarButton
                        onClick={() =>
                            editor.chain().focus().toggleBold().run()
                        }
                        isActive={editor.isActive("bold")}
                    >
                        <Bold size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() =>
                            editor.chain().focus().toggleItalic().run()
                        }
                        isActive={editor.isActive("italic")}
                    >
                        <Italic size={16} />
                    </ToolbarButton>
                    <div className="w-px h-6 bg-border mx-1" />
                    <ToolbarButton
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 1 })
                                .run()
                        }
                        isActive={editor.isActive("heading", { level: 1 })}
                    >
                        <Heading1 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 2 })
                                .run()
                        }
                        isActive={editor.isActive("heading", { level: 2 })}
                    >
                        <Heading2 size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() =>
                            editor
                                .chain()
                                .focus()
                                .toggleHeading({ level: 3 })
                                .run()
                        }
                        isActive={editor.isActive("heading", { level: 3 })}
                    >
                        <Heading3 size={16} />
                    </ToolbarButton>
                    <div className="w-px h-6 bg-border mx-1" />
                    <ToolbarButton
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <ImageIcon size={16} />
                        )}
                    </ToolbarButton>

                    {/* Table dropdown menu - 셀 병합/분할만 지원, 추가/삭제는 제거 */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "h-8 w-8 p-0",
                                    editor.isActive("table") &&
                                        "bg-muted text-primary",
                                )}
                            >
                                <TableIcon size={16} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem
                                onClick={() =>
                                    editor.chain().focus().mergeCells().run()
                                }
                                disabled={!editor.can().mergeCells()}
                            >
                                <Merge size={14} className="mr-2" />셀 병합
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() =>
                                    editor.chain().focus().splitCell().run()
                                }
                                disabled={!editor.can().splitCell()}
                            >
                                <SplitSquareHorizontal
                                    size={14}
                                    className="mr-2"
                                />
                                셀 분할
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="w-px h-6 bg-border mx-1" />
                    <ToolbarButton
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                    >
                        <Undo size={16} />
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                    >
                        <Redo size={16} />
                    </ToolbarButton>
                </div>

                {/* Editor */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                    {/* Slot rendered at the top of editor area for 일반현황 panel */}
                    {slotAfterHeading && (
                        <div className="mb-6">{slotAfterHeading}</div>
                    )}
                    <EditorContent
                        editor={editor}
                        className="prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)]"
                    />
                </div>

                <style>{`
        .ProseMirror {
          outline: none;
          min-height: 100%;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: hsl(var(--muted-foreground));
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror h1 {
          font-size: 2em;
          font-weight: 700;
          margin-bottom: 0.5em;
        }
        .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin-bottom: 0.5em;
        }
        .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin-bottom: 0.5em;
        }
        .ProseMirror p {
          margin-bottom: 1em;
        }
        .ProseMirror ul {
          padding-left: 1.5em;
          margin-bottom: 1em;
          list-style-type: disc;
        }
        .ProseMirror ol {
          padding-left: 1.5em;
          margin-bottom: 1em;
          list-style-type: decimal;
        }
        .ProseMirror ul li,
        .ProseMirror ol li {
          margin-bottom: 0.25em;
        }
        .ProseMirror ul li::marker {
          color: hsl(var(--foreground));
        }
        .ProseMirror ol li::marker {
          color: hsl(var(--foreground));
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1em 0;
        }
        .ProseMirror table {
          border-collapse: collapse;
          margin: 1em 0;
          width: 100%;
          table-layout: fixed;
          border: 1px solid hsl(var(--border));
        }
        .ProseMirror th,
        .ProseMirror td {
          border: 1px solid hsl(var(--border));
          padding: 0.75em 1em;
          text-align: left;
          vertical-align: top;
          min-width: 80px;
          position: relative;
        }
        .ProseMirror th {
          background-color: hsl(var(--muted));
          font-weight: 600;
        }
        .ProseMirror tr:nth-child(even) td {
          background-color: hsl(var(--muted) / 0.3);
        }
        .ProseMirror table p {
          margin: 0;
        }
        /* Cell selection highlight - multiple cells selected */
        .ProseMirror .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: hsl(var(--primary) / 0.2);
          pointer-events: none;
        }
        .ProseMirror .selectedCell {
          background-color: hsl(var(--muted) / 0.5) !important;
        }
        .ProseMirror.is-streaming p.is-editor-empty:first-child::before {
          display: none;
        }
      `}</style>
            </div>
        );
    },
);
