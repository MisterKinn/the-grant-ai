import { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  FileText, 
  Plus, 
  Trash2, 
  PanelLeftClose,
  PanelLeft,
  LogOut,
  User,
  Home,
  Crown,
  Sparkles,
  Lock,
  Calendar,
  RefreshCw,
  Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocuments, Document } from "@/hooks/useDocuments";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemInputModal } from "./ItemInputModal";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { documents, loading, deleteDocument, createDocument, updateDocument } = useDocuments();
  const { user, profile, signOut, getPlanLabel, refreshProfile } = useAuth();
  const [showItemInputModal, setShowItemInputModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [cancellingSubscription, setCancellingSubscription] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // 유료 회원 여부 확인
  const isPaidUser = profile?.plan_type === "monthly" || profile?.plan_type === "season";
  const isMonthlySubscriber = profile?.plan_type === "monthly" && profile?.billing_key;
  
  // 무료 회원은 문서가 0개일 때만 생성 가능
  const canCreateDocument = isPaidUser || documents.length === 0;

  // 만료일 포맷
  const formatExpiryDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  };

  const handleNewDocumentClick = () => {
    if (!canCreateDocument) {
      setShowLimitModal(true);
      return;
    }
    setShowItemInputModal(true);
  };

  const handleCancelSubscription = async () => {
    setCancellingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-subscription");
      
      if (error) {
        console.error("Cancel subscription error:", error);
        toast.error("구독 취소 중 오류가 발생했습니다.");
        return;
      }

      if (!data.success) {
        toast.error(data.error || "구독 취소에 실패했습니다.");
        return;
      }

      toast.success("구독이 취소되었습니다. 현재 이용 기간이 끝날 때까지 계속 이용하실 수 있습니다.");
      setShowSubscriptionModal(false);
      await refreshProfile();
    } catch (err) {
      console.error("Cancel subscription exception:", err);
      toast.error("구독 취소 중 오류가 발생했습니다.");
    } finally {
      setCancellingSubscription(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDocument(id);
    if (location.pathname.includes(id)) {
      navigate("/app");
    }
  };

  // 더블클릭으로 이름 변경 시작
  const handleDoubleClick = (doc: Document) => {
    setEditingDocId(doc.id);
    setEditingTitle(doc.title || "");
  };

  // 이름 변경 저장
  const handleSaveTitle = async () => {
    if (editingDocId && editingTitle.trim()) {
      await updateDocument(editingDocId, { title: editingTitle.trim() });
      toast.success("문서 이름이 변경되었습니다.");
    }
    setEditingDocId(null);
    setEditingTitle("");
  };

  // 이름 변경 취소
  const handleCancelEdit = () => {
    setEditingDocId(null);
    setEditingTitle("");
  };

  // 엔터키 또는 ESC 키 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveTitle();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  // 편집 모드일 때 input에 포커스
  useEffect(() => {
    if (editingDocId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingDocId]);

  return (
    <>
      <aside
        className={cn(
          "h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
          {!collapsed && (
            <Link to="/" className="text-lg font-bold text-sidebar-foreground hover:opacity-80 transition-opacity">
              The <span className="text-sidebar-primary">Grant AI</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </Button>
        </div>

        {/* New Document Button */}
        <div className="p-3">
          <Button
            onClick={handleNewDocumentClick}
            className={cn(
              "w-full bg-sidebar-primary hover:bg-sidebar-primary/90",
              collapsed ? "px-2" : ""
            )}
          >
            <Plus size={18} />
            {!collapsed && <span className="ml-2">새 문서</span>}
          </Button>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto px-3">
          {!collapsed && (
            <p className="text-xs text-sidebar-foreground/60 px-2 py-2 uppercase tracking-wider">
              내 문서
            </p>
          )}
          <nav className="space-y-1">
            {loading ? (
              // Loading skeletons
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-2">
                    <Skeleton className="h-4 w-4 shrink-0" />
                    {!collapsed && <Skeleton className="h-4 flex-1" />}
                  </div>
                ))}
              </>
            ) : documents.length === 0 ? (
              !collapsed && (
                <p className="text-sm text-sidebar-foreground/50 px-2 py-4 text-center">
                  문서가 없습니다
                </p>
              )
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-2 rounded-lg transition-colors",
                    location.pathname === `/app/document/${doc.id}`
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  {editingDocId === doc.id ? (
                    // 편집 모드
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText size={18} className="shrink-0" />
                      <Input
                        ref={editInputRef}
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={handleKeyDown}
                        className="h-6 text-sm px-1 py-0 border-primary"
                      />
                    </div>
                  ) : (
                    // 일반 모드
                    <>
                      <Link
                        to={`/app/document/${doc.id}`}
                        className="flex items-center gap-2 flex-1 min-w-0"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          if (!collapsed) handleDoubleClick(doc);
                        }}
                      >
                        <FileText size={18} className="shrink-0" />
                        {!collapsed && (
                          <span className="truncate text-sm" title="더블클릭하여 이름 변경">{doc.title}</span>
                        )}
                      </Link>
                      {!collapsed && (
                        <div className="flex items-center gap-0.5">
                          <button
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-primary transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDoubleClick(doc);
                            }}
                            title="이름 변경"
                          >
                            <Pencil size={14} />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition-opacity"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 size={14} />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>문서 삭제</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{doc.title}" 문서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>취소</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(doc.id)}>
                                  삭제
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </nav>
        </div>

        {/* User Section */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          {user && !collapsed && (
            <div className="px-2 py-2 space-y-2">
              {/* Plan Status Badge */}
              <div className="flex items-center gap-2">
                {profile?.plan_type && profile.plan_type !== "free" ? (
                  <Badge variant="default" className="bg-primary/20 text-primary border-primary/30 gap-1">
                    <Crown size={12} />
                    {getPlanLabel()}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles size={12} />
                    {getPlanLabel()}
                  </Badge>
                )}
              </div>
              {/* Subscription Info for Monthly */}
              {isMonthlySubscriber && profile?.plan_expires_at && (
                <button
                  onClick={() => setShowSubscriptionModal(true)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Calendar size={12} />
                  <span>{formatExpiryDate(profile.plan_expires_at)}까지</span>
                  {profile.auto_renew && <RefreshCw size={10} className="text-primary" />}
                </button>
              )}
              {/* User Email */}
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <User size={18} className="shrink-0" />
                <span className="truncate text-sm flex-1">{user.email}</span>
              </div>
            </div>
          )}
          {user && collapsed && (
            <div className="flex items-center justify-center px-2 py-2 text-sidebar-foreground">
              <User size={18} className="shrink-0" />
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className={cn(
              "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent",
              collapsed ? "px-2" : ""
            )}
          >
            <Home size={18} />
            {!collapsed && <span className="ml-2">홈으로</span>}
          </Button>
          <Button
            variant="ghost"
            onClick={signOut}
            className={cn(
              "w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent",
              collapsed ? "px-2" : ""
            )}
          >
            <LogOut size={18} />
            {!collapsed && <span className="ml-2">로그아웃</span>}
          </Button>
        </div>
      </aside>

      <ItemInputModal 
        open={showItemInputModal} 
        onOpenChange={setShowItemInputModal} 
        onCreateDocument={createDocument}
        documents={documents}
      />

      {/* 무료 회원 제한 알림 모달 */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-lg max-w-md mx-4">
            <Lock size={48} className="mx-auto text-primary mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">무료 생성 횟수 소진</h3>
            <p className="text-muted-foreground mb-6">
              무료회원의 문서 생성 횟수를 모두 사용하셨습니다.
              <br />
              무제한 문서 생성을 위해 구독을 시작해 보세요.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowLimitModal(false)} className="flex-1">
                닫기
              </Button>
              <Button onClick={() => { setShowLimitModal(false); navigate("/#pricing"); }} className="flex-1">
                구독하러 가기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 구독 관리 모달 */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-lg max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-foreground">구독 관리</h3>
              <button 
                onClick={() => setShowSubscriptionModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* 현재 플랜 */}
              <div className="p-4 rounded-xl bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">현재 플랜</span>
                  <Badge variant="default" className="bg-primary/20 text-primary border-primary/30">
                    {getPlanLabel()}
                  </Badge>
                </div>
                
                {profile?.plan_expires_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">이용 기간</span>
                    <span className="text-sm text-foreground">
                      {formatExpiryDate(profile.plan_expires_at)}까지
                    </span>
                  </div>
                )}
                
                {profile?.credits !== null && profile?.credits !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">남은 크레딧</span>
                    <span className="text-sm text-foreground font-medium">
                      {profile.credits.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* 자동 갱신 상태 */}
              {isMonthlySubscriber && (
                <div className="p-4 rounded-xl border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">자동 갱신</p>
                      <p className="text-xs text-muted-foreground">
                        {profile?.auto_renew 
                          ? "매월 자동으로 결제됩니다" 
                          : "자동 갱신이 비활성화되었습니다"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {profile?.auto_renew ? (
                        <Badge variant="outline" className="text-primary border-primary/30">
                          활성
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          비활성
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 구독 취소 버튼 */}
              {isMonthlySubscriber && profile?.auto_renew && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10">
                      구독 취소
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>구독을 취소하시겠습니까?</AlertDialogTitle>
                      <AlertDialogDescription>
                        구독을 취소하시면 자동 갱신이 중단됩니다.
                        현재 이용 기간({formatExpiryDate(profile?.plan_expires_at)})까지는 계속 이용하실 수 있습니다.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>돌아가기</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleCancelSubscription}
                        disabled={cancellingSubscription}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        {cancellingSubscription ? "처리 중..." : "구독 취소"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
