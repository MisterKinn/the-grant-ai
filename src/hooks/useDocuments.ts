import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: any;
  plain_text: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Guest document storage key
const GUEST_DOCUMENT_KEY = "guest_document";

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  // Check for guest document
  const getGuestDocument = (): Document | null => {
    try {
      const stored = localStorage.getItem(GUEST_DOCUMENT_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const fetchDocuments = async () => {
    if (!user) {
      // For guest users, check localStorage
      const guestDoc = getGuestDocument();
      setDocuments(guestDoc ? [guestDoc] : []);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
      toast({
        variant: "destructive",
        title: "오류",
        description: "문서를 불러오는데 실패했습니다.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [user]);

  const createDocument = async (title?: string, supportType?: string) => {
    // For guest users, create a local document
    if (!user) {
      const guestDoc: Document = {
        id: `guest-${Date.now()}`,
        user_id: "guest",
        title: title || "제목 없는 문서",
        content: {},
        plain_text: "",
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      localStorage.setItem(GUEST_DOCUMENT_KEY, JSON.stringify(guestDoc));
      setDocuments([guestDoc]);
      
      toast({
        title: "문서 생성",
        description: "새 문서가 생성되었습니다.",
        duration: 2000,
      });
      
      return guestDoc;
    }

    try {
      const { data, error } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          title: title || "제목 없는 문서",
          content: {},
          plain_text: "",
          support_type: supportType || "preliminary",
        })
        .select()
        .single();

      if (error) throw error;

      setDocuments((prev) => [data, ...prev]);
      toast({
        title: "문서 생성",
        description: "새 문서가 생성되었습니다.",
        duration: 2000,
      });
      return data;
    } catch (error: any) {
      console.error("Error creating document:", error);
      toast({
        variant: "destructive",
        title: "오류",
        description: "문서 생성에 실패했습니다.",
      });
      return null;
    }
  };

  const updateDocument = async (
    id: string,
    updates: Partial<Pick<Document, "title" | "content" | "plain_text" | "status">>
  ) => {
    // For guest documents, update localStorage
    if (id.startsWith("guest-")) {
      const guestDoc = getGuestDocument();
      if (guestDoc) {
        const updated = { ...guestDoc, ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem(GUEST_DOCUMENT_KEY, JSON.stringify(updated));
        setDocuments([updated]);
      }
      return;
    }

    try {
      const { error } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === id ? { ...doc, ...updates, updated_at: new Date().toISOString() } : doc
        )
      );
    } catch (error: any) {
      console.error("Error updating document:", error);
      toast({
        variant: "destructive",
        title: "오류",
        description: "문서 저장에 실패했습니다.",
      });
    }
  };

  const deleteDocument = async (id: string) => {
    // For guest documents, clear localStorage
    if (id.startsWith("guest-")) {
      localStorage.removeItem(GUEST_DOCUMENT_KEY);
      setDocuments([]);
      toast({
        title: "삭제 완료",
        description: "문서가 삭제되었습니다.",
      });
      return;
    }

    try {
      const { error } = await supabase.from("documents").delete().eq("id", id);

      if (error) throw error;

      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      toast({
        title: "삭제 완료",
        description: "문서가 삭제되었습니다.",
      });
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast({
        variant: "destructive",
        title: "오류",
        description: "문서 삭제에 실패했습니다.",
      });
    }
  };

  return {
    documents,
    loading,
    createDocument,
    updateDocument,
    deleteDocument,
    refetch: fetchDocuments,
  };
}
