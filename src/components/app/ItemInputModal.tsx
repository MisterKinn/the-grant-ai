import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Upload, X, FileText, CheckCircle2, Circle, Sparkles, FileUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseHwpxFile, contentBlocksToMarkdown, type PlaceholderField, type EssentialQuestion } from "@/utils/hwpxParser";

// Maximum characters to include from extracted PDF text
const MAX_PDF_TEXT_LENGTH = 15000;

// Grant type options
type GrantType = "PRE_STARTUP" | "YOUTH_ACADEMY" | "EARLY_STARTUP" | "STARTUP_CENTRAL" | "CUSTOM";

interface GrantTypeOption {
  value: GrantType;
  label: string;
  disabled?: boolean;
}

const GRANT_TYPE_OPTIONS: GrantTypeOption[] = [
  { value: "PRE_STARTUP", label: "2025 예비창업패키지" },
  { value: "YOUTH_ACADEMY", label: "2025 청년창업사관학교" },
  { value: "EARLY_STARTUP", label: "2026 초기창업패키지" },
  { value: "STARTUP_CENTRAL", label: "2025 창업중심대학(예정)", disabled: true },
  { value: "CUSTOM", label: "자유양식" },
];

// Checklist item derived from placeholders
interface ChecklistItem {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
}

interface ItemInputModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDocument: (title: string, supportType: string, grantType?: GrantType) => Promise<{ id: string } | null>;
  documents: { title: string }[];
}

type ModalStep = "select" | "analyzing" | "checklist" | "creating";

