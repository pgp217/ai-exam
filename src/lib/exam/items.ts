// 문항 은행 (공개용). 정답 키와 서술형 채점 기준표는 answer-key.data.ts 에만 둔다.
// 이 파일은 응시 화면(클라이언트)에서도 import 되므로 정답을 넣지 않는다.

import type { ChapterId, MidFactorId, SubFactorId } from "./factors";

export const ITEM_SET_VERSION = "NEWHIRE-AI-v1";

export const LIKERT_LABELS = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];

interface BaseItem {
  id: string;
  mid: MidFactorId;
  chapter: ChapterId;
  prompt: string;
}

export interface ChoiceItem extends BaseItem {
  type: "choice";
  sub: SubFactorId;
  options: string[];
}

export interface SelfItem extends BaseItem {
  type: "self";
}

export interface EssayItem extends BaseItem {
  type: "essay";
  title: string;
  scenario: string;
  minLength: number;
}

export type Item = ChoiceItem | SelfItem | EssayItem;

export const CHOICE_ITEMS: ChoiceItem[] = [
  // M1 AI 원리
  { id: "Q01", type: "choice", mid: "M1", sub: "S1", chapter: "ch01",
    prompt: "대규모 언어 모델(LLM)에 대한 설명으로 가장 적절한 것은?",
    options: [
      "질문마다 데이터베이스에서 검증된 사실을 찾아 그대로 답한다",
      "학습한 패턴을 바탕으로 다음 토큰을 확률적으로 예측해 텍스트를 생성한다",
      "사실 여부를 스스로 판단하는 장치가 있어 틀린 답을 하지 않는다",
      "사용자의 개인 일정과 파일 내용을 자동으로 알고 있다",
    ] },
  { id: "Q02", type: "choice", mid: "M1", sub: "S1", chapter: "ch01",
    prompt: "AI 기술의 포함 관계를 바르게 나타낸 것은?",
    options: [
      "생성형 AI ⊃ 딥러닝 ⊃ 머신러닝 ⊃ AI",
      "머신러닝 ⊃ AI ⊃ 생성형 AI ⊃ 딥러닝",
      "AI ⊃ 머신러닝 ⊃ 딥러닝 ⊃ 생성형 AI",
      "AI ⊃ 생성형 AI ⊃ 머신러닝 ⊃ 딥러닝",
    ] },
  { id: "Q03", type: "choice", mid: "M1", sub: "S2", chapter: "ch01",
    prompt: "생성형 AI의 근본적인 한계에 해당하지 않는 것은?",
    options: [
      "학습 시점 이후의 정보를 모를 수 있다",
      "여러 단계의 복잡한 계산에서 오류가 날 수 있다",
      "상관관계와 인과관계를 혼동할 수 있다",
      "문서 요약이나 형식 변환을 할 수 없다",
    ] },

  // M2 도구 지식
  { id: "Q04", type: "choice", mid: "M2", sub: "S4", chapter: "ch02",
    prompt: "100페이지가 넘는 계약서 전체를 나누지 않고 한 번에 분석하려 한다. 도구를 고를 때 가장 먼저 따져야 할 것은?",
    options: [
      "컨텍스트 윈도우(한 번에 처리할 수 있는 텍스트 길이)",
      "도구의 전체 사용자 수",
      "이미지 생성 기능이 있는지",
      "앱 화면 디자인",
    ] },
  { id: "Q05", type: "choice", mid: "M2", sub: "S4", chapter: "ch02",
    prompt: "AI 서비스가 요금과 처리 한도를 계산할 때 기준으로 삼는 텍스트 단위는?",
    options: ["문장", "토큰", "파일", "단락"] },
  { id: "Q06", type: "choice", mid: "M2", sub: "S3", chapter: "ch02",
    prompt: "오늘 아침 발표된 업계 뉴스를 요약하려 한다. 도구를 고를 때 가장 중요한 기능은?",
    options: ["이미지 생성", "코드 실행", "실시간 웹 검색 연동", "긴 대화 기록 저장"] },

  // M3 프롬프트 설계
  { id: "Q07", type: "choice", mid: "M3", sub: "S5", chapter: "ch03",
    prompt: '다음 프롬프트에서 5요소 중 빠진 것은? "당신은 10년 경력의 HR 담당자입니다. 신입사원 온보딩 안내 메일을 작성해 주세요. 300자 이내, 친근한 톤으로."',
    options: ["역할과 과업", "과업과 제약", "역할과 제약", "맥락과 형식"] },
  { id: "Q08", type: "choice", mid: "M3", sub: "S6", chapter: "ch04",
    prompt: "고객 문의를 '칭찬/불만/문의' 중 하나로 분류하게 했는데 결과 형식이 매번 달라진다. 가장 효과적인 개선 방법은?",
    options: [
      "유형별로 형식이 일관된 분류 예시를 2~3개씩 넣는다(Few-shot)",
      '"정확하게 분류해"라고 강조한다',
      '역할을 "분류 전문가"로 바꾼다',
      "Temperature를 최대로 올린다",
    ] },
  { id: "Q09", type: "choice", mid: "M3", sub: "S6", chapter: "ch04",
    prompt: '"당신은 노무사입니다"처럼 AI에 역할을 부여했을 때에 대한 설명으로 옳은 것은?',
    options: [
      "해당 자격을 갖춘 전문가 수준의 정확성이 보장된다",
      "답변의 톤과 관점은 바뀌지만 실제 전문 지식이 생기는 것은 아니므로 중요한 내용은 전문가 검토가 필요하다",
      "역할을 부여하면 환각이 사라진다",
      "역할 부여는 결과에 아무런 영향을 주지 않는다",
    ] },

  // M4 반복 개선
  { id: "Q10", type: "choice", mid: "M4", sub: "S7", chapter: "ch05",
    prompt: "AI가 만든 보고서 초안이 기대와 다를 때 가장 효과적인 후속 요청은?",
    options: [
      '"별로야, 다시 해"라고만 한다',
      "떠오르는 수정 사항을 한 번에 모두 몰아서 요청한다",
      "무엇이(What) 왜(Why) 문제인지, 어떻게(How) 바꿀지 구체적으로 알려 준다",
      "새 대화창을 열어 처음 프롬프트를 그대로 다시 입력한다",
    ] },
  { id: "Q11", type: "choice", mid: "M4", sub: "S8", chapter: "ch05",
    prompt: "\"신입사원 교육 계획 짜 줘\"라고 했더니 답이 너무 길고 일반적이었다. 가장 가능성이 높은 원인은?",
    options: [
      "AI 서버가 느렸다",
      "질문을 한국어로 했다",
      "대화창을 오래 열어 두었다",
      "대상·분량·형식 같은 조건이 프롬프트에 없었다",
    ] },
  { id: "Q12", type: "choice", mid: "M4", sub: "S7", chapter: "ch05",
    prompt: "반복 개선 과정에서 피해야 할 방법은?",
    options: [
      "지금까지의 맥락을 버리고 새 대화에서 처음부터 다시 묻는다",
      "잘된 부분은 유지하라고 알려 준다",
      "수정할 부분을 이전 답변에서 인용해 지정한다",
      "한 번에 한두 가지씩 고쳐 달라고 요청한다",
    ] },

  // M5 업무 적용
  { id: "Q13", type: "choice", mid: "M5", sub: "S9", chapter: "ch07",
    prompt: '팀장이 "다음 주 임원 보고용 분기 실적 보고서를 AI로 빨리 만들어 달라"고 했다. 업무 활용 원칙에 가장 맞는 방법은?',
    options: [
      "미공개 재무 수치를 외부 AI에 그대로 넣어 완성본을 받는다",
      "공개 가능한 정보로 구조와 초안을 AI에 맡기고, 수치 확인과 최종 문장은 직접 마무리한다",
      "AI가 만든 보고서를 그대로 올리고 문제가 생기면 AI의 오류라고 설명한다",
      "AI는 믿을 수 없으니 처음부터 전부 직접 작성한다",
    ] },
  { id: "Q14", type: "choice", mid: "M5", sub: "S10", chapter: "ch06",
    prompt: "조사·연구에 AI를 쓸 때 '안전한 활용'에 해당하는 것은?",
    options: [
      "AI가 추천한 논문을 확인 없이 참고문헌에 넣는다",
      "AI가 알려 준 통계를 검증 없이 보고서에 인용한다",
      "검색 키워드를 넓히거나 낯선 개념을 이해하는 데 활용한다",
      "AI 답변을 그대로 결과물로 제출한다",
    ] },
  { id: "Q15", type: "choice", mid: "M5", sub: "S9", chapter: "ch07",
    prompt: "AI로 쓴 고객 안내 메일 초안을 보내기 전에 꼭 해야 할 일은?",
    options: [
      "그대로 발송한다",
      "다른 AI에도 물어 내용이 같으면 발송한다",
      "길이만 줄여서 발송한다",
      "사실관계, 받는 사람, 어조를 직접 검토하고 수정한다",
    ] },

  // M6 결과 검증
  { id: "Q16", type: "choice", mid: "M6", sub: "S12", chapter: "ch09",
    prompt: "다음 중 환각(Hallucination) 위험이 가장 높은 요청은?",
    options: [
      '"2023년 3분기 A사 ○○공장의 월별 불량률과 근거 논문을 알려 줘"',
      '"제2차 세계대전은 언제 끝났어?"',
      '"이 이메일 문장을 더 정중하게 다듬어 줘"',
      '"워크숍 아이디어 10개를 브레인스토밍해 줘"',
    ] },
  { id: "Q17", type: "choice", mid: "M6", sub: "S11", chapter: "ch09",
    prompt: "AI 결과물이 세련되고 그럴듯할수록 사람이 비판 없이 받아들이게 되는 경향을 무엇이라 하는가?",
    options: ["확증 편향", "자동화 편향", "선택 편향", "생존자 편향"] },
  { id: "Q18", type: "choice", mid: "M6", sub: "S11", chapter: "ch09",
    prompt: "AI가 제시한 통계 수치를 보고서에 쓰려 한다. 검증 원칙에 맞는 것은?",
    options: [
      'AI에게 "정말 맞아?"라고 다시 묻는다',
      "숫자를 반올림해서 쓴다",
      "독립된 출처 2곳 이상에서 원자료를 직접 확인한다",
      '출처를 "연구에 따르면"으로 적는다',
    ] },

  // M7 윤리·보안
  { id: "Q19", type: "choice", mid: "M7", sub: "S13", chapter: "ch10",
    prompt: "외부 AI 서비스로 회의록을 정리하려 한다. 입력하기 전에 가장 먼저 할 일은?",
    options: [
      "회의록을 최대한 길게 늘려 맥락을 충분히 준다",
      "여러 AI 도구에 같은 원본을 모두 넣어 결과를 비교한다",
      "AI를 사용한다는 사실을 참석자에게 알리지 않는다",
      "참석자 연락처, 미공개 계약 조건 같은 민감 정보를 지우거나 가명 처리한다",
    ] },
  { id: "Q20", type: "choice", mid: "M7", sub: "S14", chapter: "ch10",
    prompt: "과거 10년간 합격자 데이터로 학습한 채용 AI가 특정 성별 지원자에게 낮은 점수를 주었다. 원인으로 가장 적절한 것은?",
    options: [
      "과거 채용 데이터에 담긴 역사적 편향을 AI가 그대로 학습했다",
      "AI가 스스로 차별하기로 판단했다",
      "프롬프트가 너무 길었다",
      "해당 성별 지원자의 역량이 실제로 낮았다",
    ] },
  { id: "Q21", type: "choice", mid: "M7", sub: "S14", chapter: "ch10",
    prompt: "AI로 사내 캠페인 문구와 이미지를 만들 때 원칙에 맞지 않는 것은?",
    options: [
      "필요한 경우 AI 활용 사실을 밝힌다",
      "특정 작가 이름을 프롬프트에 넣어 그 화풍을 그대로 따라 한 이미지를 쓴다",
      "AI 결과물을 시작점으로 삼아 우리 조직의 목소리로 다듬는다",
      "도구의 이용약관과 상업적 이용 가능 범위를 확인한다",
    ] },

  // M8 책임 있는 사용
  { id: "Q22", type: "choice", mid: "M8", sub: "S15", chapter: "ch10",
    prompt: "AI를 활용해 만든 보고서에 첨부하는 성실성 선언(Diligence Statement)의 3요소는?",
    options: [
      "사용 요금, 사용 시간, 사용 도구",
      "AI 도구 추천, 경쟁사 비교, 향후 계획",
      "AI 역할 인정, 검증 방법, 최종 책임 선언",
      "작성자 서명, 결재선, 보안 등급",
    ] },
  { id: "Q23", type: "choice", mid: "M8", sub: "S16", chapter: "ch11",
    prompt: "건강한 AI 활용 습관에 해당하는 것은?",
    options: [
      "모든 업무를 일단 AI에 먼저 맡긴다",
      "AI 답변은 수정 없이 그대로 쓴다",
      "중요한 결정은 AI의 판단에 따른다",
      "내 생각을 먼저 정리한 뒤 AI로 보완한다",
    ] },
  { id: "Q24", type: "choice", mid: "M8", sub: "S15", chapter: "ch11",
    prompt: "AI의 도움을 받아 작성한 팀 보고서를 제출할 때 바람직한 것은?",
    options: [
      "AI 활용 범위와 검증 방법을 밝히고, 최종 책임은 작성자가 진다",
      "AI 사용 사실은 굳이 밝히지 않는다",
      "오류가 생기면 AI의 책임이라고 적어 둔다",
      "AI를 공동 작성자로 표기한다",
    ] },
];

