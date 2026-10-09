// 응시 후 설문 (순수 함수). 응시 화면과 서버, 관리자 화면이 함께 쓴다.

export const SURVEY_QUESTIONS = [
  { id: "difficulty", text: "시험 난이도는 어땠나요?", low: "매우 쉬움", high: "매우 어려움" },
  { id: "time", text: "제한 시간은 어땠나요?", low: "많이 부족", high: "많이 남음" },
  { id: "clarity", text: "문항이 무엇을 묻는지 이해하기 쉬웠다.", low: "전혀 아니다", high: "매우 그렇다" },
  { id: "relevance", text: "문항이 실제 업무에서 AI를 쓰는 상황과 관련 있다고 느꼈다.", low: "전혀 아니다", high: "매우 그렇다" },
  { id: "usability", text: "응시 화면을 쓰기 편했다.", low: "전혀 아니다", high: "매우 그렇다" },
] as const;

export type SurveyQuestionId = (typeof SURVEY_QUESTIONS)[number]["id"];
export const SURVEY_TEXT_MAX = 1000;

export interface Survey {
  answers: Record<SurveyQuestionId, number>; // 1~5
  had_issue: boolean;
  issue: string | null;
  comment: string | null;
}

export class InvalidSurveyError extends Error {}

const text = (v: unknown, label: string): string | null => {
  if (v == null) return null;
  if (typeof v !== "string") throw new InvalidSurveyError(`${label} 형식이 올바르지 않습니다.`);
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > SURVEY_TEXT_MAX) throw new InvalidSurveyError(`${label}은 ${SURVEY_TEXT_MAX}자 이내로 써 주세요.`);
  return s || null;
};

/** 응시자가 보낸 설문을 검증한다. 다섯 문항은 모두 1~5 정수여야 한다 */
export function parseSurvey(body: unknown): Survey {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = (b.answers ?? {}) as Record<string, unknown>;
  const answers = {} as Survey["answers"];
  for (const q of SURVEY_QUESTIONS) {
    const v = raw[q.id];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) throw new InvalidSurveyError("모든 문항에 답해 주세요.");
    answers[q.id] = v;
  }
  if (typeof b.had_issue !== "boolean") throw new InvalidSurveyError("오류·불편 여부를 골라 주세요.");
  const issue = text(b.issue, "오류·불편 내용");
  return { answers, had_issue: b.had_issue, issue: b.had_issue ? issue : null, comment: text(b.comment, "의견") };
}

export interface SurveySummary {
  count: number;
  /** 문항별 평균(소수 첫째 자리)과 1~5 응답 수 */
  questions: { id: SurveyQuestionId; mean: number | null; counts: number[] }[];
  issueCount: number;
}

export function summarizeSurveys(surveys: Pick<Survey, "answers" | "had_issue">[]): SurveySummary {
  return {
    count: surveys.length,
    questions: SURVEY_QUESTIONS.map((q) => {
      const vals = surveys.map((s) => s.answers[q.id]).filter((v) => typeof v === "number");
      const counts = [1, 2, 3, 4, 5].map((n) => vals.filter((v) => v === n).length);
      return { id: q.id, mean: vals.length ? Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10 : null, counts };
    }),
    issueCount: surveys.filter((s) => s.had_issue).length,
  };
}
