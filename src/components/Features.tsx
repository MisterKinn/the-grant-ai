import { motion } from "framer-motion";
import { Database, FileText, Sparkles } from "lucide-react";

const features = [
  {
    icon: Database,
    title: "검증된 합격 데이터",
    description: "100건 이상의 실제 합격 사례를 학습한 AI가 합격하는 사업계획서를 작성합니다.",
  },
  {
    icon: Sparkles,
    title: "원클릭 자동 완성",
    description: "한 번의 입력으로 전체 문서가 일관성 있게 작성됩니다.",
  },
  {
    icon: FileText,
    title: "완벽한 포맷팅",
    description: "정부지원사업 표준 양식 HWPX/DOCX로 자동 변환됩니다.",
  },
];

const Features = () => {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-radial-glow opacity-50" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
            왜 <span className="gradient-text">The Grant</span>인가요?
          </h2>
          <p className="text-foreground text-lg max-w-2xl mx-auto">
            단순한 AI 작성 도구가 아닙니다. 합격을 위해 설계된 전략적 파트너입니다.
          </p>
        </motion.div>

        {/* Feature Grid - 3 items in a row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-card border border-border rounded-2xl shadow-lg p-8 transition-all duration-300 hover:shadow-xl hover:border-primary/30"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6">
                <feature.icon className="text-primary-foreground" size={28} />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">{feature.title}</h3>
              <p className="text-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
