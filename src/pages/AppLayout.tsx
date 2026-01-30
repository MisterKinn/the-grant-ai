import { useState, useEffect } from "react";
import { Outlet, Navigate, useLocation, Link, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/app/AppSidebar";
import { ItemInputModal } from "@/components/app/ItemInputModal";
import { useAuth } from "@/hooks/useAuth";
import { useDocuments } from "@/hooks/useDocuments";
import { Loader2, FileText, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppLayout() {
  const { user, loading, profile } = useAuth();
  const { documents, loading: documentsLoading, createDocument } = useDocuments();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showItemInputModal, setShowItemInputModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  // 유료 회원 여부 확인
  const isPaidUser = profile?.plan_type === "monthly" || profile?.plan_type === "season";

  // [무료 회원/비로그인 제한] 문서가 하나도 없을 때만 생성 가능
  // 비로그인 사용자도 1개 문서 생성 가능 (게스트 체험)
  const canCreateDocument = isPaidUser || documents.length === 0;

  const handleNewDocumentClick = () => {
    if (!canCreateDocument) {
      setShowLimitModal(true);
      return;
    }
    setShowItemInputModal(true);
  };

  const handleUpgradeClick = () => {
    setShowLimitModal(false);
    navigate("/#pricing");
    setTimeout(() => {
      const pricingSection = document.getElementById("pricing");
      if (pricingSection) {
        pricingSection.scrollIntoView({ behavior: "smooth" });
      }
    }, 150);
  };

  // [랜딩 로직] 무료 회원/비로그인 사용자 문서가 0개일 때만 입력창 자동 오픈
  // 문서가 1개 이상 있으면 구독 제한 모달 표시
  useEffect(() => {
    // 프로필이 아직 로딩 중이면 대기 (로그인 사용자의 경우)
    if (user && !profile) return;
    
    if (!documentsLoading && location.pathname === "/app") {
      // 유료 회원은 모달 표시하지 않음
      if (isPaidUser) {
        setShowLimitModal(false);
        return;
      }
      
      // 비로그인 사용자 또는 무료 회원
      if (!user || !isPaidUser) {
        if (documents.length === 0) {
          // 문서 0개 → 아이템 입력 모달
          setShowItemInputModal(true);
        } else if (user && !isPaidUser) {
          // 로그인한 무료 회원 + 문서 1개 이상 → 구독 유도 모달
          setShowLimitModal(true);
        }
      }
    }
  }, [user, profile, location.pathname, documentsLoading, documents.length, isPaidUser]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 비로그인 사용자도 /app 접근 가능 - 로그인 없이 문서 생성 체험
  // if (!user) {
  //   return <Navigate to="/" replace />;
  // }

  // 대시보드 화면 (/app)
  if (location.pathname === "/app") {
    if (documentsLoading) {
      return (
        <div className="flex h-screen w-full bg-background">
          <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <main className="flex-1 overflow-auto p-8">
            <div className="max-w-4xl mx-auto flex flex-col items-center justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">문서를 불러오는 중입니다...</p>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="flex h-screen w-full bg-background">
        <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-foreground">내 문서함</h1>
              <Button onClick={handleNewDocumentClick}>
                <Plus size={18} className="mr-2" />새 문서
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="mx-auto text-muted-foreground mb-4" size={48} />
                <p className="text-muted-foreground">아직 생성된 문서가 없습니다.</p>
                <Button className="mt-4" onClick={handleNewDocumentClick}>
                  <Plus size={18} className="mr-2" />새 문서 작성
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/app/document/${doc.id}`}
                    className="p-6 bg-card border border-border rounded-lg hover:border-primary/50 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="text-primary shrink-0 mt-1" size={20} />
                      <div className="min-w-0">
                        <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {doc.title || "제목 없는 문서"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {new Date(doc.updated_at).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

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
                  무료 회원은 문서를 1개까지만 생성할 수 있습니다.
                  <br />
                  무제한 문서 생성을 위해 구독을 시작해 보세요.
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowLimitModal(false)} className="flex-1">
                    닫기
                  </Button>
                  <Button onClick={handleUpgradeClick} className="flex-1">
                    구독하러 가기
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