// 중위요인당 1문항. 점수에는 반영하지 않고 "내가 본 나 vs 실제" 비교에만 쓴다.
export const SELF_ITEMS: SelfItem[] = [
  { id: "P1", type: "self", mid: "M1", chapter: "ch01", prompt: "나는 생성형 AI가 답을 만드는 원리와 그 한계를 동기에게 설명할 수 있다." },
  { id: "P2", type: "self", mid: "M2", chapter: "ch02", prompt: "나는 목적에 맞는 AI 도구를 고르고, 토큰과 컨텍스트 윈도우를 고려해 쓸 수 있다." },
  { id: "P3", type: "self", mid: "M3", chapter: "ch03", prompt: "나는 맥락·역할·과업·제약·형식을 갖춘 프롬프트를 쓸 수 있다." },
  { id: "P4", type: "self", mid: "M4", chapter: "ch05", prompt: "나는 AI 답변이 불만족스러우면 원인을 찾아 구체적으로 다시 요청한다." },
  { id: "P5", type: "self", mid: "M5", chapter: "ch07", prompt: "나는 문서 초안 작성이나 자료 조사에 AI를 활용할 수 있다." },
  { id: "P6", type: "self", mid: "M6", chapter: "ch09", prompt: "나는 AI가 제시한 수치와 출처를 원자료로 확인한다." },
  { id: "P7", type: "self", mid: "M7", chapter: "ch10", prompt: "나는 개인정보·회사 기밀을 외부 AI에 넣지 않고, 저작권과 편향을 점검한다." },
  { id: "P8", type: "self", mid: "M8", chapter: "ch11", prompt: "나는 필요할 때 AI 사용 사실을 밝히고, AI에 지나치게 의존하지 않도록 주의한다." },
];

