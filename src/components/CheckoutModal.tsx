import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CreditCard, Building2, Loader2, Check, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// V1 IMP SDK 타입 선언
declare global {
  interface Window {
    IMP: {
      init: (merchantId: string) => void;
      request_pay: (
        params: {
          pg: string;
          pay_method: string;
          merchant_uid: string;
          name: string;
          amount: number;
          buyer_email?: string;
          buyer_name?: string;
          buyer_tel?: string;
          vbank_due?: string;
          m_redirect_url?: string;
          customer_uid?: string;
        },
        callback: (response: {
          success: boolean;
          imp_uid?: string;
          merchant_uid?: string;
          customer_uid?: string;
          error_msg?: string;
          error_code?: string;
          vbank_name?: string;
          vbank_num?: string;
          vbank_holder?: string;
          vbank_date?: number;
        }) => void
      ) => void;
    };
  }
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    name: string;
    price: string;
  };
}

const CheckoutModal = ({ isOpen, onClose, plan }: CheckoutModalProps) => {
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountValue: number;
  } | null>(null);
  const [couponMessage, setCouponMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const paymentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // V1 SDK 초기화 with fallback injection
  useEffect(() => {
    const initIMP = () => {
      if (window.IMP) {
        window.IMP.init("imp45007067");
        console.log("[V1] IMP initialized successfully");
      }
    };

    if (window.IMP) {
      initIMP();
    } else {
      console.warn("[V1] IMP not found, injecting V1 script...");
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
      setCouponCode("");
      setAppliedCoupon(null);
      setCouponMessage(null);
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

  // 강제 닫기 함수 (로딩 상태와 관계없이 닫기)
  const handleForceClose = () => {
    if (paymentTimeoutRef.current) {
      clearTimeout(paymentTimeoutRef.current);
      paymentTimeoutRef.current = null;
    }
    setLoading(false);
    onClose();
  };

  // 쿠폰 적용 함수 - uses server-side validation
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponMessage({ type: "error", text: "❌ 쿠폰 코드를 입력해주세요." });
      return;
    }

    setCouponLoading(true);
    setCouponMessage(null);

    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setCouponMessage({ type: "error", text: "❌ 로그인이 필요합니다." });
        setCouponLoading(false);
        return;
      }

      // Server-side coupon validation
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: { couponCode: couponCode.trim() },
      });

      if (error) {
        console.error("Coupon validation error:", error);
        setCouponMessage({ type: "error", text: "❌ 쿠폰 조회 중 오류가 발생했습니다." });
        setCouponLoading(false);
        return;
      }

      if (!data.valid) {
        setCouponMessage({ type: "error", text: `❌ ${data.error || "유효하지 않은 코드입니다."}` });
        setCouponLoading(false);
        return;
      }

      // Coupon is valid
      setAppliedCoupon({
        code: data.code,
        discountValue: data.discountValue,
      });
      setCouponMessage({
        type: "success",
        text: `✅ ${data.discountValue}% 할인이 적용되었습니다!`,
      });
    } catch (err) {
      console.error("Coupon apply error:", err);
      setCouponMessage({ type: "error", text: "❌ 쿠폰 적용 중 오류가 발생했습니다." });
    } finally {
      setCouponLoading(false);
    }
  };

  // 쿠폰 제거 함수
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponMessage(null);
  };

  // 가격 계산 (display only - actual calculation is server-side)
  const originalPrice = Number(plan.price.replace(/[^0-9]/g, ""));
  const displayDiscountedPrice = appliedCoupon
    ? Math.round(originalPrice * (1 - appliedCoupon.discountValue / 100))
    : originalPrice;

  const handlePayment = async () => {
    setLoading(true);

    const merchantUid = `order_${crypto.randomUUID()}`;

    // Get current session for auth
    const { data: { session } } = await supabase.auth.getSession();
    
    console.log("[Payment] Session check:", session ? "Authenticated" : "Not authenticated");
    
    if (!session?.access_token) {
      toast.error("로그인이 필요합니다. 먼저 로그인해주세요.");
      setLoading(false);
      return;
    }

    // plan.name에서 plan_type 추출 (월간 패스 -> monthly, 시즌 패스 -> season)
    const planType = plan.name.includes("월간") ? "monthly" : "season";
    const isMonthlyPlan = planType === "monthly";

    // 100% 할인으로 0원인 경우: 서버에서 처리
    if (displayDiscountedPrice === 0) {
      console.log("[Free] 100% discount applied, processing via server");
      try {
        const { data, error } = await supabase.functions.invoke("process-payment", {
          body: {
            planType,
            couponCode: appliedCoupon?.code,
          },
        });

        if (error) {
          console.error("Free payment error:", error);
          toast.error("처리 중 오류가 발생했습니다.");
          setLoading(false);
          return;
        }

        if (!data.success) {
          toast.error(data.error || "결제 처리 실패");
          setLoading(false);
          return;
        }

        toast.success("🎉 100% 할인이 적용되어 무료로 이용하실 수 있습니다!");
        onClose();
        window.location.href = "/payment-success";
      } catch (err) {
        console.error("Free order error:", err);
        toast.error("처리 중 오류가 발생했습니다.");
        setLoading(false);
      }
      return;
    }

    const IMP = window.IMP;
    
    if (!IMP) {
      toast.error("결제 시스템 로딩 중입니다. 3초 후 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    // Re-init to be absolutely sure
    IMP.init("imp45007067");

    const payMethod = paymentMethod === "bank" ? "vbank" : "card";
    
    // 모바일 감지
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isBankTransfer = paymentMethod === "bank";
    
    // 월간 패스 + 카드 + 웹 = 빌링키 정기결제
    // 그 외 = 일반 결제
    // TODO: 정기결제 MID(MOI8962100)가 금융인증서를 요구하므로, 임시로 일반결제 MID 사용
    // 추후 PG사에 정기결제 MID 본인인증 비활성화 요청 필요
    const useBillingKey = false; // isMonthlyPlan && !isBankTransfer && !isMobile; - 임시 비활성화
    
    // 모든 결제에 일반결제 MID 사용 (금융인증서 문제 해결)
    const targetPG = "html5_inicis.MOI7156006";
    
    console.log(`[V1] Plan: ${planType}, UseBilling: ${useBillingKey}, Method: ${payMethod}, PG: ${targetPG}, Mobile: ${isMobile}`);

    // 가상계좌 입금 기한 설정 (7일 후)
    const vbankDue = new Date();
    vbankDue.setDate(vbankDue.getDate() + 7);
    const vbankDueStr = vbankDue.toISOString().slice(0, 10).replace(/-/g, "");

    // 빌링키 정기결제 처리
    if (useBillingKey) {
      const customerUid = `customer_${session.user.id}_${Date.now()}`;
      
      // 결제 정보를 localStorage에 저장 (모바일 리다이렉트용)
      const paymentInfo = {
        planType,
        couponCode: appliedCoupon?.code || null,
        merchantUid,
        customerUid,
        isBilling: true,
        timestamp: Date.now(),
      };
      localStorage.setItem("pendingPayment", JSON.stringify(paymentInfo));

      // 30초 타임아웃 안전장치
      paymentTimeoutRef.current = setTimeout(() => {
        console.log("[Payment] Timeout triggered - clearing loading state");
        setLoading(false);
        paymentTimeoutRef.current = null;
      }, 30000);

      // 빌링키 발급 + 최초 결제
      try {
        IMP.request_pay(
          {
            pg: targetPG,
            pay_method: "card",
            merchant_uid: merchantUid,
            name: `The Grant AI ${plan.name} (정기결제)`,
            amount: displayDiscountedPrice,
            customer_uid: customerUid,
            buyer_email: session.user.email || "customer@thegrant.kr",
            buyer_name: session.user.user_metadata?.name || "고객",
            buyer_tel: "01000000000",
          },
          async (rsp: any) => {
            console.log("[V1] Billing Response:", JSON.stringify(rsp));
            
            if (paymentTimeoutRef.current) {
              clearTimeout(paymentTimeoutRef.current);
              paymentTimeoutRef.current = null;
            }
            
            setLoading(false);

            if (rsp.success) {
              // 빌링키 발급 성공 - 서버에서 결제 및 구독 등록
              try {
                const { data, error } = await supabase.functions.invoke("register-billing", {
                  body: {
                    planType,
                    customerUid: rsp.customer_uid || customerUid,
                    impUid: rsp.imp_uid,
                    merchantUid: rsp.merchant_uid,
                    couponCode: appliedCoupon?.code,
                  },
                });

                localStorage.removeItem("pendingPayment");

                if (error) {
                  console.error("Billing registration error:", error);
                  toast.error("구독 등록 중 오류가 발생했습니다. 고객센터로 문의해주세요.");
                  return;
                }

                if (!data.success) {
                  toast.error(data.error || "구독 등록 실패");
                  return;
                }

                toast.success("🎉 월간 구독이 시작되었습니다! 매월 자동으로 갱신됩니다.");
                onClose();
                window.location.href = "/payment-success";
              } catch (err) {
                console.error("Billing registration exception:", err);
                toast.error("구독 등록 중 오류가 발생했습니다. 고객센터로 문의해주세요.");
              }
            } else {
              localStorage.removeItem("pendingPayment");
              // 상세 에러 로깅
              console.error("[V1] Payment failed:", {
                error_code: rsp.error_code,
                error_msg: rsp.error_msg,
                imp_uid: rsp.imp_uid,
                merchant_uid: rsp.merchant_uid,
              });
              
              // 에러 메시지 분석 및 사용자 친화적 메시지 표시
              if (rsp.error_code === "F400" || rsp.error_msg?.includes("인증")) {
                toast.error("카드 인증에 실패했습니다. 다른 카드로 시도하거나 카드사에 문의해주세요.");
              } else if (rsp.error_msg && !rsp.error_msg.includes("취소") && !rsp.error_msg.includes("닫")) {
                toast.error(`결제 실패: ${rsp.error_msg}`);
              } else if (!rsp.error_msg && !rsp.success) {
                // 콜백이 호출되었지만 에러 메시지가 없는 경우
                toast.error("결제가 완료되지 않았습니다. 다시 시도해주세요.");
              }
            }
          }
        );
      } catch (impError) {
        console.error("[V1] IMP.request_pay exception:", impError);
        if (paymentTimeoutRef.current) {
          clearTimeout(paymentTimeoutRef.current);
          paymentTimeoutRef.current = null;
        }
        setLoading(false);
        localStorage.removeItem("pendingPayment");
        toast.error("결제 모듈 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.");
      }
      return;
    }

    // 일반 결제 (시즌 패스, 무통장, 모바일)
    // 결제 정보를 localStorage에 저장 (모바일 리다이렉트용)
    const paymentInfo = {
      planType,
      couponCode: appliedCoupon?.code || null,
      merchantUid,
      isBilling: false,
      timestamp: Date.now(),
    };
    localStorage.setItem("pendingPayment", JSON.stringify(paymentInfo));

    // 30초 타임아웃 안전장치 - PG 콜백이 호출되지 않는 경우 대비
    paymentTimeoutRef.current = setTimeout(() => {
      console.log("[Payment] Timeout triggered - clearing loading state");
      setLoading(false);
      paymentTimeoutRef.current = null;
    }, 30000);

    // 모바일 리다이렉트 URL 설정
    const redirectUrl = `${window.location.origin}/payment-success`;

    try {
      IMP.request_pay(
        {
          pg: targetPG,
          pay_method: payMethod,
          merchant_uid: merchantUid,
          name: `The Grant AI ${plan.name}`,
          amount: displayDiscountedPrice,
          buyer_email: session.user.email || "customer@thegrant.kr",
          buyer_name: session.user.user_metadata?.name || "고객",
          buyer_tel: "01000000000",
          ...(payMethod === "vbank" && { vbank_due: vbankDueStr }),
          m_redirect_url: redirectUrl,
        },
        async (rsp: any) => {
          console.log("[V1] PG Response:", JSON.stringify(rsp));
          
          // 타임아웃 클리어 - 항상 먼저 실행
          if (paymentTimeoutRef.current) {
            clearTimeout(paymentTimeoutRef.current);
            paymentTimeoutRef.current = null;
          }
          
          // 결제 완료/실패/취소와 관계없이 무조건 로딩 해제 및 정리
          const cleanupPaymentState = () => {
            setLoading(false);
            localStorage.removeItem("pendingPayment");
          };
          
          // 즉시 로딩 해제
          cleanupPaymentState();

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
            try {
              const { data, error } = await supabase.functions.invoke("process-vbank", {
                body: {
                  planType,
                  couponCode: appliedCoupon?.code,
                  impUid: rsp.imp_uid,
                  merchantUid: rsp.merchant_uid,
                  vbankName: rsp.vbank_name,
                  vbankNum: rsp.vbank_num,
                  vbankHolder: rsp.vbank_holder,
                  vbankDate: rsp.vbank_date,
                },
              });

              if (error) {
                console.error("Vbank processing error:", error);
                toast.error("가상계좌 처리 중 오류가 발생했습니다.");
                return;
              }

              if (!data.success) {
                toast.error(data.error || "가상계좌 처리 실패");
                return;
              }

              toast.success(
                "가상계좌가 발급되었습니다! 입금 확인 후 자동으로 이용 권한이 활성화됩니다.",
                { duration: 8000 }
              );
              onClose();
            } catch (err) {
              console.error("Vbank processing exception:", err);
              toast.error("가상계좌 처리 중 오류가 발생했습니다.");
            }
          } else {
            // 카드 결제 성공
            const processPaymentWithRetry = async (retries = 3): Promise<boolean> => {
              for (let i = 0; i < retries; i++) {
                try {
                  console.log(`[Payment] Attempt ${i + 1}/${retries}`);
                  const { data, error } = await supabase.functions.invoke("process-payment", {
                    body: {
                      planType,
                      couponCode: appliedCoupon?.code,
                      impUid: rsp.imp_uid,
                      merchantUid: rsp.merchant_uid,
                    },
                  });

                  if (error) {
                    console.error(`Payment error (attempt ${i + 1}):`, error);
                    if (i === retries - 1) return false;
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    continue;
                  }

                  if (!data.success) {
                    console.error(`Payment failed (attempt ${i + 1}):`, data.error);
                    if (i === retries - 1) {
                      toast.error(data.error || "결제 처리 실패");
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

            const success = await processPaymentWithRetry();
            
            if (success) {
              toast.success("결제가 완료되었습니다!");
              onClose();
              window.location.href = "/payment-success";
            } else {
              console.error("[Payment] All retries failed. imp_uid:", rsp.imp_uid);
              toast.error(
                "결제는 완료되었으나 시스템 오류가 발생했습니다. 고객센터로 문의해주세요.",
                { duration: 15000 }
              );
            }
          }
        }
      );
    } catch (impError) {
      console.error("[V1] IMP.request_pay exception:", impError);
      if (paymentTimeoutRef.current) {
        clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = null;
      }
      setLoading(false);
      localStorage.removeItem("pendingPayment");
      toast.error("결제 모듈 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.");
    }
  };

  const formattedOriginalPrice = originalPrice.toLocaleString();
  const formattedFinalPrice = displayDiscountedPrice.toLocaleString();

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
                <span className="text-foreground font-medium">{plan.name} 플랜</span>
              </div>
              <div className="border-t border-border/10 pt-4">
                <div className="flex justify-between items-center">
                  <span className="body-text">결제 금액</span>
                  <div className="text-right">
                    {appliedCoupon ? (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground line-through text-lg">
                          {formattedOriginalPrice}원
                        </span>
                        <span className="text-2xl font-bold text-primary">
                          {formattedFinalPrice}원
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-foreground">
                        {formattedOriginalPrice}원
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 프로모션 코드 입력 */}
            <div className="mb-6">
              <h3 className="text-foreground font-medium mb-3 flex items-center gap-2">
                <Tag size={16} />
                프로모션 코드
              </h3>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-foreground">
                    <span className="font-semibold text-primary">{appliedCoupon.code}</span> 적용됨 (-{appliedCoupon.discountValue}%)
                  </span>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-muted-foreground hover:text-foreground text-sm underline"
                  >
                    제거
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="코드 입력"
                    className="flex-1 px-4 py-2 rounded-xl bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {couponLoading ? <Loader2 className="animate-spin" size={16} /> : "적용"}
                  </button>
                </div>
              )}
              {couponMessage && (
                <p
                  className={`mt-2 text-sm ${
                    couponMessage.type === "success" ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {couponMessage.text}
                </p>
              )}
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
                    {paymentMethod === "card" && <Check className="text-white" size={12} />}
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
                    {paymentMethod === "bank" && <Check className="text-white" size={12} />}
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
                `${formattedFinalPrice}원 결제하기`
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

export default CheckoutModal;
