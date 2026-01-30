import { useState } from "react";
import { Download, FileText, Loader2, FileType } from "lucide-react";
import {
    Document as DocxDocument,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    VerticalAlign,
    AlignmentType,
    ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { extractDataFromEditor } from "@/utils/editorParser";
import { exportToHwpx } from "@/utils/hwpxExportService";
import { exportCustomHwpxFull } from "@/utils/hwpxCustomExportService";
import { useAuth } from "@/hooks/useAuth";
import { BusinessInfo } from "@/components/app/BusinessInfoPanel";

// Grant type
type GrantType =
    | "PRE_STARTUP"
    | "YOUTH_ACADEMY"
    | "EARLY_STARTUP"
    | "STARTUP_CENTRAL"
    | "CUSTOM";

// Grant type display names
const GRANT_TYPE_NAMES: Record<GrantType, string> = {
    PRE_STARTUP: "2025 예비창업패키지",
    YOUTH_ACADEMY: "2025 청년창업사관학교",
    EARLY_STARTUP: "2026 초기창업패키지",
    STARTUP_CENTRAL: "2025 창업중심대학",
    CUSTOM: "커스텀 양식",
};

interface ExportButtonProps {
    title: string;
    content: any;
    plainText: string;
    getLatestContent?: () => { content: any; plainText: string } | null;
    grantType?: GrantType;
    supportType?: string;
    hwpxTemplatePath?: string;
    originalPlainText?: string;
    businessInfo?: BusinessInfo | null;
    getChartImages?: () => Promise<{
        image_market_growth?: string;
        image_bm_diagram?: string;
        image_tam_sam_som?: string;
    }>;
}

// Section 0 data structure
interface Section0Data {
    itemName: string;
    category: string;
    overview: string;
    problem: string;
    solution: string;
    growth: string;
    team: string;
}

// Extract Section 0 data from Tiptap content
const extractSection0Data = (content: any): Section0Data | null => {
    if (!content?.content || !Array.isArray(content.content)) return null;

    // Find the Section 0 table
    for (const node of content.content) {
        if (node.type === "table" && node.content) {
            const data: Section0Data = {
                itemName: "",
                category: "",
                overview: "",
                problem: "",
                solution: "",
                growth: "",
                team: "",
            };

            // Extract text from cell
            const getCellText = (cell: any): string => {
                if (!cell?.content) return "";
                return cell.content
                    .map((p: any) => {
                        if (p.type === "paragraph" && p.content) {
                            return p.content
                                .map((t: any) => t.text || "")
                                .join("");
                        }
                        return "";
                    })
                    .join("\n");
            };

            // Process rows
            for (let rowIdx = 0; rowIdx < node.content.length; rowIdx++) {
                const row = node.content[rowIdx];
                if (row.type !== "tableRow" || !row.content) continue;

                const cells = row.content;

                // Row 0: 명칭 + 범주
                if (rowIdx === 0 && cells.length >= 4) {
                    data.itemName = getCellText(cells[1]);
                    data.category = getCellText(cells[3]);
                }
                // Row 1: 범주 (duplicate row in some templates, skip)
                // Row 2: 아이템 개요
                else if (rowIdx === 2 && cells.length >= 2) {
                    data.overview = getCellText(cells[1]);
                }
                // Row 3: 문제 인식
                else if (rowIdx === 3 && cells.length >= 2) {
                    data.problem = getCellText(cells[1]);
                }
                // Row 4: 실현 가능성
                else if (rowIdx === 4 && cells.length >= 2) {
                    data.solution = getCellText(cells[1]);
                }
                // Row 5: 성장전략
                else if (rowIdx === 5 && cells.length >= 2) {
                    data.growth = getCellText(cells[1]);
                }
                // Row 6: 팀 구성
                else if (rowIdx === 6 && cells.length >= 2) {
                    data.team = getCellText(cells[1]);
                }
            }

            // Only return if we found meaningful data
            if (data.itemName || data.overview || data.problem) {
                return data;
            }
        }
    }

    return null;
};

// Create Section 0 table with exact government template styling
const createSection0Table = (data: Section0Data): Table => {
    // Total table width in DXA (1 inch = 1440 DXA, A4 width ~= 9638 DXA)
    const TOTAL_WIDTH = 9638;
    const COL_15 = Math.round(TOTAL_WIDTH * 0.15); // 15%
    const COL_35 = Math.round(TOTAL_WIDTH * 0.35); // 35%

    // Styling constants
    const HEADER_FILL = "E7E6E6"; // Light gray for labels
    const BORDER_CONFIG = {
        top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
    };

    // Helper to create a label cell (gray background, centered, bold)
    const createLabelCell = (text: string, rowSpan: number = 1): TableCell => {
        return new TableCell({
            children: [
                new Paragraph({
                    children: [new TextRun({ text, bold: true })],
                    alignment: AlignmentType.CENTER,
                }),
            ],
            width: { size: COL_15, type: WidthType.DXA },
            shading: { fill: HEADER_FILL, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            borders: BORDER_CONFIG,
            rowSpan,
        });
    };

    // Helper to create a content cell (white background, left-aligned)
    const createContentCell = (
        text: string,
        columnSpan: number = 1,
    ): TableCell => {
        const width =
            columnSpan === 3
                ? COL_35 + COL_15 + COL_35
                : columnSpan === 2
                  ? COL_35 + COL_15
                  : COL_35;

        return new TableCell({
            children: [
                new Paragraph({
                    children: [new TextRun({ text })],
                    alignment: AlignmentType.LEFT,
                }),
            ],
            width: { size: width, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: BORDER_CONFIG,
            columnSpan,
        });
    };

    // Helper for small label cell in first row (범주)
    const createSmallLabelCell = (text: string): TableCell => {
        return new TableCell({
            children: [
                new Paragraph({
                    children: [new TextRun({ text, bold: true })],
                    alignment: AlignmentType.CENTER,
                }),
            ],
            width: { size: COL_15, type: WidthType.DXA },
            shading: { fill: HEADER_FILL, type: ShadingType.CLEAR },
            verticalAlign: VerticalAlign.CENTER,
            borders: BORDER_CONFIG,
        });
    };

    // Helper for small content cell in first row
    const createSmallContentCell = (text: string): TableCell => {
        return new TableCell({
            children: [
                new Paragraph({
                    children: [new TextRun({ text })],
                    alignment: AlignmentType.LEFT,
                }),
            ],
            width: { size: COL_35, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            borders: BORDER_CONFIG,
        });
    };

    // Create image placeholder cell
    const createImageCell = (): TableCell => {
        return new TableCell({
            children: [
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "(이미지 첨부)",
                            italics: true,
                            color: "888888",
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
                new Paragraph({ text: "" }),
                new Paragraph({
                    children: [
                        new TextRun({
                            text: "이미지 설명",
                            italics: true,
                            color: "888888",
                        }),
                    ],
                    alignment: AlignmentType.CENTER,
                }),
            ],
            verticalAlign: VerticalAlign.CENTER,
            borders: BORDER_CONFIG,
        });
    };

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            // Row 1: 명칭 | [Content] | 범주 | [Content]
            new TableRow({
                children: [
                    createLabelCell("명 칭"),
                    createContentCell(data.itemName),
                    createSmallLabelCell("범 주"),
                    createSmallContentCell(data.category),
                ],
            }),
            // Row 2: 아이템 개요 | [Content spans 3 columns]
            new TableRow({
                children: [
                    createLabelCell("아이템 개요"),
                    createContentCell(data.overview, 3),
                ],
            }),
            // Row 3: 문제 인식 | [Content spans 3 columns]
            new TableRow({
                children: [
                    createLabelCell("문제 인식"),
                    createContentCell(data.problem, 3),
                ],
            }),
            // Row 4: 실현 가능성 | [Content spans 3 columns]
            new TableRow({
                children: [
                    createLabelCell("실현 가능성"),
                    createContentCell(data.solution, 3),
                ],
            }),
            // Row 5: 성장전략 | [Content spans 3 columns]
            new TableRow({
                children: [
                    createLabelCell("성장전략"),
                    createContentCell(data.growth, 3),
                ],
            }),
            // Row 6: 팀 구성 | [Content spans 3 columns]
            new TableRow({
                children: [
                    createLabelCell("팀 구성"),
                    createContentCell(data.team, 3),
                ],
            }),
            // Row 7: 이미지 (rowSpan 2) | Image 1 | Image 2
            new TableRow({
                children: [
                    createLabelCell("이미지\n(참고자료)", 2),
                    createImageCell(),
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "(이미지 첨부)",
                                        italics: true,
                                        color: "888888",
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            }),
                            new Paragraph({ text: "" }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "이미지 설명",
                                        italics: true,
                                        color: "888888",
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        borders: BORDER_CONFIG,
                        columnSpan: 2,
                    }),
                ],
            }),
            // Row 8: Image descriptions (continuation of rowSpan)
            new TableRow({
                children: [
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "제품/서비스 개념도-1",
                                        italics: true,
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        borders: BORDER_CONFIG,
                    }),
                    new TableCell({
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: "제품/서비스 개념도-2",
                                        italics: true,
                                    }),
                                ],
                                alignment: AlignmentType.CENTER,
                            }),
                        ],
                        verticalAlign: VerticalAlign.CENTER,
                        borders: BORDER_CONFIG,
                        columnSpan: 2,
                    }),
                ],
            }),
        ],
    });
};

