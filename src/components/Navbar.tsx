import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, LogOut, Moon, Sun, FileEdit } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuthModal from "./AuthModal";


const Navbar = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<any>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const openLogin = () => {
    setAuthMode("login");
    setIsAuthOpen(true);
  };

  const openSignup = () => {
    setAuthMode("signup");
    setIsAuthOpen(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 px-4 py-4"
      >
        <div className="max-w-7xl mx-auto">
          <div className="bg-card/80 backdrop-blur-lg border border-border rounded-2xl shadow-lg px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="flex items-center shrink-0"
            >
              <span className="text-lg sm:text-2xl font-bold text-foreground tracking-tight whitespace-nowrap">
                The <span className="gradient-text">Grant AI</span>
              </span>
            </motion.div>

            {/* Right Section */}
            <div className="flex items-center gap-1 sm:gap-4">
              {/* Theme Toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsDark(!isDark)}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                {isDark ? (
                  <Sun size={18} className="text-primary sm:w-5 sm:h-5" />
                ) : (
                  <Moon size={18} className="text-foreground sm:w-5 sm:h-5" />
                )}
              </motion.button>

              {user ? (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User size={18} />
                    <span className="text-sm hidden sm:inline">{user.email}</span>
                  </div>
                  <Link to="/app">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="btn-primary flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2"
                    >
                      <FileEdit size={16} className="sm:w-[18px] sm:h-[18px]" />
                      <span className="hidden sm:inline">사업계획서 쓰러 가기</span>
                    </motion.button>
                  </Link>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogout}
                    className="btn-glass text-foreground flex items-center gap-2 text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2"
                  >
                    <LogOut size={16} className="sm:w-[18px] sm:h-[18px]" />
                    <span className="hidden sm:inline">로그아웃</span>
                  </motion.button>
                </>
              ) : (
                <>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={openLogin}
                    className="btn-glass text-foreground text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap"
                  >
                    로그인
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={openSignup}
                    className="btn-primary text-xs sm:text-sm px-2 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap"
                  >
                    시작하기
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.nav>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        mode={authMode}
        setMode={setAuthMode}
      />
    </>
  );
};

export default Navbar;
