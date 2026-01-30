import { useState } from "react";
import { motion } from "framer-motion";
import { Palette, Code, UserCheck, Scale, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ServiceCheckoutModal, { ServiceProduct } from "@/components/ServiceCheckoutModal";

// Link Configuration
const SERVICE_LINKS = {
  MENTORING: "https://tally.so/r/Pd1DQx",
  PATENT: "https://tally.so/r/aQ5ep2",
  MVP: "https://tally.so/r/EkxZQL",
  PROTOTYPE: "https://tally.so/r/VLzb5l",
  BUNDLE: "https://tally.so/r/PdzbEx",
};

// Service Products for Paid Services
const SERVICE_PRODUCTS: Record<string, ServiceProduct> = {
  PROTOTYPE: {
    id: "prototype",
    name: "프로토타입 제작",
    price: 199000,
    description: "사업계획서에 들어갈 서비스 화면 디자인",
  },
  MVP: {
    id: "mvp",
    name: "MVP 개발",
    price: 499000,
    description: "웹/앱 개발 (랜딩 페이지 및 핵심 기능)",
  },
  BUNDLE: {
    id: "bundle",
    name: "디자인 + MVP 개발 올인원 패키지",
    price: 599000,
    description: "프로토타입 디자인 + MVP 개발 패키지",
  },
};

interface ServiceCardProps {
  icon: React.ReactNode;
  title: string;
  headCopy: string;
  details: string[];
  buttonText: string;
  onClick: () => void;
  price?: string;
  isPaid?: boolean;
}

const ServiceCard = ({
  icon,
  title,
  headCopy,
  details,
  buttonText,
  onClick,
  price,
  isPaid = false,
}: ServiceCardProps) => {
  return (
    <div
      className={`relative flex flex-col p-6 md:p-8 rounded-2xl border border-border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
        isPaid ? "bg-slate-50 dark:bg-slate-900/50" : "bg-card"
      }`}
    >
      {/* Price Badge */}
      {price && (
        <Badge className="absolute top-4 right-4 bg-primary text-primary-foreground font-bold px-3 py-1">
          {price}
        </Badge>
      )}

      {/* Icon */}
      <div className="mb-4">{icon}</div>

      {/* Title */}
      <h3 className="text-lg md:text-xl font-bold text-foreground mb-2">{title}</h3>

      {/* Head Copy */}
      <p className="text-foreground font-semibold text-sm md:text-base mb-4">{headCopy}</p>

      {/* Details List */}
      <ul className="space-y-2 mb-6 flex-1">
        {details.map((detail, index) => (
          <li key={index} className="flex items-start gap-2 text-muted-foreground text-sm">
            <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span>{detail}</span>
          </li>
        ))}
      </ul>

      {/* Button */}
      <Button
        onClick={onClick}
        className="w-full font-bold"
        size="lg"
      >
        {buttonText}
      </Button>
    </div>
  );
};

const ExpertConsultation = () => {
  const [selectedProduct, setSelectedProduct] = useState<ServiceProduct | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  const handlePaidServiceClick = (productKey: keyof typeof SERVICE_PRODUCTS) => {
    setSelectedProduct(SERVICE_PRODUCTS[productKey]);
    setIsCheckoutOpen(true);
  };

  const handleFreeServiceClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/10 to-background" />

      <div className="max-w-5xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-4">
            합격을 위한 <span className="gradient-text">부가 서비스</span>
          </h2>
          <p className="text-foreground text-xl md:text-2xl max-w-2xl mx-auto">
            사업계획서와 함께 서비스 제작까지,
            <br />
            지원사업 합격에 필요한 모든 것을 준비하세요.
          </p>
        </motion.div>

        {/* 2x2 Grid Layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-8"
        >
          {/* Row 1: 유료 개발 서비스 */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 프로토타입 제작 */}
              <ServiceCard
                icon={<Palette className="w-10 h-10 text-primary" />}
                title="프로토타입 제작"
                headCopy="심사위원을 설득하는 서비스 화면 제작"
                details={[
                  "사업계획서에 들어갈 서비스 화면 제작",
                  "컬러/컨셉 등 요청사항을 반영한 디자인",
                ]}
                buttonText="서비스 화면 디자인 신청하기"
                onClick={() => handleFreeServiceClick(SERVICE_LINKS.PROTOTYPE)}
                isPaid={true}
              />

              {/* MVP 개발 */}
              <ServiceCard
                icon={<Code className="w-10 h-10 text-primary" />}
                title="MVP 개발"
                headCopy="합격 확률이 높아지는 웹/앱 서비스 개발"
                details={[
                  "웹/앱 개발 (랜딩 페이지 및 핵심 기능)",
                  "무료 도메인 구매 후 연결",
                ]}
                buttonText="MVP 개발 신청하기"
                onClick={() => handleFreeServiceClick(SERVICE_LINKS.MVP)}
                isPaid={true}
              />
            </div>

            {/* Bundle Package Section */}
            <div className="p-6 md:p-8 rounded-2xl border-2 border-primary/30 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                {/* Left: Title & Details */}
                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1">
                    디자인 + MVP 개발
                  </h3>
                  <p className="text-primary font-semibold text-sm md:text-base mb-4">
                    올인원 패키지로 구매하고 10만원 할인 받기
                  </p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>사업계획서에 들어갈 서비스 화면 제작</span>
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      <span>웹/앱 개발 (랜딩 페이지 및 핵심 기능)</span>
                    </li>
                  </ul>
                </div>

                {/* Right: Price & Button */}
                <div className="flex flex-col items-center md:items-end gap-3">
                  <div className="text-center md:text-right">
                    <span className="text-2xl md:text-3xl font-extrabold text-foreground">599,000원</span>
                    <span className="text-sm text-muted-foreground ml-2 line-through">698,000원</span>
                  </div>
                  <Button
                    size="lg"
                    className="font-bold px-8 shadow-lg bg-gradient-to-r from-primary via-primary to-primary/80 hover:from-primary/90 hover:to-primary text-primary-foreground"
                    onClick={() => handleFreeServiceClick(SERVICE_LINKS.BUNDLE)}
                  >
                    🔥 디자인 + 개발 올인원 패키지 신청하기
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: 무료 상담 서비스 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 1:1 사업계획서 피드백 */}
            <ServiceCard
              icon={<UserCheck className="w-10 h-10 text-primary" />}
              title="(무료) 지원사업 합격 진단"
              headCopy="합격자 선배한테 진단받고 2026년 지원사업 합격하기"
              details={[
                "예창패/청창사/초창패/창중대/신창사 합격 멘토 매칭",
                "오직 더그랜트에서만, 합격자 관점에서 피드백 받기",
              ]}
              buttonText="사업계획서 진단 신청하기"
              onClick={() => handleFreeServiceClick(SERVICE_LINKS.MENTORING)}
              isPaid={false}
            />

            {/* 특허 출원 상담 */}
            <ServiceCard
              icon={<Scale className="w-10 h-10 text-primary" />}
              title="(무료) 특허 (가)출원 상담"
              headCopy="특허 (가)출원 상담받고 가산점 받는 전략 세우기"
              details={[
                "스타트업 전문 로펌 리앤시아 특허법률사무소 무료 상담",
                "특허 보유 시 주요 지원사업 가산점 부여",
              ]}
              buttonText="특허 출원 상담 받기"
              onClick={() => handleFreeServiceClick(SERVICE_LINKS.PATENT)}
              isPaid={false}
            />
          </div>
        </motion.div>
      </div>

      {/* Service Checkout Modal */}
      {selectedProduct && (
        <ServiceCheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => {
            setIsCheckoutOpen(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
        />
      )}
    </section>
  );
};

export default ExpertConsultation;
