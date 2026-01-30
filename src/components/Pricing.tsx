import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Star, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AuthModal from "./AuthModal";
import CheckoutModal from "./CheckoutModal";

const plans = [
  {
    name: "월간 패스",
    nameKr: "월간 패스",
    englishName: "Monthly",
    price: "33,000원",
    period: "/ 월",
    description: "매월 자유롭게 사용하는 정기구독",
    features: [
      "사업계획서 무제한 생성",
      "HWP, DOCX 원본 내보내기",
      "합격 사업계획서 족보 제공",
      "지원사업 전문가 1:1 무료상담",
      "특허/상표/디자인출원 무료상담",
    ],
    icon: Star,
    popular: false,
    paymentType: "recurring", // 정기결제
  },
  {
    name: "시즌 패스",
    nameKr: "시즌 패스",
    englishName: "Season Pass",
    price: "198,000원",
    monthlyPrice: "16,500원",
    originalPrice: "33,000원",
    discount: "50% OFF",
    period: "/ 연간",
    description: "1년간 저렴하게 이용하는 연간 플랜",
    features: [
      "사업계획서 무제한 생성",
      "HWP, DOCX 원본 내보내기",
      "합격 사업계획서 족보 제공",
      "지원사업 전문가 1:1 무료상담",
      "특허/상표/디자인출원 무료상담",
    ],
    icon: Crown,
    popular: true,
    paymentType: "general", // 기본결제
  },
];

const Pricing = () => {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: string } | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  const handleClick = (plan: typeof plans[0]) => {
    // 시즌 패스는 연간 가격, 월간 패스는 월 가격 전달
    const priceToSend = plan.paymentType === "general" ? plan.price : plan.price;
    setSelectedPlan({ name: plan.nameKr, price: priceToSend });
    
    if (user) {
      setIsCheckoutOpen(true);
    } else {
      setAuthMode("signup");
      setIsAuthOpen(true);
    }
  };

  const handleAuthClose = () => {
    setIsAuthOpen(false);
    if (user && selectedPlan) {
      setTimeout(() => setIsCheckoutOpen(true), 300);
    }
  };

  return (
    <section id="pricing" className="py-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-radial-glow opacity-50" />

      <div className="max-w-5xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
            지금 가장 필요한 <span className="gradient-text">솔루션</span>을 선택하세요
          </h2>
          <p className="text-foreground text-xl md:text-2xl max-w-2xl mx-auto">
            모든 플랜은 합격을 위한 핵심 기능을 포함하고 있습니다.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative ${plan.popular ? "md:-mt-4 md:mb-4" : ""}`}
            >
              {/* Recommended Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-primary text-sm font-semibold text-primary-foreground z-20 shadow-lg">
                  RECOMMENDED
                </div>
              )}

              <div
                className={`bg-card border rounded-2xl p-8 lg:p-10 h-full flex flex-col transition-all duration-300 ${
                  plan.popular 
                    ? "border-primary border-2 shadow-2xl shadow-primary/20" 
                    : "border-border hover:border-primary/30 hover:shadow-lg"
                }`}
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      plan.popular
                        ? "bg-primary"
                        : "bg-muted"
                    }`}
                  >
                    <plan.icon className={plan.popular ? "text-primary-foreground" : "text-foreground"} size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                    <span className="text-muted-foreground text-sm">{plan.englishName}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="text-muted-foreground text-sm mb-6">{plan.description}</p>

                {/* Price */}
                <div className="mb-8">
                  {plan.popular ? (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm text-muted-foreground line-through">{plan.originalPrice}/월</span>
                        <span className="px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold">
                          {plan.discount}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl lg:text-4xl font-bold text-primary">
                          {plan.monthlyPrice}
                        </span>
                        <span className="text-muted-foreground text-sm">/ 월</span>
                      </div>
                      <p className="text-muted-foreground text-sm mt-1">
                        (연간 {plan.price})
                      </p>
                    </>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl lg:text-4xl font-bold text-foreground">
                        {plan.price}
                      </span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-4 mb-10 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          plan.popular
                            ? "bg-primary"
                            : "bg-muted"
                        }`}
                      >
                        <Check className={plan.popular ? "text-primary-foreground" : "text-foreground"} size={12} />
                      </div>
                      <span className="text-foreground text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleClick(plan)}
                  className={`w-full py-4 rounded-xl font-semibold text-lg transition-all duration-300 ${
                    plan.popular
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-primary/30 text-primary hover:bg-primary/10"
                  }`}
                >
                  시작하기
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>

      </div>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={handleAuthClose}
        mode={authMode}
        setMode={setAuthMode}
        selectedPlan={selectedPlan}
      />

      {selectedPlan && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          plan={selectedPlan}
        />
      )}
    </section>
  );
};

export default Pricing;