export function ExportButton({
    title,
    content,
    plainText,
    getLatestContent,
    grantType = "PRE_STARTUP",
    supportType,
    hwpxTemplatePath,
    originalPlainText,
    businessInfo,
    getChartImages,
}: ExportButtonProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [showSubscribeModal, setShowSubscribeModal] = useState(false);
    const { toast } = useToast();
    const { profile } = useAuth();

    // Check if user is paid
    const isPaidUser =
        profile?.plan_type === "monthly" || profile?.plan_type === "season";

    // Get the latest content, preferring getter function if available
    const getExportContent = () => {
        if (getLatestContent) {
            const latest = getLatestContent();
            if (latest) {
                return latest;
            }
        }
        return { content, plainText };
    };

    // Check subscription and show modal if free user
    const handleExportClick = (exportFn: () => Promise<void>) => {
        if (!isPaidUser) {
            setShowSubscribeModal(true);
            return;
        }
        exportFn();
    };

    const getTextRuns = (nodeContent: any[]): TextRun[] => {
        const runs: TextRun[] = [];
        if (!nodeContent || !Array.isArray(nodeContent)) return runs;

        for (const child of nodeContent) {
            try {
                if (child.type === "text" && child.text) {
                    const marks = child.marks || [];
                    const isBold = marks.some((m: any) => m.type === "bold");
                    const isItalic = marks.some(
                        (m: any) => m.type === "italic",
                    );
                    // Ensure text is a string and preserve whitespace
                    const textContent = String(child.text);
                    runs.push(
                        new TextRun({
                            text: textContent,
                            bold: isBold,
                            italics: isItalic,
                        }),
                    );
                } else if (child.type === "hardBreak") {
                    runs.push(new TextRun({ break: 1 }));
                }
            } catch (e) {
                console.error("Error processing text run:", e, child);
            }
        }
        return runs;
    };

    // Recursively parse list items including nested lists
    const parseListItems = (
        items: any[],
        listType: "bullet" | "ordered",
        depth: number = 0,
    ): Paragraph[] => {
        const paragraphs: Paragraph[] = [];
        let orderedIndex = 0;

        if (!items) return paragraphs;

        for (const item of items) {
            try {
                if (item.type !== "listItem") continue;

                orderedIndex++;
                const indentLeft = 720 + depth * 360;
                const prefix =
                    listType === "bullet" ? "• " : `${orderedIndex}. `;

                const paragraphNode = item.content?.find(
                    (c: any) => c.type === "paragraph",
                );
                if (paragraphNode) {
                    const textRuns = getTextRuns(paragraphNode.content);
                    paragraphs.push(
                        new Paragraph({
                            children: [new TextRun(prefix), ...textRuns],
                            spacing: { after: 100 },
                            indent: { left: indentLeft },
                        }),
                    );
                }

                for (const child of item.content || []) {
                    if (child.type === "bulletList" && child.content) {
                        paragraphs.push(
                            ...parseListItems(
                                child.content,
                                "bullet",
                                depth + 1,
                            ),
                        );
                    } else if (child.type === "orderedList" && child.content) {
                        paragraphs.push(
                            ...parseListItems(
                                child.content,
                                "ordered",
                                depth + 1,
                            ),
                        );
                    }
                }
            } catch (e) {
                console.error("Error processing list item:", e, item);
            }
        }

        return paragraphs;
    };

    // Helper to extract all text from any node recursively
    const extractAllText = (node: any): string => {
        if (!node) return "";
        if (typeof node === "string") return node;
        if (node.text) return node.text;
        if (node.content && Array.isArray(node.content)) {
            return node.content
                .map((child: any) => extractAllText(child))
                .join("");
        }
        return "";
    };

    // Parse generic table (non-Section 0)
    const parseGenericTable = (node: any): Table | null => {
        try {
            const rows: TableRow[] = [];

            if (!node.content || !Array.isArray(node.content)) return null;

            // Count max columns for proper width calculation
            let maxCols = 1;
            for (const rowNode of node.content) {
                if (rowNode.type === "tableRow" && rowNode.content) {
                    let colCount = 0;
                    for (const cellNode of rowNode.content) {
                        colCount += cellNode.attrs?.colspan || 1;
                    }
                    maxCols = Math.max(maxCols, colCount);
                }
            }

            // Calculate cell width based on total table width (9638 DXA for A4)
            const TOTAL_WIDTH = 9638;
            const cellWidth = Math.floor(TOTAL_WIDTH / maxCols);

            for (const rowNode of node.content) {
                if (rowNode.type !== "tableRow" || !rowNode.content) continue;

                const cells: TableCell[] = [];

                for (const cellNode of rowNode.content) {
                    try {
                        const colspan = cellNode.attrs?.colspan || 1;
                        const rowspan = cellNode.attrs?.rowspan || 1;

                        const cellContent: Paragraph[] = [];

                        if (
                            cellNode.content &&
                            Array.isArray(cellNode.content)
                        ) {
                            for (const cellChildNode of cellNode.content) {
                                if (cellChildNode.type === "paragraph") {
                                    const runs = getTextRuns(
                                        cellChildNode.content,
                                    );
                                    cellContent.push(
                                        new Paragraph({
                                            children:
                                                runs.length > 0
                                                    ? runs
                                                    : [new TextRun("")],
                                        }),
                                    );
                                } else {
                                    const text = extractAllText(cellChildNode);
                                    if (text.trim()) {
                                        cellContent.push(
                                            new Paragraph({ text }),
                                        );
                                    }
                                }
                            }
                        }

                        cells.push(
                            new TableCell({
                                children:
                                    cellContent.length > 0
                                        ? cellContent
                                        : [new Paragraph("")],
                                columnSpan: colspan,
                                rowSpan: rowspan,
                                width: {
                                    size: cellWidth * colspan,
                                    type: WidthType.DXA,
                                },
                                borders: {
                                    top: { style: BorderStyle.SINGLE, size: 1 },
                                    bottom: {
                                        style: BorderStyle.SINGLE,
                                        size: 1,
                                    },
                                    left: {
                                        style: BorderStyle.SINGLE,
                                        size: 1,
                                    },
                                    right: {
                                        style: BorderStyle.SINGLE,
                                        size: 1,
                                    },
                                },
                            }),
                        );
                    } catch (cellError) {
                        console.error(
                            "Error processing cell with colspan/rowspan:",
                            cellError,
                        );
                        cells.push(
                            new TableCell({ children: [new Paragraph("")] }),
                        );
                    }
                }

                if (cells.length > 0) {
                    rows.push(new TableRow({ children: cells }));
                }
            }

            if (rows.length > 0) {
                return new Table({
                    rows: rows,
                    width: { size: 100, type: WidthType.PERCENTAGE },
                });
            }

            return null;
        } catch (tableError) {
            console.error("Error parsing generic table:", tableError);
            return null;
        }
    };

    // Check if this is the Section 0 table (첫 번째 테이블이고 명칭/범주 포함)
    const isSection0Table = (node: any): boolean => {
        if (node.type !== "table" || !node.content) return false;

        const firstRow = node.content[0];
        if (!firstRow?.content) return false;

        const firstCellText = extractAllText(firstRow.content[0]);
        return firstCellText.includes("명") && firstCellText.includes("칭");
    };

    const parseContentToDocx = (
        docContent: any,
        fallbackPlainText: string,
    ): (Paragraph | Table)[] => {
        const elements: (Paragraph | Table)[] = [];

        // Fallback to plain text if no structured content
        if (!docContent?.content || !Array.isArray(docContent.content)) {
            console.log("No structured content, using plain text");
            const lines = (fallbackPlainText || "").split("\n");
            for (const line of lines) {
                elements.push(
                    new Paragraph({ text: line, spacing: { after: 200 } }),
                );
            }
            return elements.length > 0
                ? elements
                : [new Paragraph({ text: "" })];
        }

        console.log(
            `Processing ${docContent.content.length} nodes for DOCX export`,
        );

        // First, try to extract Section 0 data for hardcoded table
        const section0Data = extractSection0Data(docContent);
        let section0TableHandled = false;

        for (let i = 0; i < docContent.content.length; i++) {
            const node = docContent.content[i];
            try {
                if (node.type === "heading") {
                    const level = node.attrs?.level || 1;
                    const text =
                        node.content?.map((c: any) => c.text || "").join("") ||
                        "";

                    let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] =
                        HeadingLevel.HEADING_1;
                    if (level === 2) headingLevel = HeadingLevel.HEADING_2;
                    if (level === 3) headingLevel = HeadingLevel.HEADING_3;

                    elements.push(
                        new Paragraph({
                            text,
                            heading: headingLevel,
                            spacing: { after: 200 },
                        }),
                    );
                } else if (node.type === "paragraph") {
                    const runs = getTextRuns(node.content);
                    elements.push(
                        new Paragraph({
                            children:
                                runs.length > 0 ? runs : [new TextRun("")],
                            spacing: { after: 200 },
                        }),
                    );
                } else if (node.type === "bulletList") {
                    if (node.content) {
                        elements.push(
                            ...parseListItems(node.content, "bullet", 0),
                        );
                    }
                } else if (node.type === "orderedList") {
                    if (node.content) {
                        elements.push(
                            ...parseListItems(node.content, "ordered", 0),
                        );
                    }
                } else if (node.type === "table") {
                    // Check if this is Section 0 table and we have extracted data
                    if (
                        !section0TableHandled &&
                        section0Data &&
                        isSection0Table(node)
                    ) {
                        console.log("Using hardcoded Section 0 table layout");
                        elements.push(createSection0Table(section0Data));
                        elements.push(
                            new Paragraph({ spacing: { after: 200 } }),
                        );
                        section0TableHandled = true;
                    } else {
                        // Use generic table parser for other tables
                        const table = parseGenericTable(node);
                        if (table) {
                            elements.push(table);
                            elements.push(
                                new Paragraph({ spacing: { after: 200 } }),
                            );
                        }
                    }
                } else {
                    // FALLBACK: Handle unknown node types by extracting text
                    console.log(
                        `Unknown node type: ${node.type}, extracting text fallback`,
                    );
                    const text = extractAllText(node);
                    if (text.trim()) {
                        elements.push(
                            new Paragraph({
                                text: text,
                                spacing: { after: 200 },
                            }),
                        );
                    }
                }
            } catch (nodeError) {
                console.error(`Error processing node ${i}:`, nodeError, node);
                // Fallback: try to extract any text from the failed node
                try {
                    const fallbackText = extractAllText(node);
                    if (fallbackText.trim()) {
                        elements.push(
                            new Paragraph({
                                text: fallbackText,
                                spacing: { after: 200 },
                            }),
                        );
                    }
                } catch (e) {
                    console.error("Fallback text extraction also failed:", e);
                }
            }
        }

        console.log(`Generated ${elements.length} DOCX elements`);
        return elements.length > 0
            ? elements
            : [new Paragraph({ text: fallbackPlainText || "" })];
    };

    const exportToDocx = async () => {
        setIsExporting(true);
        try {
            // Get latest content at export time
            const { content: exportContent, plainText: exportPlainText } =
                getExportContent();

            console.log("Starting DOCX export for:", title);
            console.log("Content type:", typeof exportContent);
            console.log("Content nodes:", exportContent?.content?.length);

            const docElements = parseContentToDocx(
                exportContent,
                exportPlainText,
            );
            console.log("Parsed elements count:", docElements.length);

            const doc = new DocxDocument({
                sections: [
                    {
                        properties: {},
                        children: docElements,
                    },
                ],
            });

            const blob = await Packer.toBlob(doc);
            const fileName = `${title || "문서"}.docx`;
            saveAs(blob, fileName);

            toast({
                title: "내보내기 완료",
                description: `${fileName}로 저장되었습니다.`,
            });
        } catch (error) {
            console.error("Export error:", error);
            toast({
                variant: "destructive",
                title: "내보내기 실패",
                description:
                    "문서 내보내기에 실패했습니다. 콘솔에서 상세 오류를 확인하세요.",
            });
        } finally {
            setIsExporting(false);
        }
    };

    const exportToHwp = async () => {
        setIsExporting(true);
        try {
            // Get latest content at export time
            const { content: exportContent, plainText: exportPlainText } =
                getExportContent();

            console.log("Starting HWP export via Edge Function for:", title);
            console.log(
                "Content for HWP nodes:",
                exportContent?.content?.length,
            );

            // Get user's JWT token for authentication
            const {
                data: { session },
            } = await supabase.auth.getSession();
            if (!session?.access_token) {
                toast({
                    variant: "destructive",
                    title: "인증 필요",
                    description: "로그인이 필요합니다.",
                });
                setIsExporting(false);
                return;
            }

            // Use fetch directly to get binary response properly
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-hwpx`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        title,
                        content: exportContent,
                        plainText: exportPlainText,
                    }),
                },
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error("HWP export error response:", errorText);
                throw new Error(`HWP 내보내기 실패: ${response.status}`);
            }

            const blob = await response.blob();
            console.log("HWP blob size:", blob.size);

            const fileName = `${title || "문서"}.hwpx`;
            saveAs(blob, fileName);

            toast({
                title: "내보내기 완료",
                description: `${fileName}로 저장되었습니다. 한글 2014 이상에서 열 수 있습니다.`,
            });
        } catch (error) {
            console.error("HWP export error:", error);
            toast({
                variant: "destructive",
                title: "내보내기 실패",
                description:
                    "HWP 문서 내보내기에 실패했습니다. 콘솔에서 상세 오류를 확인하세요.",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // 클라이언트 사이드 HWPX 내보내기 (2025 예비창업패키지 양식)
    const exportToHwpxTemplate = async () => {
        setIsExporting(true);
        try {
            // Get latest content at export time
            const { content: exportContent } = getExportContent();

            console.log("Starting client-side HWPX export for:", title);
            console.log("Content nodes:", exportContent?.content?.length);

            // 1. 에디터 콘텐츠에서 데이터 추출
            const projectData = extractDataFromEditor(exportContent, "");
            console.log("Extracted project data:", projectData);

            // 1.5. 2026 초기창업패키지 일반현황 정보 병합
            // businessInfo가 있으면 사용하고, 없으면 기본값 사용
            if (businessInfo) {
                // 일반현황 기본 정보
                projectData["info_company_name"] =
                    businessInfo.info_company_name ||
                    projectData["info_company_name"] ||
                    projectData["company_name"] ||
                    projectData["item_name"] ||
                    "";
                projectData["info_est_date"] = businessInfo.info_est_date || "";
                projectData["info_reg_number"] =
                    businessInfo.info_reg_number || "";
                projectData["info_address"] = businessInfo.info_address || "";
                projectData["business_type"] =
                    businessInfo.business_type || "개인사업자";
                projectData["representative_type"] =
                    businessInfo.representative_type || "단독";

                // 창업아이템 정보
                projectData["item_name"] =
                    businessInfo.item_name || projectData["item_name"] || "";
                projectData["target_output"] = businessInfo.target_output || "";
                projectData["support_field"] = businessInfo.support_field || "";
                projectData["tech_field"] = businessInfo.tech_field || "";

                // 사업비 정보
                projectData["budget_gov"] = businessInfo.budget_gov || "";
                projectData["budget_self_cash"] =
                    businessInfo.budget_self_cash || "";
                projectData["budget_self_kind"] =
                    businessInfo.budget_self_kind || "";
                projectData["budget_total"] = businessInfo.budget_total || "";

                // 지방우대 지역
                projectData["region_type"] = businessInfo.region_type || "";

                // 팀 구성 현황
                for (let i = 1; i <= 5; i++) {
                    projectData[`team_${i}_position`] =
                        (businessInfo as any)[`team_${i}_position`] || "";
                    projectData[`team_${i}_role`] =
                        (businessInfo as any)[`team_${i}_role`] || "";
                    projectData[`team_${i}_competency`] =
                        (businessInfo as any)[`team_${i}_competency`] || "";
                    projectData[`team_${i}_status`] =
                        (businessInfo as any)[`team_${i}_status`] || "";
                }

                console.log("📋 일반현황 정보 병합 완료:", {
                    company: projectData["info_company_name"],
                    business_type: projectData["business_type"],
                    item_name: projectData["item_name"],
                    budget_gov: projectData["budget_gov"],
                    team_1_position: projectData["team_1_position"],
                });
            }

            // 2. 차트 이미지 캡처 및 주입
            if (getChartImages) {
                toast({
                    title: "차트 처리 중",
                    description: "시각화 자료를 이미지로 변환하고 있습니다...",
                });

                try {
                    const images = await getChartImages();
                    if (images.image_market_growth) {
                        projectData["image_market_growth"] =
                            images.image_market_growth;
                        console.log(
                            "📊 시장 성장 차트 이미지가 데이터에 포함되었습니다.",
                        );
                    }
                    if (images.image_bm_diagram) {
                        projectData["image_bm_diagram"] =
                            images.image_bm_diagram;
                        console.log(
                            "🔄 비즈니스 모델 다이어그램이 데이터에 포함되었습니다.",
                        );
                    }
                    if (images.image_tam_sam_som) {
                        projectData["image_tam_sam_som"] =
                            images.image_tam_sam_som;
                        console.log(
                            "🎯 TAM/SAM/SOM 다이어그램이 데이터에 포함되었습니다.",
                        );
                    }
                } catch (imgError) {
                    console.error(
                        "차트 캡처 실패 (문서 생성은 계속 진행):",
                        imgError,
                    );
                }
            }

            // 3. HWPX 템플릿에 데이터 병합 및 내보내기 (supportType에 따라 템플릿 선택)
            const exportFileName =
                title?.trim() ||
                (supportType === "early_startup"
                    ? "2026_초기창업패키지_사업계획서"
                    : "2025_예비창업패키지_사업계획서");
            await exportToHwpx(projectData, exportFileName, supportType);

            toast({
                title: "내보내기 완료",
                description: `${exportFileName}.hwpx로 저장되었습니다.`,
            });
        } catch (error) {
            console.error("HWPX export error:", error);
            toast({
                variant: "destructive",
                title: "내보내기 실패",
                description:
                    error instanceof Error
                        ? error.message
                        : "HWPX 문서 내보내기에 실패했습니다.",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // 커스텀 HWPX 내보내기 (원본 템플릿에 편집 내용 주입 - 클라이언트 사이드)
    const exportToCustomHwpx = async () => {
        if (!hwpxTemplatePath) {
            toast({
                variant: "destructive",
                title: "내보내기 실패",
                description: "원본 템플릿 경로를 찾을 수 없습니다.",
            });
            return;
        }

        setIsExporting(true);
        try {
            // Get latest content - this includes the HTML tables with data-placeholder attributes
            const { plainText: currentPlainText } = getExportContent();

            console.log("[CustomHWPX] Starting client-side export...");
            console.log("[CustomHWPX] Template path:", hwpxTemplatePath);
            console.log(
                "[CustomHWPX] Current content length:",
                currentPlainText?.length || 0,
            );

            // Use the client-side export function (same approach as 예창패/청창패)
            const exportFileName = title?.trim() || "자유양식_문서";
            await exportCustomHwpxFull(
                hwpxTemplatePath,
                currentPlainText || "",
                exportFileName,
            );

            toast({
                title: "내보내기 완료",
                description: `${exportFileName}.hwpx로 저장되었습니다.`,
            });
        } catch (error) {
            console.error("[CustomHWPX] Export error:", error);
            toast({
                variant: "destructive",
                title: "내보내기 실패",
                description:
                    error instanceof Error
                        ? error.message
                        : "HWPX 내보내기에 실패했습니다.",
            });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDisabledClick = () => {
        toast({
            title: "준비 중입니다",
            description: "해당 기능은 현재 준비 중입니다.",
        });
    };

    // Get dynamic footer message based on grant type
    const getFooterMessage = () => {
        if (grantType === "CUSTOM") {
            return "*편집한 내용이 원본 HWPX 파일에 적용되어 내보내집니다.";
        }
        const grantName =
            GRANT_TYPE_NAMES[grantType] || GRANT_TYPE_NAMES.PRE_STARTUP;
        return `*${grantName}.docx 양식 내보내기 기능은 수일 내에 오픈 예정입니다.`;
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isExporting}>
                        {isExporting ? (
                            <Loader2 size={16} className="animate-spin mr-2" />
                        ) : (
                            <Download size={16} className="mr-2" />
                        )}
                        내보내기
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                    {/* Word Document Export */}
                    <DropdownMenuItem
                        onClick={() => handleExportClick(exportToDocx)}
                    >
                        <FileText size={16} className="mr-2" />
                        Word 문서 (.docx)
                    </DropdownMenuItem>

                    {/* PRE_STARTUP HWPX - show only if grantType is PRE_STARTUP */}
                    {grantType === "PRE_STARTUP" && (
                        <DropdownMenuItem
                            onClick={() =>
                                handleExportClick(exportToHwpxTemplate)
                            }
                        >
                            <FileType size={16} className="mr-2" />
                            2025 예비창업패키지 양식 (.hwpx)
                        </DropdownMenuItem>
                    )}

                    {/* YOUTH_ACADEMY HWPX - show only if grantType is YOUTH_ACADEMY */}
                    {grantType === "YOUTH_ACADEMY" && (
                        <DropdownMenuItem
                            onClick={handleDisabledClick}
                            disabled
                            className="text-muted-foreground opacity-50 cursor-not-allowed"
                        >
                            <FileType size={16} className="mr-2" />
                            2025 청년창업사관학교 양식 (.hwpx) (준비 중)
                        </DropdownMenuItem>
                    )}

                    {/* EARLY_STARTUP HWPX - show only if grantType is EARLY_STARTUP */}
                    {grantType === "EARLY_STARTUP" && (
                        <DropdownMenuItem
                            onClick={() =>
                                handleExportClick(exportToHwpxTemplate)
                            }
                        >
                            <FileType size={16} className="mr-2" />
                            2026 초기창업패키지 양식 (.hwpx)
                        </DropdownMenuItem>
                    )}

                    {/* CUSTOM HWPX - show only if grantType is CUSTOM */}
                    {grantType === "CUSTOM" && (
                        <DropdownMenuItem
                            onClick={() =>
                                handleExportClick(exportToCustomHwpx)
                            }
                        >
                            <FileType size={16} className="mr-2" />
                            자유양식 (.hwpx)
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <div className="px-2 py-2 text-xs text-muted-foreground leading-relaxed">
                        <p>{getFooterMessage()}</p>
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Subscription Modal for Free Users */}
            <Dialog
                open={showSubscribeModal}
                onOpenChange={setShowSubscribeModal}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center">
                            내보내기 이용 안내
                        </DialogTitle>
                        <DialogDescription className="text-center pt-2">
                            내보내기를 이용하시려면
                            <br />
                            구독을 시작해 보세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-center pt-4">
                        <Button
                            onClick={() => {
                                setShowSubscribeModal(false);
                                window.location.href = "/#pricing";
                            }}
                            className="w-full max-w-xs"
                        >
                            구독하기
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
