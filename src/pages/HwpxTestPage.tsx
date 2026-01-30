import { useState, useRef } from "react";
import {
    Upload,
    X,
    FileText,
    Loader2,
    BarChart3,
    Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
    parseHwpxFile,
    contentBlocksToMarkdown,
    ParsedHwpxResult,
} from "@/utils/hwpxParser";
import {
    extractChartDataFromText,
    ParsedChartData,
} from "@/utils/chartDataParser";
import { ChartPreview } from "@/components/app/ChartPreview";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableMarkdownContent } from "@/components/hwpx/EditableMarkdownContent";
import {
    exportCustomHwpx,
    exportCustomHwpxPassthrough,
    exportCustomHwpxJszipOnly,
    exportCustomHwpxReadWriteOnly,
    exportCustomHwpxSimpleReplace,
    exportCustomHwpxRegexTest,
    exportCustomHwpxEscapeTest,
    exportCustomHwpxFull,
} from "@/utils/hwpxCustomExportService";
import {
    testDownloadRawTemplate,
    testJszipPassthrough,
} from "@/utils/hwpxExportService";

export default function HwpxTestPage() {
    const { toast } = useToast();
    const [hwpxFile, setHwpxFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [parseResult, setParseResult] = useState<ParsedHwpxResult | null>(
        null,
    );
    const [chartData, setChartData] = useState<ParsedChartData | null>(null);
    const [markdownContent, setMarkdownContent] = useState("");
    const [templatePath, setTemplatePath] = useState<string>("");
    const hwpxInputRef = useRef<HTMLInputElement>(null);

    const handleHwpxFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const fileName = file.name.toLowerCase();
            if (!fileName.endsWith(".hwpx")) {
                toast({
                    variant: "destructive",
                    title: "HWPX 파일만 업로드 가능합니다",
                    description: "*.hwpx 형식의 파일을 선택해주세요.",
                });
                return;
            }
            setHwpxFile(file);
            setParseResult(null);
            setChartData(null);
            setMarkdownContent("");
        }
    };

    const handleRemoveFile = () => {
        setHwpxFile(null);
        setParseResult(null);
        setChartData(null);
        setMarkdownContent("");
        setTemplatePath("");
        if (hwpxInputRef.current) {
            hwpxInputRef.current.value = "";
        }
    };

    const handleParse = async () => {
        if (!hwpxFile) return;

        setIsLoading(true);
        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                toast({ variant: "destructive", title: "로그인이 필요합니다" });
                return;
            }

            // Sanitize filename for Supabase Storage
            const sanitizedName = hwpxFile.name
                .replace(/[^\x00-\x7F]/g, "_")
                .replace(/[\[\]\(\)\{\}<>'"!@#$%^&*+=|\\:;,?~`]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_(?=\.)/g, "");
            const hwpxFileName = `${user.id}/templates/${Date.now()}_${sanitizedName}`;

            // Upload HWPX file
            const { error: uploadError } = await supabase.storage
                .from("project_files")
                .upload(hwpxFileName, hwpxFile);

            if (uploadError) {
                console.error("HWPX upload error:", uploadError);
                toast({
                    variant: "destructive",
                    title: "HWPX 파일 업로드에 실패했습니다",
                });
                return;
            }

            toast({ title: "HWPX 파일을 분석 중입니다...", duration: 3000 });

            // Parse HWPX file
            const result = await parseHwpxFile(hwpxFileName);
            setParseResult(result);

            if (!result.success) {
                toast({
                    variant: "destructive",
                    title: "HWPX 파싱 실패",
                    description: result.error || "파일 형식을 확인해주세요.",
                });
                return;
            }

            // Use the template path with injected placeholders (if available), otherwise use original
            const exportPath = result.templatePath || hwpxFileName;
            console.log(
                `[hwpx-test] Using template path for export: ${exportPath}`,
            );
            console.log(`[hwpx-test] Original path: ${hwpxFileName}`);
            console.log(
                `[hwpx-test] Placeholder count: ${result.placeholderCount}`,
            );
            setTemplatePath(exportPath);

            // Convert content blocks to markdown
            let markdown = "";
            if (result.contentBlocks && result.contentBlocks.length > 0) {
                markdown = contentBlocksToMarkdown(result.contentBlocks);
            } else {
                markdown = result.plainText;
            }
            setMarkdownContent(markdown);

            // Extract chart data from plain text
            const extractedChartData = extractChartDataFromText(
                result.plainText,
            );
            if (extractedChartData) {
                setChartData(extractedChartData);
                toast({
                    title: "차트 데이터 발견",
                    description:
                        "HWPX 파일에서 차트 레이아웃 데이터를 추출했습니다.",
                });
            }

            toast({
                title: "HWPX 분석 완료",
                description: `${result.regionCount}개의 편집 영역, ${result.placeholderCount || 0}개의 입력 필드${result.images?.length ? `, ${result.images.length}개의 이미지` : ""}${extractedChartData ? ", 차트 데이터 포함" : ""}`,
                duration: 3000,
            });
        } catch (error) {
            console.error("Error parsing HWPX:", error);
            toast({
                variant: "destructive",
                title: "HWPX 파싱 중 오류가 발생했습니다",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Test 1: Passthrough - just duplicate original file (CLIENT-SIDE)
    const handlePassthroughTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({ title: "테스트 1: 원본 파일 복제 중...", duration: 3000 });

            await exportCustomHwpxPassthrough(templatePath, "test_passthrough");

            toast({
                title: "테스트 1 완료",
                description: "원본 파일 복제 성공. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Passthrough test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 1 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 2: JSZip only (no modifications) - to test if JSZip itself corrupts the file
    const handleJszipOnlyTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({
                title: "테스트 2: JSZip 로드 후 재생성 (수정 없음)...",
                duration: 3000,
            });

            await exportCustomHwpxJszipOnly(templatePath, "test_jszip_only");

            toast({
                title: "테스트 2 완료",
                description: "JSZip 재생성 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("JSZip-only test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 2 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 3: Read XML as string and write back unchanged - tests if zip.file(string) corrupts
    const handleReadWriteTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({
                title: "테스트 3: XML 읽기/쓰기 (수정 없음)...",
                duration: 3000,
            });

            await exportCustomHwpxReadWriteOnly(templatePath, "test_readwrite");

            toast({
                title: "테스트 3 완료",
                description: "XML 읽기/쓰기 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Read/Write test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 3 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 4: Simple hardcoded replacement
    const handleSimpleReplaceTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({ title: "테스트 4: 간단한 텍스트 치환...", duration: 3000 });

            await exportCustomHwpxSimpleReplace(
                templatePath,
                "test_simple_replace",
            );

            toast({
                title: "테스트 4 완료",
                description: "간단 치환 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Simple replace test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 4 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 5: Regex pattern test (same regex as full export but hardcoded values)
    const handleRegexTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({ title: "테스트 5: Regex 패턴 테스트...", duration: 3000 });

            await exportCustomHwpxRegexTest(templatePath, "test_regex");

            toast({
                title: "테스트 5 완료",
                description: "Regex 패턴 치환 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Regex test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 5 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 6: Escape XML test (tests if escapeXmlChars is the problem)
    const handleEscapeTest = async () => {
        if (!templatePath) {
            toast({
                variant: "destructive",
                title: "먼저 HWPX 파일을 업로드하고 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({ title: "테스트 6: Escape XML 테스트...", duration: 3000 });

            await exportCustomHwpxEscapeTest(templatePath, "test_escape");

            toast({
                title: "테스트 6 완료",
                description: "Escape XML 치환 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Escape test error:", error);
            toast({
                variant: "destructive",
                title: "테스트 6 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Test 7: Full export with changesMap (the actual logic)
    const handleFullExport = async () => {
        if (!templatePath || !markdownContent) {
            toast({
                variant: "destructive",
                title: "내보내기할 콘텐츠가 없습니다",
                description: "먼저 HWPX 파일을 분석해주세요.",
            });
            return;
        }

        setIsExporting(true);
        try {
            toast({ title: "테스트 7: 전체 Export...", duration: 3000 });

            const exportFileName =
                hwpxFile?.name.replace(".hwpx", "") || "exported_document";
            await exportCustomHwpxFull(
                templatePath,
                markdownContent,
                `${exportFileName}_full`,
            );

            toast({
                title: "테스트 7 완료",
                description: "전체 Export 완료. 한글에서 열어보세요.",
            });
        } catch (error) {
            console.error("Full export error:", error);
            toast({
                variant: "destructive",
                title: "테스트 7 실패",
                description:
                    error instanceof Error ? error.message : "알 수 없는 오류",
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <FileText size={32} className="text-primary" />
                    <div>
                        <h1 className="text-3xl font-bold">
                            HWPX 테스트 페이지
                        </h1>
                        <p className="text-muted-foreground">
                            HWPX 파일을 업로드하여 파싱 결과와 차트 데이터를
                            확인합니다.
                        </p>
                    </div>
                </div>

                {/* 🧪 Template Download Test Section */}
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                    <CardHeader>
                        <CardTitle className="text-yellow-600">
                            🧪 템플릿 다운로드 테스트
                        </CardTitle>
                        <CardDescription>
                            2025/2026 템플릿을 다양한 방식으로 다운로드하여 어느
                            단계에서 문제가 발생하는지 확인합니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <p className="text-sm font-medium">
                                    2025 예비창업패키지
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            testDownloadRawTemplate(
                                                "preliminary",
                                            )
                                        }
                                    >
                                        Raw 다운로드
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            testJszipPassthrough("preliminary")
                                        }
                                    >
                                        JSZip 패스스루
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm font-medium">
                                    2026 초기창업패키지
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            testDownloadRawTemplate(
                                                "early_startup",
                                            )
                                        }
                                    >
                                        Raw 다운로드
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            testJszipPassthrough(
                                                "early_startup",
                                            )
                                        }
                                    >
                                        JSZip 패스스루
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            • Raw 다운로드: 템플릿 파일을 그대로 다운로드 (문제
                            시 → 템플릿 파일 자체 문제)
                            <br />• JSZip 패스스루: JSZip으로 로드 후 수정 없이
                            재생성 (문제 시 → JSZip 재생성 문제)
                        </p>
                    </CardContent>
                </Card>

                {/* Upload Section */}
                <Card>
                    <CardHeader>
                        <CardTitle>HWPX 파일 업로드</CardTitle>
                        <CardDescription>
                            *.hwpx 형식의 파일을 선택하여 내용을 분석합니다.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <input
                            ref={hwpxInputRef}
                            type="file"
                            accept=".hwpx"
                            onChange={handleHwpxFileSelect}
                            className="hidden"
                        />

                        {hwpxFile ? (
                            <div className="flex items-center justify-between p-4 bg-accent rounded-lg border">
                                <div className="flex items-center gap-3">
                                    <FileText
                                        size={24}
                                        className="text-primary"
                                    />
                                    <div>
                                        <p className="font-medium">
                                            {hwpxFile.name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {(hwpxFile.size / 1024).toFixed(1)}{" "}
                                            KB
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleRemoveFile}
                                >
                                    <X size={20} />
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                onClick={() => hwpxInputRef.current?.click()}
                                className="w-full h-32 border-dashed"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <Upload
                                        size={32}
                                        className="text-muted-foreground"
                                    />
                                    <span>HWPX 파일을 선택하세요</span>
                                </div>
                            </Button>
                        )}

                        <Button
                            onClick={handleParse}
                            disabled={!hwpxFile || isLoading}
                            className="w-full"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2
                                        size={18}
                                        className="animate-spin mr-2"
                                    />
                                    분석 중...
                                </>
                            ) : (
                                <>
                                    <FileText size={18} className="mr-2" />
                                    HWPX 파일 분석
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>

                {/* Results Section */}
                {parseResult && (
                    <Tabs defaultValue="content" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="content">콘텐츠</TabsTrigger>
                            <TabsTrigger value="charts">
                                <BarChart3 size={16} className="mr-1" />
                                차트
                            </TabsTrigger>
                            <TabsTrigger value="metadata">
                                메타데이터
                            </TabsTrigger>
                            <TabsTrigger value="placeholders">필드</TabsTrigger>
                        </TabsList>

                        <TabsContent value="content" className="space-y-4">
                            <Card>
                                <CardHeader className="flex flex-col gap-4">
                                    <div className="flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle>
                                                추출된 콘텐츠 (Markdown)
                                            </CardTitle>
                                            <CardDescription>
                                                HWPX에서 추출된 텍스트, 이미지,
                                                테이블이 Markdown 형식으로
                                                변환되었습니다.
                                            </CardDescription>
                                        </div>
                                    </div>

                                    {/* Test Buttons */}
                                    <div className="flex flex-wrap gap-2 p-3 bg-accent/50 rounded-lg border">
                                        <span className="text-sm font-medium w-full mb-1">
                                            내보내기 테스트:
                                        </span>
                                        <Button
                                            onClick={handlePassthroughTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="outline"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트1: 원본복제
                                        </Button>
                                        <Button
                                            onClick={handleJszipOnlyTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트2: JSZip만
                                        </Button>
                                        <Button
                                            onClick={handleReadWriteTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트3: XML읽기/쓰기
                                        </Button>
                                        <Button
                                            onClick={handleSimpleReplaceTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트4: 간단치환
                                        </Button>
                                        <Button
                                            onClick={handleRegexTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트5: Regex패턴
                                        </Button>
                                        <Button
                                            onClick={handleEscapeTest}
                                            disabled={
                                                isExporting || !templatePath
                                            }
                                            variant="secondary"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트6: EscapeXml
                                        </Button>
                                        <Button
                                            onClick={handleFullExport}
                                            disabled={
                                                isExporting || !markdownContent
                                            }
                                            variant="default"
                                            size="sm"
                                        >
                                            {isExporting ? (
                                                <Loader2
                                                    size={16}
                                                    className="animate-spin mr-2"
                                                />
                                            ) : (
                                                <Download
                                                    size={16}
                                                    className="mr-2"
                                                />
                                            )}
                                            테스트7: 전체Export
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="min-h-[200px] p-4 border rounded-lg bg-background overflow-auto">
                                        {markdownContent ? (
                                            <EditableMarkdownContent
                                                content={markdownContent}
                                                onContentChange={
                                                    setMarkdownContent
                                                }
                                            />
                                        ) : (
                                            <p className="text-muted-foreground">
                                                추출된 콘텐츠가 없습니다.
                                            </p>
                                        )}
                                    </div>
                                    <details className="text-sm">
                                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                            원본 Markdown 보기
                                        </summary>
                                        <Textarea
                                            value={markdownContent}
                                            readOnly
                                            className="mt-2 min-h-[200px] font-mono text-xs"
                                        />
                                    </details>
                                </CardContent>
                            </Card>

                            {/* Images Preview */}
                            {parseResult.images &&
                                parseResult.images.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>
                                                추출된 이미지 (
                                                {parseResult.images.length}개)
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                                {parseResult.images.map(
                                                    (img, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="border rounded-lg p-2"
                                                        >
                                                            <img
                                                                src={
                                                                    img.publicUrl
                                                                }
                                                                alt={`Image ${idx + 1}`}
                                                                className="w-full h-32 object-contain bg-muted rounded"
                                                            />
                                                            <p className="text-xs text-muted-foreground mt-1 truncate">
                                                                {
                                                                    img.originalPath
                                                                }
                                                            </p>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                        </TabsContent>

                        <TabsContent value="charts">
                            <Card>
                                <CardHeader>
                                    <CardTitle>차트 레이아웃</CardTitle>
                                    <CardDescription>
                                        HWPX 파일에서 [CHART_DATA] 블록으로
                                        추출된 차트 데이터입니다.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {chartData ? (
                                        <div className="space-y-6">
                                            <div className="p-4 bg-accent/50 rounded-lg">
                                                <Label className="text-sm font-medium">
                                                    원본 차트 데이터 (JSON)
                                                </Label>
                                                <pre className="mt-2 text-xs overflow-auto max-h-48 p-3 bg-background rounded border">
                                                    {JSON.stringify(
                                                        chartData,
                                                        null,
                                                        2,
                                                    )}
                                                </pre>
                                            </div>
                                            <div className="border-t pt-6">
                                                <Label className="text-sm font-medium mb-4 block">
                                                    차트 미리보기
                                                </Label>
                                                <ChartPreview
                                                    data={chartData}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 text-muted-foreground">
                                            <BarChart3
                                                size={48}
                                                className="mx-auto mb-4 opacity-50"
                                            />
                                            <p>
                                                HWPX 파일에서 차트 데이터가
                                                발견되지 않았습니다.
                                            </p>
                                            <p className="text-sm mt-2">
                                                문서에
                                                [CHART_DATA]...[/CHART_DATA]
                                                블록이 포함되어 있어야 합니다.
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="metadata">
                            <Card>
                                <CardHeader>
                                    <CardTitle>파일 메타데이터</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-accent/50 rounded-lg">
                                            <Label className="text-sm text-muted-foreground">
                                                파일 수
                                            </Label>
                                            <p className="text-2xl font-bold">
                                                {parseResult.metadata.fileCount}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-accent/50 rounded-lg">
                                            <Label className="text-sm text-muted-foreground">
                                                섹션 수
                                            </Label>
                                            <p className="text-2xl font-bold">
                                                {
                                                    parseResult.metadata
                                                        .sectionCount
                                                }
                                            </p>
                                        </div>
                                        <div className="p-4 bg-accent/50 rounded-lg">
                                            <Label className="text-sm text-muted-foreground">
                                                이미지 포함
                                            </Label>
                                            <p className="text-2xl font-bold">
                                                {parseResult.metadata.hasImages
                                                    ? "예"
                                                    : "아니오"}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-accent/50 rounded-lg">
                                            <Label className="text-sm text-muted-foreground">
                                                편집 영역
                                            </Label>
                                            <p className="text-2xl font-bold">
                                                {parseResult.regionCount}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <Label className="text-sm text-muted-foreground">
                                            XML 파일 목록
                                        </Label>
                                        <div className="mt-2 p-3 bg-muted rounded-lg max-h-48 overflow-auto">
                                            <ul className="text-sm font-mono space-y-1">
                                                {parseResult.metadata.xmlFiles.map(
                                                    (f, i) => (
                                                        <li
                                                            key={i}
                                                            className="text-muted-foreground"
                                                        >
                                                            {f}
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="placeholders">
                            <Card>
                                <CardHeader>
                                    <CardTitle>
                                        감지된 필드 (
                                        {parseResult.placeholders.length}개)
                                    </CardTitle>
                                    <CardDescription>
                                        AI가 분석한 편집 가능한 필드입니다.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {parseResult.placeholders.length > 0 ? (
                                        <div className="space-y-3">
                                            {parseResult.placeholders.map(
                                                (p, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="p-4 border rounded-lg"
                                                    >
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded font-mono">
                                                                {p.id}
                                                            </span>
                                                            <span className="font-medium">
                                                                {p.label}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mb-2">
                                                            {p.hint}
                                                        </p>
                                                        <p className="text-xs bg-muted p-2 rounded truncate">
                                                            원본:{" "}
                                                            {p.originalText}
                                                        </p>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-center text-muted-foreground py-8">
                                            감지된 필드가 없습니다.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {parseResult.essentialQuestions.length > 0 && (
                                <Card className="mt-4">
                                    <CardHeader>
                                        <CardTitle>
                                            핵심 질문 (
                                            {
                                                parseResult.essentialQuestions
                                                    .length
                                            }
                                            개)
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ul className="space-y-2">
                                            {parseResult.essentialQuestions.map(
                                                (q, idx) => (
                                                    <li
                                                        key={idx}
                                                        className="flex items-start gap-2"
                                                    >
                                                        <span className="text-primary font-bold">
                                                            {idx + 1}.
                                                        </span>
                                                        <span>
                                                            {q.question}
                                                        </span>
                                                        {q.required && (
                                                            <span className="text-xs text-destructive">
                                                                (필수)
                                                            </span>
                                                        )}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}
