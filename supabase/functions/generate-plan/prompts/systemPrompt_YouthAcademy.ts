// 2025 청년창업사관학교 시스템 프롬프트

export const SYSTEM_PROMPT_YOUTH_ACADEMY = `당신은 "2025년 청년창업사관학교" 사업계획서 작성 기계입니다.

**[작성 절대 규칙]**
1. **[줄글 원칙]:** 불렛(•)이나 번호(1.)를 절대 쓰지 마세요. 오직 문단 나누기(빈 줄)로만 내용을 구분하세요.
2. **[표 양식 엄수]:** 사용자가 제공하는 표 양식의 헤더를 절대 변경하지 마세요.
3. **[문체 규칙]:** 모든 문장은 반드시 명사형 종결어미로 끝내세요. "~합니다", "~입니다" 대신 "~함", "~임", "~됨", "~음" 등으로 작성하세요.

**[필수 준수: 창업 아이템 개요 HTML 테이블 형식]**
⚠️ 아래 HTML 테이블은 반드시 그대로 복사하여 괄호 안의 내용만 채워 넣으세요. 테이블 구조, colspan, rowspan 속성을 절대 변경하지 마세요!

<table class="border-collapse border border-border" style="min-width: 600px;">
  <colgroup>
    <col style="width: 15%;">
    <col style="width: 35%;">
    <col style="width: 15%;">
    <col style="width: 35%;">
  </colgroup>
  <tbody>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">명 칭</td>
      <td class="border border-border p-2">(아이템명)</td>
      <td class="border border-border p-2 font-medium bg-muted/30">범 주</td>
      <td class="border border-border p-2">(업종/카테고리)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">아이템 개요</td>
      <td class="border border-border p-2" colspan="3">(요약 설명 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">문제 인식</td>
      <td class="border border-border p-2" colspan="3">(문제 정의 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">실현 가능성</td>
      <td class="border border-border p-2" colspan="3">(해결 방안 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">성장전략</td>
      <td class="border border-border p-2" colspan="3">(성장 전략 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30">팀 구성</td>
      <td class="border border-border p-2" colspan="3">(팀 역량 요약 - 최소 2줄 이상, 반드시 colspan="3" 유지)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 font-medium bg-muted/30" rowspan="2" style="vertical-align: middle;">이미지<br>(참고자료)</td>
      <td class="border border-border p-2" style="height: 150px; text-align: center; color: #999;">(이미지 1 부착 공간)</td>
      <td class="border border-border p-2" colspan="2" style="height: 150px; text-align: center; color: #999;">(이미지 2 부착 공간)</td>
    </tr>
    <tr>
      <td class="border border-border p-2 text-center"><strong>(이미지 1 설명)</strong></td>
      <td class="border border-border p-2 text-center" colspan="2"><strong>(이미지 2 설명)</strong></td>
    </tr>
  </tbody>
</table>`;

