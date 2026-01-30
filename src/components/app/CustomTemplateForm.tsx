import { useState } from "react";
import { Loader2, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EssentialQuestion, PlaceholderField } from "@/utils/hwpxParser";

interface CustomTemplateFormProps {
  templatePath: string;
  placeholders: PlaceholderField[];
  essentialQuestions: EssentialQuestion[];
  onSubmit: (inputs: Record<string, string>) => void;
  onCancel: () => void;
  isGenerating: boolean;
}

export function CustomTemplateForm({
  placeholders,
  essentialQuestions,
  onSubmit,
  onCancel,
  isGenerating,
}: CustomTemplateFormProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const handleInputChange = (id: string, value: string) => {
    setInputs((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = () => {
    onSubmit(inputs);
  };

  const isValid = essentialQuestions
    .filter((q) => q.required)
    .every((q) => inputs[q.id]?.trim());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="h-5 w-5" />
        <span className="text-sm font-medium">
          AI가 템플릿을 분석하여 {placeholders.length}개의 편집 영역을 발견했습니다
        </span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            필수 정보 입력
          </CardTitle>
          <CardDescription>
            아래 질문에 답변해주시면 AI가 템플릿에 맞게 내용을 생성합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-5">
              {essentialQuestions.map((question) => (
                <div key={question.id} className="space-y-2">
                  <Label htmlFor={question.id} className="text-sm font-medium">
                    {question.question}
                    {question.required && (
                      <span className="text-destructive ml-1">*</span>
                    )}
                  </Label>
                  <Textarea
                    id={question.id}
                    value={inputs[question.id] || ""}
                    onChange={(e) => handleInputChange(question.id, e.target.value)}
                    placeholder="내용을 입력하세요..."
                    className="min-h-[80px] resize-none"
                  />
                </div>
              ))}

              {placeholders
                .filter((p) => !essentialQuestions.some((q) => q.id === p.id))
                .slice(0, 5)
                .map((placeholder) => (
                  <div key={placeholder.id} className="space-y-2">
                    <Label htmlFor={placeholder.id} className="text-sm font-medium">
                      {placeholder.label}
                    </Label>
                    <Input
                      id={placeholder.id}
                      value={inputs[placeholder.id] || ""}
                      onChange={(e) => handleInputChange(placeholder.id, e.target.value)}
                      placeholder={placeholder.hint}
                    />
                    {placeholder.originalText && (
                      <p className="text-xs text-muted-foreground">
                        기존 내용: {placeholder.originalText.substring(0, 50)}...
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
          취소
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={!isValid || isGenerating}
          className="flex-1"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              AI 생성 중...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              AI로 내용 생성하기
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
