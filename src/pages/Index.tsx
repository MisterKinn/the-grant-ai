import { Helmet } from "react-helmet-async";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Pricing from "@/components/Pricing";
import ExpertConsultation from "@/components/ExpertConsultation";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>The Grant AI - AI 기반 사업계획서 자동화 플랫폼</title>
        <meta
          name="description"
          content="예비창업패키지부터 청년창업사관학교까지. 100건 이상의 합격 데이터를 학습한 AI가 당신의 사업계획서 작성을 도와드립니다."
        />
        <meta name="keywords" content="사업계획서, AI, 예비창업패키지, 청년창업사관학교, 창업지원사업, 정부지원사업" />
        <meta property="og:title" content="The Grant AI - AI 기반 사업계획서 자동화 플랫폼" />
        <meta
          property="og:description"
          content="예비창업패키지부터 청년창업사관학교까지. 검증된 합격 데이터를 학습한 AI가 당신의 자금 확보를 설계합니다."
        />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://thegrant.kr" />
      </Helmet>

      <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
        <Navbar />
        <Hero />
        <Features />
        <Pricing />
        <ExpertConsultation />
        <Footer />
      </main>
    </>
  );
};

export default Index;