export const ESSAY_ITEMS: EssayItem[] = [
  { id: "E1", type: "essay", mid: "M3", chapter: "ch03", minLength: 50,
    title: "프롬프트 작성",
    scenario:
      "입사 2주 차인 당신에게 팀장이 \"다음 달 입사하는 신입 3명의 첫 주 OJT 일정표 초안을 AI로 만들어 와\"라고 했습니다. " +
      "근무 시간은 9시~18시, 첫날은 오리엔테이션, 금요일 오후에는 팀 회고가 있습니다.",
    prompt: "AI에 보낼 프롬프트를 실제로 입력할 문장 그대로 작성하세요." },
  { id: "E2", type: "essay", mid: "M6", chapter: "ch09", minLength: 50,
    title: "결과 검증",
    scenario:
      "AI가 써 준 다음 단락을 팀 보고서에 넣으려 합니다.\n\n" +
      "\"국내 신입사원의 87.3%가 입사 첫해에 생성형 AI를 업무에 활용하며(OO연구원, 2025), 이들의 업무 생산성은 평균 42% 높아졌다. " +
      "특히 AI를 쓰는 신입사원은 조기 퇴사율이 절반 수준이라는 연구 결과도 있다.\"",
    prompt: "보고서에 쓰기 전에 의심해야 할 부분 3가지와, 각각을 어떻게 확인할지 쓰세요." },
  { id: "E3", type: "essay", mid: "M7", chapter: "ch10", minLength: 50,
    title: "윤리 판단",
    scenario:
      "선배가 \"고객 500명의 이름, 전화번호, 구매 내역이 든 엑셀을 무료 AI 챗봇에 올려서 연령대별로 정리해 줘. 급해.\"라고 부탁했습니다.",
    prompt: "어떻게 대응할지 구체적으로 쓰세요. 선배의 업무 요청을 어떻게 해결할지도 포함하세요." },
];

export const ALL_ITEMS: Item[] = [...CHOICE_ITEMS, ...SELF_ITEMS, ...ESSAY_ITEMS];
