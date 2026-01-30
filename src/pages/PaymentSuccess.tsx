import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = location.state?.plan;
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  // 모바일 리다이렉트 결제 처리
  useEffect(() => {
    const processRedirectPayment = async () => {
      // URL에서 imp_uid와 merchant_uid 확인 (이니시스 리다이렉트)
      const impUid = searchParams.get("imp_uid");
      const merchantUid = searchParams.get("merchant_uid");
      const impSuccess = searchParams.get("imp_success");

      // 리다이렉트 결제가 아닌 경우 (일반 성공 페이지 접근)
      if (!impUid && !merchantUid) {
        setIsComplete(true);
        return;
      }

      // 결제 실패한 경우
      if (impSuccess === "false") {
        setProcessingError("결제가 취소되었거나 실패했습니다.");
        return;
      }

      // localStorage에서 결제 정보 가져오기
      const pendingPaymentStr = localStorage.getItem("pendingPayment");
      if (!pendingPaymentStr) {
        console.error("[Redirect] No pending payment info found");
        setProcessingError("결제 정보를 찾을 수 없습니다. 고객센터로 문의해주세요.");
        return;
      }

      const pendingPayment = JSON.parse(pendingPaymentStr);
      
      // 5분 이상 지난 결제 정보는 무시
      if (Date.now() - pendingPayment.timestamp > 5 * 60 * 1000) {
        localStorage.removeItem("pendingPayment");
        setProcessingError("결제 세션이 만료되었습니다. 다시 시도해주세요.");
        return;
      }

      setIsProcessing(true);

      // 재시도 로직으로 결제 처리
      const processWithRetry = async (retries = 3): Promise<boolean> => {
        for (let i = 0; i < retries; i++) {
          try {
            console.log(`[Redirect] Attempt ${i + 1}/${retries} to process payment`);
            const { data, error } = await supabase.functions.invoke("process-payment", {
              body: {
                planType: pendingPayment.planType,
                couponCode: pendingPayment.couponCode,
                impUid: impUid,
                merchantUid: merchantUid,
              },
            });

            if (error) {
              console.error(`Payment processing error (attempt ${i + 1}):`, error);
              if (i === retries - 1) return false;
              await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
              continue;
            }

            if (!data.success) {
              console.error(`Payment failed (attempt ${i + 1}):`, data.error);
              if (i === retries - 1) {
                setProcessingError(data.error || "결제 처리 실패");
                return false;
              }
              await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
              continue;
            }

            return true;
          } catch (err) {
            console.error(`Payment exception (attempt ${i + 1}):`, err);
            if (i === retries - 1) return false;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          }
        }
        return false;
      };

      const success = await processWithRetry();
      
      // localStorage 정리
      localStorage.removeItem("pendingPayment");
      
      setIsProcessing(false);
      
      if (success) {
        toast.success("결제가 완료되었습니다!");
        setIsComplete(true);
      } else {
        if (!processingError) {
          setProcessingError(
            `결제는 완료되었으나 시스템 오류가 발생했습니다. 고객센터로 문의해주세요. (결제 ID: ${merchantUid})`
          );
        }
      }
    };

    processRedirectPayment();
  }, [searchParams]);

  // 처리 중인 경우
  if (isProcessing) {
    return (
      <>
        <Helmet>
          <title>결제 처리 중 - The Grant AI</title>
        </Helmet>
        <main className="min-h-screen flex items-center justify-center p-4 bg-background">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl shadow-lg p-12 max-w-lg w-full text-center"
          >
            <Loader2 className="animate-spin mx-auto mb-8 text-primary" size={48} />
            <h1 className="text-2xl font-bold text-foreground mb-4">결제 처리 중...</h1>
            <p className="text-foreground/70">잠시만 기다려주세요.</p>
          </motion.div>
        </main>
      </>
    );
  }

  // 에러 발생한 경우
  if (processingError) {
    return (
      <>
        <Helmet>
          <title>결제 오류 - The Grant AI</title>
        </Helmet>
        <main className="min-h-screen flex items-center justify-center p-4 bg-background">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl shadow-lg p-12 max-w-lg w-full text-center"
          >
            <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="text-red-500" size={48} />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-4">결제 오류</h1>
            <p className="text-foreground/70 mb-8">{processingError}</p>
            <button
              onClick={() => navigate("/")}
              className="px-8 py-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
            >
              홈으로 이동
            </button>
          </motion.div>
        </main>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>결제 완료 - The Grant AI</title>
      </Helmet>

      <main className="min-h-screen flex items-center justify-center p-4 bg-background">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="bg-card border border-border rounded-2xl shadow-lg p-12 max-w-lg w-full text-center"
        >
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 mx-auto mb-8 rounded-full bg-green-500/20 flex items-center justify-center"
          >
            <CheckCircle className="text-green-500" size={48} />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl md:text-3xl font-bold text-foreground mb-4"
          >
            결제가 성공적으로 완료되었습니다!
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-foreground/70 mb-8"
          >
            이용해 주셔서 감사합니다.
            {plan && (
              <span className="block mt-2 text-foreground font-medium">
                {plan.name} 플랜이 활성화되었습니다.
              </span>
            )}
          </motion.p>

          {/* CTA Button */}
          <motion.button
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/")}
            className="px-8 py-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors"
          >
            대시보드로 이동
          </motion.button>
        </motion.div>
      </main>
    </>
  );
};

export default PaymentSuccess;