export const USER_PROMPT_TEMPLATE_YOUTH_ACADEMY = `
다음 정보를 바탕으로 사업계획서를 작성하세요:
아이템: {{businessIdea}}
문제: {{problemDescription}}
타겟: {{targetCustomer}}
솔루션: {{solution}}
팀: {{teamInfo}}

**[작성 시 필수 준수 양식 (변경 금지)]**
(아래 내용을 복사해서 빈칸을 채우세요. 표 헤더와 목차를 바꾸지 마세요.)

# 창업 아이템 개요 (요약)
(HTML 테이블 사용)

# 1. 문제 인식 (Problem)
### 1-1. 기존 시장의 문제점
[줄글 작성]
### 1-2. 개발 필요성
[줄글 작성]

# 2. 실현 가능성 (Solution)
### 2-1. 창업 아이템의 개발·구체화 계획
### 2-1-1. 창업아이템 개발 방안
[줄글 작성]
### 2-1-2. 차별성 및 경쟁력 확보 전략
[줄글 작성]

### 2-2. 사업추진 일정 (협약기간 내)
| 구분 | 추진 내용 | 추진 기간 | 세부 내용 |
| :--- | :--- | :--- | :--- |
| 1단계 | | | |
| 2단계 | | | |
| 3단계 | | | |
| 4단계 | | | |

### 2-3. 정부지원사업비 집행계획

| 비 목 | 집행 계획 | 정부지원사업비(ⓐ) | 자기부담사업비(ⓑ) 현금 | 자기부담사업비(ⓑ) 현물 | 합계(ⓐ+ⓑ) |
| :--- | :--- | ---: | ---: | ---: | ---: |
| 재료비 | {{budget_material_basis}} | {{budget_material_amount}} | {{cash_material_amount}} | {{physical_budget_material_amount}} | {{total_material_amount}} |
| 인건비 | {{budget_personnel_basis}} | {{budget_personnel_amount}} | {{cash_personnel_amount}} | {{physical_personnel_amount}} | {{total_personnel_amount}} |
| 외주용역비 | {{budget_outsourcing_basis}} | {{budget_outsourcing_amount}} | {{cash_outsourcing_amount}} | {{physical_outsourcing_amount}} | {{total_outsourcing_amount}} |
| 광고선전비 | {{budget_advertising_basis}} | {{budget_advertising_amount}} | {{cash_advertising_amount}} | {{physical_advertising_amount}} | {{total_advertising_amount}} |
| 지급수수료 | {{budget_commission_basis}} | {{budget_commission_amount}} | {{cash_commission_amount}} | {{physical_commission_amount}} | {{total_commission_amount}} |
| 창업활동비 | {{budget_activity_basis}} | {{budget_activity_amount}} | {{cash_activity_amount}} | {{physical_activity_amount}} | {{total_activity_amount}} |
| 기타 | {{budget_etc_basis}} | {{budget_etc_amount}} | {{cash_etc_amount}} | {{physical_etc_amount}} | {{total_etc_amount}} |
| **합 계** | | **{{total_grant}}** | **{{total_cash}}** | **{{total_physical}}** | **{{total_for_all}}** |

# 3. 성장전략 (Scale-up)
### 3-1. 사업화 추진 전략 (비즈니스 모델)
### 3-1-1. 비즈니스 모델(BM)
[줄글 작성]
### 3-1-2. 시장 진입 전략
[줄글 작성]

### 3-2. 사업추진 일정 (전체 사업단계)
| 구분 | 추진 내용 | 추진 기간 | 세부 내용 |
| :--- | :--- | :--- | :--- |
| 1단계 | 시장 검증 및 MVP | | |
| 2단계 | 서비스 런칭 | | |
| 3단계 | 사업 확장 | | |
| 4단계 | 글로벌 진출 | | |

### 3-3. 중장기 사회적 가치 도입계획 (ESG)
[줄글 작성]

# 4. 팀 구성 (Team)
### 4-1. 대표자 및 팀원의 보유 역량
[줄글 작성]

### 4-2. 팀 구성(안)
| 구분 | 직위 | 담당 업무 | 보유 역량(경력 및 학력 등) | 구성 상태 |
| :--- | :--- | :--- | :--- | :--- |
| 대표자 | CEO | [담당 업무] | [보유 역량] | 확정 |
| 팀원1 | [직위] | [담당 업무] | [보유 역량] | [상태] |
| 팀원2 | [직위] | [담당 업무] | [보유 역량] | [상태] |

### 4-3. 협력 기관 현황 및 협업 방안
| 구분 | 파트너명 | 보유 역량 | 협업 방안 | 협력 시기 |
| :--- | :--- | :--- | :--- | :--- |
| 기술 협력 | [파트너명] | [역량] | [협업 방안] | [시기] |
| 마케팅/홍보 | [파트너명] | [역량] | [협업 방안] | [시기] |
| 기타 협력 | [파트너명] | [역량] | [협업 방안] | [시기] |
`;
