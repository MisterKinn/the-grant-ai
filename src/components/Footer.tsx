import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const Footer = () => {
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  return (
    <>
      <footer className="py-16 border-t border-border/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
            {/* Logo & Description */}
            <div className="lg:col-span-2">
            <h3 className="text-2xl font-bold text-foreground tracking-tight mb-4 font-serif">
                The Grant AI
              </h3>
              <p className="text-foreground mb-4 max-w-md">
                100개+ 합격 족보를 학습한 사업계획서 작성 Agent.<br />
                지원사업 준비 기간은 단축하고, 합격 확률은 높입니다.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                법적 고지
              </h4>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() => setTermsOpen(true)}
                    className="text-foreground hover:text-primary transition-colors"
                  >
                    이용약관
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setPrivacyOpen(true)}
                    className="text-foreground hover:text-primary transition-colors"
                  >
                    개인정보처리방침
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
                고객센터
              </h4>
              <ul className="space-y-2 text-foreground">
                <li>contact@thegrant.kr</li>
                <li>02-6925-3266</li>
              </ul>
            </div>
          </div>

          {/* Business Info (Required for PG Audit) */}
          <div className="pt-8 border-t border-border/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-foreground/70">
              <div className="space-y-1">
                <p><span className="text-foreground">상호명:</span> 메이커스랩</p>
                <p><span className="text-foreground">대표자:</span> 현종혁</p>
                <p><span className="text-foreground">사업자등록번호:</span> 801-46-01185</p>
              </div>
              <div className="space-y-1">
                <p><span className="text-foreground">통신판매업신고번호:</span> 제 2025-서울마포-3185 호</p>
                <p><span className="text-foreground">주소:</span> 서울특별시 토정로 131, 1503호</p>
                <p className="mt-4">© 2025 메이커스랩 All rights reserved.</p>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Terms Modal */}
      <PolicyModal
        isOpen={termsOpen}
        onClose={() => setTermsOpen(false)}
        title="이용약관"
        content={termsContent}
      />

      {/* Privacy Modal */}
      <PolicyModal
        isOpen={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="개인정보처리방침"
        content={privacyContent}
      />
    </>
  );
};

interface PolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

