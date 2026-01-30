import { Database, Trophy, CheckCircle, Zap } from "lucide-react";

const proofItems = [
  { icon: Database, text: "100건 이상의 합격 족보 학습" },
  { icon: Trophy, text: "예비창업패키지 최우수 선정작 학습" },
  { icon: CheckCircle, text: "초기창업패키지 합격 로직 반영" },
  { icon: Zap, text: "실시간 시장 데이터 분석" },
];

const SocialProof = () => {
  return (
    <section className="py-12 overflow-hidden relative">
      {/* Gradient Borders */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Marquee Container with Mask */}
      <div className="marquee-container">
        <div className="marquee flex gap-8">
          {[...proofItems, ...proofItems, ...proofItems, ...proofItems].map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-4 px-8 py-4 bg-card border border-border rounded-2xl shadow-sm whitespace-nowrap flex-shrink-0"
            >
              <item.icon className="text-primary" size={24} />
              <span className="text-foreground font-medium">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SocialProof;
