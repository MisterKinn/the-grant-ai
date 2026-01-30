import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Database, Trophy, CheckCircle, Zap, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const proofItems = [
  { icon: Database, text: "100건 이상의 합격 족보 학습" },
  { icon: Trophy, text: "예비창업패키지 최우수 선정작 학습" },
  { icon: CheckCircle, text: "초기창업패키지 합격 로직 반영" },
  { icon: Zap, text: "실시간 시장 데이터 분석" },
];

const dynamicTexts = [
  "완벽한 사업계획서",
  "1억 원의 시드머니",
  "설득력 있는 비즈니스",
];

const Hero = () => {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % dynamicTexts.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Generate particles
  const particles = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      size: Math.random() * 2 + 1,
    }));
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col pt-28 md:pt-28 pb-4 overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-radial-glow" />
      
      {/* Particles */}
      <div className="particles">
        {particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              animationDelay: p.delay,
              width: `${p.size}px`,
              height: `${p.size}px`,
            }}
          />
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-4 relative z-10 flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-20 items-start w-full">
          {/* Left: Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:-ml-16 flex flex-col"
          >
            {/* Agent Badge - aligned with refund text */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-xl bg-primary/10 border border-primary/20 w-fit"
            >
              <Sparkles className="text-primary flex-shrink-0" size={16} />
              <span className="text-xs md:text-base text-foreground whitespace-nowrap">
                <span className="font-bold text-primary">100개+ 합격 족보를 학습한</span> 사업계획서 Agent
              </span>
            </motion.div>

            {/* Hero Title - centered between badge and description */}
            <div className="flex-1 flex flex-col justify-center py-4 md:py-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight mb-2">
                머릿속 아이디어<span className="gradient-text">,</span>
              </h1>
              
              {/* Fixed height container for rotating text */}
              <div className="relative h-[48px] md:h-[56px] lg:h-[64px] flex items-center mb-2">
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={currentIndex}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -30 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="text-[1.75rem] md:text-[2.2rem] lg:text-[2.8rem] font-bold tracking-tight gradient-text absolute left-0"
                  >
                    {dynamicTexts[currentIndex]}
                  </motion.h2>
                </AnimatePresence>
              </div>
              
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight">
                가 되다<span className="gradient-text">.</span>
              </h1>
            </div>

            {/* Description */}
            <p className="text-foreground text-base md:text-lg max-w-xl">
              100개+ 합격 족보를 학습한 사업계획서 작성 Agent.<br />
              지원사업 준비 기간은 단축하고, 합격 확률은 높입니다.
            </p>
          </motion.div>

          {/* Right: Refund Text + Demo Video */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="relative flex flex-col items-center lg:mr-[-2rem]"
          >
            {/* Refund Text - aligned with Agent badge (desktop only) */}
            <div className="self-start text-left mb-6 hidden lg:flex items-center gap-2">
              <span className="text-2xl md:text-3xl font-bold gradient-text">
                2026년 지원사업 합격 시 100% 환급
              </span>
              <span className="text-muted-foreground text-sm">
                (이용약관 참고)
              </span>
            </div>

            <div className="relative w-full flex items-center justify-center">
              {/* Glow Effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-80 h-80 rounded-full blur-3xl opacity-20 bg-primary" />
              </div>
              
              {/* Demo Video */}
              <div className="relative bg-card border border-border rounded-xl shadow-xl overflow-hidden w-full max-w-xl">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  className="w-full h-auto"
                >
                  <source src="/videos/demo.mov" type="video/quicktime" />
                  <source src="/videos/demo.mov" type="video/mp4" />
                </video>
              </div>
            </div>
          </motion.div>
        </div>

        {/* CTA Button - Centered below grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex justify-center mt-16"
        >
          <motion.a
            href="/app"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-semibold text-lg rounded-xl shadow-lg hover:bg-primary/90 transition-colors"
          >
            <Rocket size={20} />
            1분만에 초안 생성하기
          </motion.a>
        </motion.div>
      </div>

      {/* Scrolling Banner at bottom */}
      <div className="relative z-10 mt-6">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="marquee-container py-4">
          <div className="marquee flex gap-6">
            {[...proofItems, ...proofItems, ...proofItems, ...proofItems].map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-6 py-3 bg-card border border-border rounded-xl shadow-sm whitespace-nowrap flex-shrink-0"
              >
                <item.icon className="text-primary" size={20} />
                <span className="text-foreground font-medium text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