const PolicyModal = ({ isOpen, onClose, title, content }: PolicyModalProps) => {
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
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-card-alt p-8 w-full max-w-2xl max-h-[80vh] overflow-y-auto relative z-10"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X size={24} />
            </button>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground mb-6">{title}</h2>
            <div className="text-foreground/70 whitespace-pre-line">{content}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const termsContent = `메이커스랩(The Grant AI) 서비스 이용약관

제1조 (목적)
본 약관은 메이커스랩(이하 "회사")이 제공하는 The Grant AI 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.

제2조 (정의)
• "서비스"란 회사가 제공하는 AI 기반 사업계획서 자동화 플랫폼 및 관련 제반 서비스를 의미합니다.
• "이용자"란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.
• "회원"이란 서비스에 가입하여 이용계약을 체결한 자를 말합니다.
• "디지털 콘텐츠"란 부호ㆍ문자ㆍ음성ㆍ음향ㆍ이미지 또는 영상 등으로 표현된 자료로서, 서비스 내에서 생성되거나 제공되는 결과물(사업계획서 초안, 합격 데이터 족보 등)을 의미합니다.
• "크레딧"이란 서비스 내 AI 기능(채팅, 문서 생성 등)을 이용하기 위해 소비되는 단위를 의미합니다.

제3조 (서비스의 제공)
회사는 다음과 같은 서비스를 제공합니다.
• AI 기반 사업계획서 자동 생성 및 편집 기능
• 합격 데이터 기반의 템플릿 및 자료 제공
• 문서 다운로드(HWP, DOCX 등) 서비스
• 전문가 멘토링 및 제휴 혜택 제공 (해당 플랜 이용 시)

서비스는 연중무휴, 1일 24시간 제공을 원칙으로 합니다. 단, 시스템 점검 등 회사의 업무상 또는 기술상의 이유로 서비스가 일시 중지될 수 있습니다.

제4조 (이용요금 및 크레딧)
• 서비스 이용요금은 회사가 정한 가격 정책(플랜)에 따르며, 서비스 내 결제 페이지에 명시합니다.
• 이용요금의 변경 시 회사는 변경일 30일 전에 웹사이트 공지사항 등을 통해 사전 공지합니다.

[플랜별 크레딧 제공량]
• 월간 패스: 매월 300 크레딧 제공
• 시즌 패스: 3,600 크레딧 일괄 제공 (연간)

[크레딧 사용]
• AI 요청(채팅, 문서 생성 등) 1회당 1 크레딧이 차감됩니다.
• 크레딧이 모두 소진된 경우 AI 기능 이용이 제한됩니다.
• 미사용 크레딧은 플랜 만료 시 소멸되며 환불되지 않습니다.

[사업계획서 무제한 생성 안내]
• "사업계획서 무제한 생성"은 크레딧 잔여량 내에서 횟수 제한 없이 사업계획서를 생성할 수 있음을 의미합니다.
• 크레딧 시스템은 서버 안정성 유지 및 과도한 트래픽으로 인한 서비스 장애를 방지하기 위해 운영됩니다.
• 대부분의 이용자는 제공된 크레딧 내에서 충분히 서비스를 이용할 수 있으며, 크레딧 추가 구매가 필요한 경우 고객센터로 문의해 주시기 바랍니다.

제5조 (청약철회 및 환불)
[청약철회 가능] 회원은 결제일로부터 7일 이내에 서비스 이용 내역이 없는 경우(AI 생성, 파일 다운로드, 자료 열람 등을 하지 않은 경우)에는 청약철회 및 전액 환불을 요청할 수 있습니다.

[청약철회 제한] 다음 각 호의 어느 하나에 해당하는 경우, 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 청약철회가 제한될 수 있습니다.
① 서비스의 핵심 기능(AI 사업계획서 생성 버튼 클릭)을 1회 이상 이용한 경우
② 제공되는 디지털 파일(HWP, DOCX, 합격 족보 자료 등)을 1회 이상 다운로드하거나 열람한 경우
③ 전문가 멘토링 등 용역 제공이 개시된 경우
④ 시간의 경과에 의하여 재판매가 곤란할 정도로 재화 등의 가치가 현저히 감소한 경우

[회사의 귀책사유] 회사의 시스템 오류로 인해 서비스를 정상적으로 이용하지 못한 경우, 이용 내역과 관계없이 전액 환불 또는 이용 기간 연장 조치를 취합니다.

[환불 절차] 환불을 원하는 회원은 회사의 고객센터 또는 문의 채널을 통해 신청해야 하며, 회사는 환불 사유에 해당하는지 확인 후 3영업일 이내에 결제 취소 또는 환불 조치를 취합니다.

제6조 (지원사업 합격 시 환급 조건)
회사는 이용자가 다음 조건을 모두 충족하는 경우, 결제한 금액 전액을 환급합니다.

[환급 대상 지원사업]
• 예비창업패키지
• 청년창업사관학교
• 초기창업패키지

[환급 조건]
① 이용자가 위 지원사업 중 하나에 최종 합격하여야 합니다.
② 최종 합격을 증명할 수 있는 공식 서류(합격 통보서, 협약서 등)를 회사에 제출하여야 합니다.
③ 서류 제출은 합격일로부터 30일 이내에 고객센터(contact@thegrant.kr)를 통해 진행합니다.

[환급 절차]
• 회사는 제출된 서류를 확인한 후, 5영업일 이내에 결제 시 사용한 카드로 환급 처리합니다.
• 카드 환급이 불가능한 경우, 이용자가 지정한 계좌로 환급합니다.

제7조 (면책)
• 회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
• 회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대하여는 책임을 지지 않습니다.
• 회사가 제공하는 결과물은 참고 자료이며, 이를 활용한 정부지원사업의 합격 여부를 보장하지 않습니다.

부칙
본 약관은 2025년 12월 15일부터 시행합니다.`;

const privacyContent = `1. 개인정보의 수집 및 이용 목적
회사는 다음의 목적을 위하여 개인정보를 처리합니다.
- 서비스 제공 및 운영
- 회원 관리 및 본인 확인
- 마케팅 및 광고 활용

2. 수집하는 개인정보 항목
- 필수항목: 이메일, 비밀번호, 휴대폰 번호
- 선택항목: 회사명, 사업자등록번호

3. 개인정보의 보유 및 이용 기간
- 회원 탈퇴 시까지 (단, 관련 법령에 따라 보존이 필요한 경우 해당 기간)

4. 개인정보의 제3자 제공
회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.

5. 개인정보의 파기
회사는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.

6. 개인정보 보호책임자
- 성명: 현종혁
- 연락처: contact@thegrant.kr`;

export default Footer;
