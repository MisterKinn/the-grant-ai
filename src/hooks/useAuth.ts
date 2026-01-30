import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  plan_type: string | null;
  credits: number | null;
  billing_key?: string | null;
  plan_expires_at?: string | null;
  auto_renew?: boolean | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (error) {
      console.error("Profile fetch error:", error);
    } else {
      setProfile(data);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      if (session?.user) {
        setTimeout(() => fetchProfile(session.user.id), 0);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut({ scope: 'global' });
    // 로컬 스토리지 정리 후 홈 페이지로 리다이렉트
    localStorage.clear();
    window.location.href = '/';
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  // 플랜 타입을 한글로 변환
  const getPlanLabel = () => {
    if (!profile?.plan_type || profile.plan_type === "free") return "무료 사용 중";
    if (profile.plan_type === "monthly") return "월간 패스";
    if (profile.plan_type === "season") return "시즌 패스";
    return profile.plan_type;
  };

  return { user, session, profile, loading, signOut, refreshProfile, getPlanLabel };
}