export function ItemInputModal({ open, onOpenChange, onCreateDocument, documents }: ItemInputModalProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [itemDescription, setItemDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedGrantType, setSelectedGrantType] = useState<GrantType>("PRE_STARTUP");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [hwpxFile, setHwpxFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hwpxInputRef = useRef<HTMLInputElement>(null);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [extractedPdfText, setExtractedPdfText] = useState<string>("");

  // New state for HWPX checklist flow
  const [modalStep, setModalStep] = useState<ModalStep>("select");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [projectDescription, setProjectDescription] = useState("");
  const [parsedData, setParsedData] = useState<{
    hwpxTemplatePath: string;
    modifiedTemplatePath: string;
    parsedPlainText: string;
    parsedContentWithImages: string;
    placeholders: PlaceholderField[];
    questions: EssentialQuestion[];
  } | null>(null);

  // Generate next available "제목 없음" title
  const generateTitle = () => {
    const baseTitles = documents
      .map(doc => doc.title)
      .filter(title => title.startsWith("제목 없음"));
    
    if (!baseTitles.includes("제목 없음")) {
      return "제목 없음";
    }
    
    // Find the highest number
    let maxNum = 0;
    for (const title of baseTitles) {
      const match = title.match(/제목 없음\((\d+)\)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    
    return `제목 없음(${maxNum + 1})`;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast({
          variant: "destructive",
          title: "PDF 파일만 업로드 가능합니다",
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
      
      setUploadedFile(file);
      setIsExtractingPdf(true);
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          toast({
            variant: "destructive",
            title: "로그인 필요",
            description: "PDF 업로드를 위해 로그인이 필요합니다.",
          });
          setUploadedFile(null);
          setIsExtractingPdf(false);
          return;
        }
        
        // Upload PDF to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('project_files')
          .upload(fileName, file);
        
        if (uploadError) {
          console.error("PDF upload error:", uploadError);
          throw uploadError;
        }
        
        // Extract text from PDF
        const { data, error } = await supabase.functions.invoke('parse-pdf', {
          body: { filePath: fileName, fileName: file.name, bucket: 'project_files' }
        });
        
        if (error) throw error;
        
        if (data?.text) {
          setExtractedPdfText(data.text);
          toast({
            title: "PDF 텍스트 추출 완료",
            description: `${file.name}에서 텍스트를 추출했습니다.`,
          });
        } else {
          throw new Error("텍스트를 추출할 수 없습니다.");
        }
      } catch (error) {
        console.error("PDF extraction error:", error);
        toast({
          variant: "destructive",
          title: "PDF 처리 실패",
          description: "PDF에서 텍스트를 추출하는 중 오류가 발생했습니다.",
        });
        setUploadedFile(null);
        setExtractedPdfText("");
      } finally {
        setIsExtractingPdf(false);
      }
    }
  };

  const handleHwpxFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    setModalStep("analyzing");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // For guest users, we'll skip the upload step for now
      // and just show a generic checklist
      if (!user) {
        // Create a generic checklist for guest users
        setChecklistItems([
          { id: "company_name", label: "회사/팀명", hint: "사업을 운영할 팀 또는 회사 이름", checked: true },
          { id: "business_idea", label: "사업 아이디어", hint: "핵심 비즈니스 아이디어", checked: true },
          { id: "problem", label: "해결할 문제", hint: "목표 고객이 겪는 문제점", checked: true },
          { id: "solution", label: "해결 방안", hint: "제시하는 솔루션", checked: true },
          { id: "market", label: "시장 분석", hint: "목표 시장 규모 및 현황", checked: true },
          { id: "team", label: "팀 구성", hint: "팀원 소개 및 역할", checked: true },
        ]);
        setModalStep("checklist");
        toast({
          title: "HWPX 분석 완료",
          description: "아래 체크리스트를 확인하고 프로젝트를 설명해주세요.",
        });
        return;
      }

      // Upload HWPX file for analysis
      const sanitizedName = file.name
        .replace(/[^\x00-\x7F]/g, "_")
        .replace(/[\[\]\(\)\{\}<>'"!@#$%^&*+=|\\:;,?~`]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_(?=\.)/g, "");
      const hwpxFileName = `${user.id}/templates/${Date.now()}_${sanitizedName}`;
      
      const { error: hwpxUploadError } = await supabase.storage
        .from("project_files")
        .upload(hwpxFileName, file);

      if (hwpxUploadError) {
        console.error("HWPX upload error:", hwpxUploadError);
        toast({
          variant: "destructive",
          title: "HWPX 파일 업로드에 실패했습니다",
        });
        setModalStep("select");
        return;
      }

      // Record uploaded file
      await supabase.from("uploaded_files").insert({
        user_id: user.id,
        file_name: file.name,
        file_path: hwpxFileName,
        file_size: file.size,
        file_type: "application/hwpx",
      });

      // Parse HWPX file
      const parseResult = await parseHwpxFile(hwpxFileName);
      
      if (!parseResult.success) {
        toast({
          variant: "destructive",
          title: "HWPX 파싱 실패",
          description: parseResult.error || "파일 형식을 확인해주세요.",
        });
        setModalStep("select");
        return;
      }

      // Convert to checklist items from placeholders
      const items: ChecklistItem[] = parseResult.placeholders.slice(0, 10).map(p => ({
        id: p.id,
        label: p.label,
        hint: p.hint || p.originalText?.substring(0, 50) || "",
        checked: true,
      }));

      // Add essential questions as checklist items if not already included
      for (const q of parseResult.essentialQuestions) {
        if (!items.some(item => item.id === q.id)) {
          items.push({
            id: q.id,
            label: q.question,
            hint: "",
            checked: true,
          });
        }
      }

      // If no items detected, add generic ones
      if (items.length === 0) {
        items.push(
          { id: "company_name", label: "회사/팀명", hint: "사업을 운영할 팀 또는 회사 이름", checked: true },
          { id: "business_idea", label: "사업 아이디어", hint: "핵심 비즈니스 아이디어", checked: true },
          { id: "problem", label: "해결할 문제", hint: "목표 고객이 겪는 문제점", checked: true },
        );
      }

      setChecklistItems(items);
      
      // Store parsed data for later use
      const parsedContent = parseResult.contentBlocks && parseResult.contentBlocks.length > 0
        ? contentBlocksToMarkdown(parseResult.contentBlocks)
        : parseResult.plainText;

      setParsedData({
        hwpxTemplatePath: hwpxFileName,
        modifiedTemplatePath: parseResult.templatePath || hwpxFileName,
        parsedPlainText: parseResult.plainText,
        parsedContentWithImages: parsedContent,
        placeholders: parseResult.placeholders,
        questions: parseResult.essentialQuestions,
      });

      setModalStep("checklist");
      
      toast({
        title: "HWPX 분석 완료",
        description: `${parseResult.regionCount}개의 편집 영역이 발견되었습니다. 체크리스트를 확인해주세요.`,
      });
    } catch (error) {
      console.error("Error analyzing HWPX:", error);
      toast({
        variant: "destructive",
        title: "파일 분석 중 오류가 발생했습니다",
      });
      setModalStep("select");
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setExtractedPdfText("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveHwpxFile = () => {
    setHwpxFile(null);
    setParsedData(null);
    setChecklistItems([]);
    setProjectDescription("");
    setModalStep("select");
    if (hwpxInputRef.current) {
      hwpxInputRef.current.value = "";
    }
  };

  const toggleChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const handleChecklistSubmit = async () => {
    if (!projectDescription.trim()) {
      toast({
        variant: "destructive",
        title: "프로젝트 설명을 입력해주세요",
        description: "AI가 사업계획서를 작성하는 데 필요합니다.",
      });
      return;
    }

    setModalStep("creating");
    setIsCreating(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const title = hwpxFile 
        ? hwpxFile.name.replace(/\.hwpx$/i, "") 
        : generateTitle();
      
      const supportType = "custom";
      const doc = await onCreateDocument(title, supportType, "CUSTOM");
      
      if (doc) {
        // Store template info in document for later export
        if (parsedData?.hwpxTemplatePath) {
          await supabase
            .from("documents")
            .update({ 
              plain_text: parsedData.parsedContentWithImages || parsedData.parsedPlainText,
              hwpx_template_path: parsedData.modifiedTemplatePath || parsedData.hwpxTemplatePath,
            })
            .eq("id", doc.id);
        }

        onOpenChange(false);
        resetState();
        
        // Build context from checklist for AI
        const checkedItems = checklistItems.filter(item => item.checked);
        const checklistContext = checkedItems.map(item => `- ${item.label}`).join("\n");
        
        // Navigate to document editor with project description as initial prompt
        navigate(`/app/document/${doc.id}`, {
          state: { 
            initialPrompt: `아래 프로젝트에 대해 사업계획서를 작성해주세요.\n\n**프로젝트 설명:**\n${projectDescription}\n\n**포함해야 할 항목:**\n${checklistContext}`,
            grantType: "CUSTOM",
            hwpxTemplatePath: parsedData?.hwpxTemplatePath,
            isCustomTemplate: true,
            hwpxPlaceholders: parsedData?.placeholders || [],
            hwpxQuestions: parsedData?.questions || [],
            hwpxParsedPlainText: parsedData?.parsedContentWithImages || parsedData?.parsedPlainText || "",
          }
        });
      }
    } catch (error) {
      console.error("Error creating document:", error);
      toast({
        variant: "destructive",
        title: "문서 생성 중 오류가 발생했습니다",
      });
      setModalStep("checklist");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = async () => {
    // For CUSTOM type, the flow goes through handleHwpxFileSelect -> checklist -> handleChecklistSubmit
    if (selectedGrantType === "CUSTOM") {
      if (!hwpxFile) {
        toast({
          variant: "destructive",
          title: "HWPX 파일을 업로드해주세요",
        });
        return;
      }
      // This shouldn't be reached as the flow goes through checklist
      return;
    }

    if (!itemDescription.trim()) {
      toast({
        variant: "destructive",
        title: "아이템 설명을 입력해주세요",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let uploadedFilePath = "";
      let uploadedFileNameToPass = "";
      
      // PDF 파일이 업로드된 경우 Storage에 업로드
      if (uploadedFile && user) {
        const fileName = `${user.id}/${Date.now()}_${uploadedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("project_files")
          .upload(fileName, uploadedFile);
        
        if (!uploadError) {
          uploadedFilePath = fileName;
          uploadedFileNameToPass = uploadedFile.name;
          
          await supabase.from("uploaded_files").insert({
            user_id: user.id,
            file_name: uploadedFile.name,
            file_path: fileName,
            file_size: uploadedFile.size,
            file_type: uploadedFile.type,
          });
        }
      }

      const title = generateTitle();
      // Map grant type to support type for template selection
      const supportType = selectedGrantType === "EARLY_STARTUP" ? "early_startup" : "preliminary";
      const doc = await onCreateDocument(title, supportType, selectedGrantType);
      
      if (doc) {
        onOpenChange(false);
        resetState();
        
        // Create the AI prompt with instructions to generate the document
        let aiPrompt = `아래 아이템 설명을 바탕으로 사업계획서를 작성해주세요.\n\n**아이템 설명:**\n${itemDescription.trim()}`;
        
        // If PDF was uploaded and text was extracted, include truncated version in the prompt
        if (extractedPdfText) {
          const truncatedPdfText = extractedPdfText.length > MAX_PDF_TEXT_LENGTH 
            ? extractedPdfText.substring(0, MAX_PDF_TEXT_LENGTH) + "\n\n... (이하 생략)"
            : extractedPdfText;
          aiPrompt = `아래 아이템 설명과 참고 자료를 바탕으로 사업계획서를 작성해주세요.\n\n**아이템 설명:**\n${itemDescription.trim()}\n\n**참고 자료 (업로드된 PDF 요약):**\n${truncatedPdfText}`;
        }
        
        navigate(`/app/document/${doc.id}`, {
          state: { 
            initialPrompt: aiPrompt,
            grantType: selectedGrantType,
            uploadedFilePath,
            uploadedFileName: uploadedFileNameToPass,
          }
        });
      }
    } catch (error) {
      console.error("Error creating document:", error);
      toast({
        variant: "destructive",
        title: "문서 생성 중 오류가 발생했습니다",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetState = () => {
    setItemDescription("");
    setUploadedFile(null);
    setExtractedPdfText("");
    setHwpxFile(null);
    setSelectedGrantType("PRE_STARTUP");
    setModalStep("select");
    setChecklistItems([]);
    setProjectDescription("");
    setParsedData(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Disable Enter submit for CUSTOM type (needs file upload)
    if (selectedGrantType === "CUSTOM") return;
    
    if (e.key === "Enter" && !e.shiftKey && itemDescription.trim() && !isCreating) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  // Render checklist step for CUSTOM type
  const renderChecklistStep = () => (
    <div className="py-4 space-y-5">
      {/* File info */}
      <div className="flex items-center justify-between p-3 bg-accent rounded-lg border">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary" />
          <span className="text-sm truncate max-w-[200px]">{hwpxFile?.name}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRemoveHwpxFile}
          className="h-8 w-8"
        >
          <X size={16} />
        </Button>
      </div>

      {/* Analyzed items as bullet list */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">AI가 분석한 작성 항목</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Hey yo, you should involve this in your description:
        </p>
        <ScrollArea className="h-[140px] border rounded-lg p-3">
          <ul className="list-disc list-inside space-y-1.5">
            {checklistItems.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium">{item.label}</span>
                {item.hint && (
                  <span className="text-muted-foreground ml-1">— {item.hint}</span>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>

      {/* Project description */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">프로젝트 설명</Label>
        <p className="text-xs text-muted-foreground">
          위 체크리스트 항목을 참고하여 프로젝트에 대해 자세히 설명해주세요.
        </p>
        <Textarea
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          placeholder="예: 저희는 AI 기반 헬스케어 스타트업으로, 당뇨병 환자를 위한 개인 맞춤형 식단 추천 앱을 개발하고 있습니다. 팀은 의료진 2명과 개발자 3명으로 구성되어 있으며..."
          className="min-h-[120px] resize-none"
        />
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleRemoveHwpxFile}
          disabled={isCreating}
        >
          취소
        </Button>
        <Button
          onClick={handleChecklistSubmit}
          disabled={!projectDescription.trim() || isCreating}
          className="flex-1"
        >
          {isCreating ? (
            <Loader2 size={18} className="animate-spin mr-2" />
          ) : (
            <Sparkles size={18} className="mr-2" />
          )}
          {isCreating ? "생성 중..." : "AI로 사업계획서 작성 시작"}
        </Button>
      </div>
    </div>
  );

  // Render analyzing step
  const renderAnalyzingStep = () => (
    <div className="py-12 flex flex-col items-center justify-center gap-4">
      <Loader2 size={32} className="animate-spin text-primary" />
      <div className="text-center">
        <p className="font-medium">HWPX 파일을 분석 중입니다...</p>
        <p className="text-sm text-muted-foreground">잠시만 기다려주세요.</p>
      </div>
    </div>
  );

  // Render select step (original UI)
  const renderSelectStep = () => (
    <div className="py-4 space-y-5">
      {/* Grant Type Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">지원사업 양식 선택</Label>
        <p className="text-xs text-muted-foreground mb-2">지원하려는 공고를 선택해주세요.</p>
        <div className="flex flex-wrap gap-2">
          {GRANT_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => !option.disabled && setSelectedGrantType(option.value)}
              className={cn(
                "px-3 py-2 text-sm rounded-lg border transition-all",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                selectedGrantType === option.value && !option.disabled
                  ? "bg-primary text-primary-foreground border-primary"
                  : option.disabled
                    ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50"
                    : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-accent"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* HWPX Upload for CUSTOM type */}
      {selectedGrantType === "CUSTOM" && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">HWPX 파일 업로드</Label>
          <p className="text-xs text-muted-foreground mb-2">
            HWPX 파일을 업로드하면 AI가 분석하여 작성해야 할 항목을 안내합니다.
          </p>
          
          <input
            ref={hwpxInputRef}
            type="file"
            accept=".hwpx"
            onChange={handleHwpxFileSelect}
            className="hidden"
          />
          
          {hwpxFile ? (
            <div className="flex items-center justify-between p-3 bg-accent rounded-lg border">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-primary" />
                <span className="text-sm truncate max-w-[200px]">{hwpxFile.name}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveHwpxFile}
                className="h-8 w-8"
              >
                <X size={16} />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => hwpxInputRef.current?.click()}
              className="w-full"
            >
              <Upload size={18} className="mr-2" />
              HWPX 파일 선택
            </Button>
          )}
        </div>
      )}

      {/* Item Description - only for non-custom types */}
      {selectedGrantType !== "CUSTOM" && (
        <div className="space-y-2">
          <Textarea
            value={itemDescription}
            onChange={(e) => setItemDescription(e.target.value)}
            placeholder="아이템 설명을 입력하면, AI가 사업계획서를 작성합니다."
            className="min-h-[120px] resize-none"
            onKeyDown={handleKeyDown}
          />
          
          {/* PDF Upload Section */}
          <div className="pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            {uploadedFile ? (
              <div className="flex items-center justify-between p-3 bg-accent rounded-lg border">
                <div className="flex items-center gap-2">
                  {isExtractingPdf ? (
                    <Loader2 size={18} className="text-primary animate-spin" />
                  ) : extractedPdfText ? (
                    <CheckCircle2 size={18} className="text-green-500" />
                  ) : (
                    <FileText size={18} className="text-primary" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm truncate max-w-[200px]">{uploadedFile.name}</span>
                    {isExtractingPdf && (
                      <span className="text-xs text-muted-foreground">텍스트 추출 중...</span>
                    )}
                    {extractedPdfText && !isExtractingPdf && (
                      <span className="text-xs text-green-600">텍스트 추출 완료</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRemoveFile}
                  disabled={isExtractingPdf}
                  className="h-8 w-8"
                >
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-muted-foreground"
                size="sm"
              >
                <FileUp size={16} className="mr-2" />
                참고 자료 PDF 업로드 (선택)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Submit button - only for non-custom types */}
      {selectedGrantType !== "CUSTOM" && (
        <Button
          onClick={handleSubmit}
          disabled={!itemDescription.trim() || isCreating || isExtractingPdf}
          className="w-full"
        >
          {isCreating ? (
            <Loader2 size={18} className="animate-spin mr-2" />
          ) : (
            <Send size={18} className="mr-2" />
          )}
          {isCreating ? "생성 중..." : "사업계획서 작성 시작"}
        </Button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {modalStep === "checklist" ? "작성 항목 확인" : "아이템 입력"}
          </DialogTitle>
        </DialogHeader>

        {modalStep === "analyzing" && renderAnalyzingStep()}
        {modalStep === "checklist" && renderChecklistStep()}
        {(modalStep === "select" || modalStep === "creating") && renderSelectStep()}
      </DialogContent>
    </Dialog>
  );
}
