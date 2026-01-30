import { useState, useRef, useCallback } from "react";
import { Upload, Loader2, FileText, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PdfUploaderProps {
  onTextExtracted?: (text: string, fileName: string) => void;
  className?: string;
}

export function PdfUploader({ onTextExtracted, className }: PdfUploaderProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const extractTextFromPdf = async (filePath: string, fileName: string) => {
    setIsExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-pdf', {
        body: { filePath, fileName }
      });

      if (error) throw error;

      if (data?.text) {
        setUploadedFile({ name: fileName, text: data.text });
        onTextExtracted?.(data.text, fileName);
        toast({
          title: "텍스트 추출 완료",
          description: `${fileName}에서 텍스트를 추출했습니다.`,
        });
      } else {
        throw new Error("텍스트를 추출할 수 없습니다.");
      }
    } catch (error) {
      console.error("Text extraction error:", error);
      toast({
        variant: "destructive",
        title: "추출 실패",
        description: "PDF에서 텍스트를 추출하는 중 오류가 발생했습니다.",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return;
    
    const isPdf = file.name.toLowerCase().endsWith('.pdf');
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
    setUploadProgress(0);
    setUploadedFile(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          variant: "destructive",
          title: "로그인 필요",
          description: "파일 업로드를 위해 로그인이 필요합니다.",
        });
        return;
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('user-uploads')
        .upload(fileName, file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) throw uploadError;

      toast({
        title: "업로드 완료",
        description: "텍스트를 추출하는 중...",
      });

      // Extract text from the uploaded PDF
      await extractTextFromPdf(fileName, file.name);

    } catch (error) {
      console.error("File upload error:", error);
      toast({
        variant: "destructive",
        title: "업로드 실패",
        description: "파일 업로드 중 오류가 발생했습니다.",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [toast, onTextExtracted]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
  };

  const isProcessing = isUploading || isExtracting;

  return (
    <div className={cn("flex flex-col h-full bg-card border-l border-border", className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText size={20} className="text-primary" />
          <h3 className="font-semibold text-foreground">PDF 텍스트 변환</h3>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* Upload area */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border",
            isProcessing && "opacity-50 pointer-events-none"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isProcessing ? (
            <div className="space-y-4">
              <Loader2 size={48} className="mx-auto text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {isUploading ? "업로드 중..." : "텍스트 추출 중..."}
              </p>
              {isUploading && (
                <Progress value={uploadProgress} className="w-full max-w-xs mx-auto" />
              )}
            </div>
          ) : (
            <>
              <Upload size={48} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-sm font-medium text-foreground mb-2">
                PDF 파일을 여기에 드래그하거나
              </p>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                파일 선택
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                최대 20MB, PDF 파일만 지원
              </p>
            </>
          )}
        </div>

        {/* Uploaded file result */}
        {uploadedFile && (
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground truncate">
                  {uploadedFile.name}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearUploadedFile}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              >
                <X size={14} />
              </Button>
            </div>
            <div className="bg-background rounded border border-border p-3 max-h-[400px] overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">추출된 텍스트:</p>
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                {uploadedFile.text}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".pdf"
        className="hidden"
      />
    </div>
  );
}
