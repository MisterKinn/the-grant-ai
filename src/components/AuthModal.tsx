import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: "login" | "signup";
    setMode: (mode: "login" | "signup") => void;
    selectedPlan?: {
        name: string;
        price: string;
    } | null;
}

const AuthModal = ({
    isOpen,
    onClose,
    mode,
    setMode,
    selectedPlan,
}: AuthModalProps) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const { toast } = useToast();
    const navigate = useNavigate();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (mode === "signup") {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/`,
                    },
                });

                if (error) {
                    if (error.message.includes("already registered")) {
                        throw new Error(
                            "이미 가입된 이메일입니다. 로그인해주세요.",
                        );
                    }
                    throw error;
                }

                toast({
                    title: "회원가입 완료!",
                    description: "환영합니다. 로그인되었습니다.",
                });

                // Mark for free user modal on first login
                sessionStorage.setItem("show_item_modal_after_login", "true");

                onClose();
                if (selectedPlan) {
                    navigate("/checkout", { state: { plan: selectedPlan } });
                } else {
                    navigate("/app");
                }
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    if (error.message.includes("Invalid login credentials")) {
                        throw new Error(
                            "이메일 또는 비밀번호가 올바르지 않습니다.",
                        );
                    }
                    throw error;
                }

                toast({
                    title: "로그인 성공!",
                    description: "환영합니다.",
                });

                // Mark for free user modal on login
                sessionStorage.setItem("show_item_modal_after_login", "true");

                onClose();
                if (selectedPlan) {
                    navigate("/checkout", { state: { plan: selectedPlan } });
                } else {
                    navigate("/app");
                }
            }
        } catch (error: any) {
            toast({
                title: "오류 발생",
                description: error.message || "다시 시도해주세요.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setGoogleLoading(true);
        try {
            // 로그인 후 항상 https://thegrant.kr/app으로 리다이렉트 (하드코딩)
            const redirectUrl = "https://thegrant.kr/app";

            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo: redirectUrl,
                },
            });

            if (error) throw error;
        } catch (error: any) {
            toast({
                title: "Google 로그인 실패",
                description: "다시 시도해주세요.",
                variant: "destructive",
            });
            setGoogleLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: "spring", damping: 25 }}
                        className="glass-card-alt p-8 w-full max-w-md relative z-10"
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X size={24} />
                        </button>

                        {/* Header */}
                        <h2 className="heading-md mb-2">
                            {mode === "login" ? "로그인" : "회원가입"}
                        </h2>
                        <p className="body-text-sm mb-6">
                            {mode === "login"
                                ? "계정에 로그인하세요"
                                : "새 계정을 만들어보세요"}
                        </p>

                        {/* Google Login */}
                        <button
                            onClick={handleGoogleLogin}
                            disabled={googleLoading}
                            className="btn-google mb-6 text-foreground"
                        >
                            {googleLoading ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>
                                    <svg
                                        className="w-5 h-5"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            fill="currentColor"
                                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        />
                                        <path
                                            fill="currentColor"
                                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        />
                                    </svg>
                                    Google로 계속하기
                                </>
                            )}
                        </button>

                        {/* Divider */}
                        <div className="relative mb-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-border/10"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground">
                                    또는
                                </span>
                            </div>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleAuth} className="space-y-4">
                            <div className="relative">
                                <Mail
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    size={20}
                                />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="이메일"
                                    required
                                    className="glass-input pl-12"
                                />
                            </div>

                            <div className="relative">
                                <Lock
                                    className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    size={20}
                                />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    placeholder="비밀번호"
                                    required
                                    minLength={6}
                                    className="glass-input pl-12 pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword(!showPassword)
                                    }
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? (
                                        <EyeOff size={20} />
                                    ) : (
                                        <Eye size={20} />
                                    )}
                                </button>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 rounded-xl font-semibold btn-primary disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <Loader2
                                        className="animate-spin"
                                        size={20}
                                    />
                                ) : mode === "login" ? (
                                    "로그인"
                                ) : (
                                    "회원가입"
                                )}
                            </motion.button>
                        </form>

                        {/* Toggle Mode */}
                        <p className="mt-6 text-center body-text-sm">
                            {mode === "login"
                                ? "계정이 없으신가요?"
                                : "이미 계정이 있으신가요?"}{" "}
                            <button
                                onClick={() =>
                                    setMode(
                                        mode === "login" ? "signup" : "login",
                                    )
                                }
                                className="text-primary hover:underline font-medium"
                            >
                                {mode === "login" ? "회원가입" : "로그인"}
                            </button>
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AuthModal;
