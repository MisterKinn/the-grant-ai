import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Building2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// IMP 타입은 CheckoutModal.tsx에서 이미 전역 선언됨

export interface ServiceProduct {
  id: string;
  name: string;
  price: number;
  description?: string;
}

interface ServiceCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ServiceProduct;
}

const ServiceCheckoutModal = ({ isOpen, onClose, product }: ServiceCheckoutModalProps) => {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [loading, setLoading] = useState(false);
  const paymentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // V1 SDK 초기화
  useEffect(() => {
    const initIMP = () => {
      if (window.IMP) {
        window.IMP.init("imp45007067");
        console.log("[Service V1] IMP initialized successfully");
      }
    };

    if (window.IMP) {
      initIMP();
    } else {
      console.warn("[Service V1] IMP not found, injecting V1 script...");
      const script = document.createElement("script");
      script.src = "https://cdn.iamport.kr/v1/iamport.js";
      script.onload = initIMP;
      document.head.appendChild(script);
    }
  }, []);

  // 모달이 닫힐 때 상태 리셋
  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      if (paymentTimeoutRef.current) {
        clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // 컴포넌트 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (paymentTimeoutRef.current) {
        clearTimeout(paymentTimeoutRef.current);
      }
    };
  }, []);

  // 강제 닫기 함수
  const handleForceClose = () => {
    if (paymentTimeoutRef.current) {
      clearTimeout(paymentTimeoutRef.current);
      paymentTimeoutRef.current = null;
    }
    setLoading(false);
    onClose();
  };

  const handlePayment = async () => {
    setLoading(true);

    const merchantUid = `service_${product.id}_${crypto.randomUUID()}`;

    // Get current session for auth (optional for service payments)
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log("[Service Payment] Session check:", session ? "Authenticated" : "Not authenticated");

    const IMP = window.IMP;
    
    if (!IMP) {
      toast.error("결제 시스템 로딩 중입니다. 3초 후 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    // Re-init to be absolutely sure
    IMP.init("imp45007067");

    const payMethod = paymentMethod === "bank" ? "vbank" : "card";
    
    // 일반결제 MID 사용
    const targetPG = "html5_inicis.MOI7156006";
    
    console.log(`[Service V1] Product: ${product.name}, Price: ${product.price}, Method: ${payMethod}, PG: ${targetPG}`);

    // 가상계좌 입금 기한 설정 (7일 후)
    const vbankDue = new Date();
    vbankDue.setDate(vbankDue.getDate() + 7);
    const vbankDueStr = vbankDue.toISOString().slice(0, 10).replace(/-/g, "");

    // 15초 타임아웃 안전장치 (결제창 닫힘 감지용)
    paymentTimeoutRef.current = setTimeout(() => {
      console.log("[Service Payment] Timeout triggered - clearing loading state");
      setLoading(false);
      paymentTimeoutRef.current = null;
      toast.info("결제가 취소되었습니다. 다시 시도해주세요.");
    }, 15000);

    // 모바일 리다이렉트 URL 설정
    const redirectUrl = `${window.location.origin}/payment-success?service=${product.id}`;

    try {
      IMP.request_pay(
        {
          pg: targetPG,
          pay_method: payMethod,
          merchant_uid: merchantUid,
          name: `The Grant AI ${product.name}`,
          amount: product.price,
          buyer_email: session?.user?.email || "customer@thegrant.kr",
          buyer_name: session?.user?.user_metadata?.name || "고객",
          buyer_tel: "01000000000",
          ...(payMethod === "vbank" && { vbank_due: vbankDueStr }),
          m_redirect_url: redirectUrl,
        },
        async (rsp: any) => {
          console.log("[Service V1] PG Response:", JSON.stringify(rsp));
          
          // 타임아웃 클리어
          if (paymentTimeoutRef.current) {
            clearTimeout(paymentTimeoutRef.current);
            paymentTimeoutRef.current = null;
          }
          
          setLoading(false);

          // 결제 취소 또는 창 닫기 감지
          if (!rsp.success) {
            const errorMsg = rsp.error_msg || "";
            const isCancelled = errorMsg.includes("취소") || 
                               errorMsg.includes("닫") || 
                               errorMsg.includes("close") ||
                               errorMsg.includes("cancel") ||
                               rsp.error_code === "F0000" ||
                               !errorMsg;
            
            if (!isCancelled && errorMsg) {
              toast.error(`결제 실패: ${errorMsg}`);
            }
            return;
          }

          // 가상계좌 발급 성공
          if (payMethod === "vbank") {
            toast.success(
              `가상계좌가 발급되었습니다!\n은행: ${rsp.vbank_name}\n계좌번호: ${rsp.vbank_num}\n예금주: ${rsp.vbank_holder}\n\n입금 확인 후 담당자가 연락드립니다.`,
              { duration: 10000 }
            );
            onClose();
          } else {
            // 카드 결제 성공
            toast.success(
              `🎉 ${product.name} 결제가 완료되었습니다!\n담당자가 곧 연락드릴 예정입니다.`,
              { duration: 8000 }
            );
            onClose();
          }
        }
      );
    } catch (impError) {
      console.error("[Service V1] IMP.request_pay exception:", impError);
      if (paymentTimeoutRef.current) {
        clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = null;
      }
      setLoading(false);
      toast.error("결제 모듈 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.");
    }
  };

  const formattedPrice = product.price.toLocaleString();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleForceClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-card-alt p-8 w-full max-w-md relative z-10"
          >
            <button 
              onClick={handleForceClose} 
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground z-20"
            >
              <X size={24} />
            </button>

            <h2 className="heading-md mb-6">주문 요약</h2>

            <div className="glass-card p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <span className="body-text">상품</span>
                <span className="text-foreground font-medium">{product.name}</span>
              </div>
              {product.description && (
                <p className="text-sm text-muted-foreground mb-4">{product.description}</p>
              )}
              <div className="border-t border-border/10 pt-4">
                <div className="flex justify-between items-center">
                  <span className="body-text">결제 금액</span>
                  <span className="text-2xl font-bold text-foreground">
                    {formattedPrice}원
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-foreground font-medium mb-4">결제 수단</h3>
              <div className="space-y-3">
                <label
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer ${paymentMethod === "card" ? "glass-card border-primary/50" : "glass-card hover:border-border/20"}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="card"
                    checked={paymentMethod === "card"}
                    onChange={() => setPaymentMethod("card")}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "card" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                  >
                    {paymentMethod === "card" && <Check className="text-primary-foreground" size={12} />}
                  </div>
                  <CreditCard className="text-muted-foreground" size={20} />
                  <span className="text-foreground">신용카드</span>
                </label>

                <label
                  className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer ${paymentMethod === "bank" ? "glass-card border-primary/50" : "glass-card hover:border-border/20"}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value="bank"
                    checked={paymentMethod === "bank"}
                    onChange={() => setPaymentMethod("bank")}
                    className="sr-only"
                  />
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "bank" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                  >
                    {paymentMethod === "bank" && <Check className="text-primary-foreground" size={12} />}
                  </div>
                  <Building2 className="text-muted-foreground" size={20} />
                  <span className="text-foreground">무통장입금</span>
                </label>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePayment}
              disabled={loading}
              className="w-full py-4 rounded-xl font-semibold btn-gold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} /> 결제 처리 중...
                </>
              ) : (
                `${formattedPrice}원 결제하기`
              )}
            </motion.button>
            <p className="mt-4 text-center body-text-sm text-xs">
              결제를 진행하면 <button className="text-primary hover:underline">이용약관</button> 및{" "}
              <button className="text-primary hover:underline">개인정보처리방침</button>에 동의하게 됩니다.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServiceCheckoutModal;
