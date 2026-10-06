// 요인 체계 (상위 3 → 중위 8 → 하위 16). 교재: genai-book Ch 1~11.

export const CHAPTERS = {
  ch01: { title: "Chapter 1 생성형 AI란" },
  ch02: { title: "Chapter 2 주요 도구와 생태계" },
  ch03: { title: "Chapter 3 프롬프트의 구조" },
  ch04: { title: "Chapter 4 고급 프롬프팅 기법" },
  ch05: { title: "Chapter 5 반복 개선의 방법론" },
  ch06: { title: "Chapter 6 학습과 연구" },
  ch07: { title: "Chapter 7 업무와 비즈니스" },
  ch08: { title: "Chapter 8 창작과 콘텐츠" },
  ch09: { title: "Chapter 9 환각의 이해와 대응" },
  ch10: { title: "Chapter 10 윤리적 사용과 책임" },
  ch11: { title: "Chapter 11 책임 있는 AI 사용" },
} as const;

export type ChapterId = keyof typeof CHAPTERS;

export type TopFactorId = "understand" | "apply" | "responsible";
export type MidFactorId = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8";
export type SubFactorId =
  | "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8"
  | "S9" | "S10" | "S11" | "S12" | "S13" | "S14" | "S15" | "S16";

export interface TopFactor {
  id: TopFactorId;
  name: string;
  desc: string;
}

export interface MidFactor {
  id: MidFactorId;
  top: TopFactorId;
  name: string;
  desc: string;
  chapters: ChapterId[];
}

export interface SubFactor {
  id: SubFactorId;
  mid: MidFactorId;
  name: string;
  desc: string;
}

export const TOP_FACTORS: TopFactor[] = [
  { id: "understand", name: "AI 이해", desc: "생성형 AI의 작동 원리와 한계, 도구의 특징을 이해하는 정도" },
  { id: "apply", name: "AI 활용", desc: "프롬프트를 설계하고 개선해 실제 업무에 적용하는 능력" },
  { id: "responsible", name: "AI 책임", desc: "결과를 검증하고 윤리·보안 원칙을 지키며 책임 있게 사용하는 태도" },
];

export const MID_FACTORS: MidFactor[] = [
  { id: "M1", top: "understand", name: "AI 원리", desc: "AI가 답을 만드는 방식과 그 한계를 아는 정도", chapters: ["ch01"] },
  { id: "M2", top: "understand", name: "도구 지식", desc: "목적에 맞는 도구를 고르고 토큰·컨텍스트를 고려하는 정도", chapters: ["ch02"] },
  { id: "M3", top: "apply", name: "프롬프트 설계", desc: "원하는 결과를 얻도록 프롬프트를 구성하는 능력", chapters: ["ch03", "ch04"] },
  { id: "M4", top: "apply", name: "반복 개선", desc: "불만족스러운 응답의 원인을 찾아 구체적으로 개선하는 능력", chapters: ["ch05"] },
  { id: "M5", top: "apply", name: "업무 적용", desc: "문서 작성, 학습·조사 등 실제 업무에 AI를 쓰는 능력", chapters: ["ch06", "ch07", "ch08"] },
  { id: "M6", top: "responsible", name: "결과 검증", desc: "AI 결과의 사실 여부와 논리를 확인하는 습관", chapters: ["ch09"] },
  { id: "M7", top: "responsible", name: "윤리·보안", desc: "개인정보·기밀을 지키고 저작권·편향을 점검하는 태도", chapters: ["ch10"] },
  { id: "M8", top: "responsible", name: "책임 있는 사용", desc: "AI 사용을 투명하게 밝히고 과의존을 경계하는 태도", chapters: ["ch11"] },
];

export const SUB_FACTORS: SubFactor[] = [
  { id: "S1", mid: "M1", name: "생성 원리", desc: "다음 토큰을 확률적으로 예측해 생성한다는 점을 이해한다" },
  { id: "S2", mid: "M1", name: "AI 한계", desc: "환각, 학습 시점, 계산·인과 추론의 한계를 안다" },
  { id: "S3", mid: "M2", name: "도구 선택", desc: "작업 목적에 맞는 도구 기능을 고른다" },
  { id: "S4", mid: "M2", name: "토큰과 컨텍스트", desc: "토큰과 컨텍스트 윈도우가 비용·처리량에 주는 영향을 안다" },
  { id: "S5", mid: "M3", name: "5요소 구성", desc: "맥락·역할·과업·제약·형식을 갖춘 프롬프트를 쓴다" },
  { id: "S6", mid: "M3", name: "고급 기법", desc: "Few-shot, 단계별 추론, 역할 부여를 상황에 맞게 쓴다" },
  { id: "S7", mid: "M4", name: "구체적 피드백", desc: "무엇이 왜 문제인지, 어떻게 바꿀지 구체적으로 요청한다" },
  { id: "S8", mid: "M4", name: "실패 원인 분석", desc: "불만족스러운 응답의 원인을 프롬프트에서 찾는다" },
  { id: "S9", mid: "M5", name: "문서 초안 작성", desc: "AI 초안을 직접 검토·수정해 업무 문서로 완성한다" },
  { id: "S10", mid: "M5", name: "학습·조사 활용", desc: "AI를 학습과 조사의 보조 도구로 안전하게 쓴다" },
  { id: "S11", mid: "M6", name: "교차 검증", desc: "중요한 정보를 독립된 원자료로 확인한다" },
  { id: "S12", mid: "M6", name: "환각 신호 탐지", desc: "환각이 생기기 쉬운 질문과 의심 신호를 알아챈다" },
  { id: "S13", mid: "M7", name: "개인정보·기밀 보호", desc: "민감 정보를 외부 AI에 넣지 않고 비식별화한다" },
  { id: "S14", mid: "M7", name: "저작권과 편향", desc: "저작권을 존중하고 AI 출력의 편향을 점검한다" },
  { id: "S15", mid: "M8", name: "AI 사용 표시", desc: "AI 활용 범위와 검증 방법을 밝히고 책임을 진다" },
  { id: "S16", mid: "M8", name: "과의존 경계", desc: "스스로 먼저 생각하고 AI를 보완 도구로 쓴다" },
];

export function midFactor(id: MidFactorId): MidFactor {
  const f = MID_FACTORS.find((m) => m.id === id);
  if (!f) throw new Error(`unknown mid factor ${id}`);
  return f;
}
