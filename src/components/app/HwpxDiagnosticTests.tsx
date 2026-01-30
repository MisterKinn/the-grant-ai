import { useState } from "react";
import { Download, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  exportCustomHwpxPassthrough,
  exportCustomHwpxJszipOnly,
  exportCustomHwpxReadWriteOnly,
  exportCustomHwpxSimpleReplace,
  exportCustomHwpxRegexTest,
  exportCustomHwpxEscapeTest,
  exportCustomHwpxFull,
  exportCustomHwpxLineBreakTest,
} from "@/utils/hwpxCustomExportService";

interface HwpxDiagnosticTestsProps {
  templatePath?: string;
  markdownContent?: string;
  fileName?: string;
}

/**
 * HWPX Export Diagnostic Tests
 * 
 * 각 테스트가 성공하면 한글에서 파일이 열립니다.
 * 
 * 테스트 순서 및 예상 결과:
 * 
 * 1. 원본복제: 원본 파일 그대로 다운로드 → 반드시 열려야 함
 * 2. JSZip만: JSZip으로 로드 후 변경 없이 재생성 → 열려야 함 (안 열리면 JSZip 문제)
 * 3. XML읽기/쓰기: 섹션 XML을 string으로 읽고 그대로 다시 씀 → 열려야 함 (안 열리면 인코딩 문제)
 * 4. 간단치환: "소    속" → "TEST소속" 간단 치환 → 열려야 함 (안 열리면 string replace 문제)
 * 5. Regex패턴: 전체 export와 같은 regex 패턴 사용 → 열려야 함 (안 열리면 regex 문제)
 * 6. EscapeXml: XML 특수문자 이스케이프 적용 → 열려야 함 (안 열리면 escapeXml 문제)
 * 7. 전체Export: AI 생성 콘텐츠로 전체 치환 → 열려야 하고 값이 채워져야 함
 * 
 * 어떤 테스트에서 실패하는지 확인하여 문제 원인을 파악할 수 있습니다.
 */
export function HwpxDiagnosticTests({
  templatePath,
  markdownContent,
  fileName = "test_export",
}: HwpxDiagnosticTestsProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState<number | null>(null);

  const hasTemplate = !!templatePath;
  const hasContent = !!markdownContent && markdownContent.length > 0;

  const runTest = async (testNumber: number, testFn: () => Promise<void>, testName: string) => {
    if (!templatePath) {
      toast({
        variant: "destructive",
        title: "템플릿 경로 없음",
        description: "HWPX 템플릿 경로가 설정되지 않았습니다.",
      });
      return;
    }

    setIsExporting(testNumber);
    try {
      toast({ title: `테스트 ${testNumber}: ${testName}...`, duration: 3000 });
      await testFn();
      toast({
        title: `테스트 ${testNumber} 완료`,
        description: `${testName} 완료. 한글에서 파일을 열어보세요.`,
      });
    } catch (error) {
      console.error(`Test ${testNumber} error:`, error);
      toast({
        variant: "destructive",
        title: `테스트 ${testNumber} 실패`,
        description: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    } finally {
      setIsExporting(null);
    }
  };

  const tests = [
    {
      number: 1,
      name: "원본복제",
      description: "원본 파일 그대로 다운로드",
      expected: "반드시 열려야 함",
      fn: () => exportCustomHwpxPassthrough(templatePath!, `${fileName}_1_passthrough`),
      requiresContent: false,
    },
    {
      number: 2,
      name: "JSZip만",
      description: "JSZip 로드 후 변경없이 재생성",
      expected: "열려야 함 (안열리면 JSZip 문제)",
      fn: () => exportCustomHwpxJszipOnly(templatePath!, `${fileName}_2_jszip`),
      requiresContent: false,
    },
    {
      number: 3,
      name: "XML읽기/쓰기",
      description: "섹션 XML string 읽고 그대로 저장",
      expected: "열려야 함 (안열리면 인코딩 문제)",
      fn: () => exportCustomHwpxReadWriteOnly(templatePath!, `${fileName}_3_readwrite`),
      requiresContent: false,
    },
    {
      number: 4,
      name: "간단치환",
      description: '"소    속" → "TEST소속" 치환',
      expected: "열려야 함 (안열리면 replace 문제)",
      fn: () => exportCustomHwpxSimpleReplace(templatePath!, `${fileName}_4_simple`),
      requiresContent: false,
    },
    {
      number: 5,
      name: "Regex패턴",
      description: "전체 export와 동일한 regex 사용",
      expected: "열려야 함 (안열리면 regex 문제)",
      fn: () => exportCustomHwpxRegexTest(templatePath!, `${fileName}_5_regex`),
      requiresContent: false,
    },
    {
      number: 6,
      name: "EscapeXml",
      description: "XML 특수문자 이스케이프 적용",
      expected: "열려야 함 (안열리면 escape 문제)",
      fn: () => exportCustomHwpxEscapeTest(templatePath!, `${fileName}_6_escape`),
      requiresContent: false,
    },
    {
      number: 7,
      name: "줄바꿈테스트",
      description: "4가지 방법으로 줄바꿈 테스트",
      expected: "소속/직급/성명/생년월일 확인",
      fn: () => exportCustomHwpxLineBreakTest(templatePath!, `${fileName}_7_linebreak`),
      requiresContent: false,
      variant: "destructive" as const,
    },
    {
      number: 8,
      name: "전체Export",
      description: "AI 콘텐츠로 모든 필드 치환",
      expected: "열리고 값이 채워져야 함",
      fn: () => exportCustomHwpxFull(templatePath!, markdownContent || "", `${fileName}_8_full`),
      requiresContent: true,
      variant: "default" as const,
    },
  ];

  if (!hasTemplate) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle size={16} />
            <span className="text-sm">HWPX 템플릿 경로가 없습니다. 파일을 먼저 업로드해주세요.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          🔬 HWPX 내보내기 진단 테스트
        </CardTitle>
        <CardDescription className="text-xs">
          각 테스트 파일을 한글(HWP)에서 열어서 어느 단계에서 문제가 발생하는지 확인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          {tests.map((test) => {
            const isDisabled = 
              isExporting !== null || 
              (test.requiresContent && !hasContent);
            
            return (
              <Button
                key={test.number}
                onClick={() => runTest(test.number, test.fn, test.name)}
                disabled={isDisabled}
                variant={test.variant || "outline"}
                size="sm"
                className="text-xs"
                title={`${test.description}\n예상: ${test.expected}`}
              >
                {isExporting === test.number ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Download size={12} className="mr-1" />
                )}
                {test.number}: {test.name}
              </Button>
            );
          })}
        </div>
        
        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          <p>• <strong>1-3 실패</strong>: 파일 자체 또는 JSZip 문제</p>
          <p>• <strong>4-6 실패</strong>: 텍스트 치환 로직 문제</p>
          <p>• <strong>7만 실패</strong>: AI 콘텐츠 매핑 문제</p>
        </div>
      </CardContent>
    </Card>
  );
}
