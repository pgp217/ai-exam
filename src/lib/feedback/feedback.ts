// 개인 리포트의 AI 피드백 (순수 로직): 프롬프트, 출력 정리, 개발용 가짜 피드백.
// 확정된 점수와 기준표만 보낸다. 이름·사번·소속은 넣지 않는다.

import { CHAPTERS, type ChapterId } from "../exam/factors";
import type { Rubric } from "../exam/answer-key.data";
import type { ExamResult } from "../exam/scoring";
import type { FeedbackAction } from "../attempt/types";

export const FEEDBACK_PROMPT_VERSION = "feedback-v2";
export const ACTION_COUNT = 3;

export const FEEDBACK_SYSTEM = `당신은 신입사원의 AI 활용 역량 시험 결과를 바탕으로 성장 조언을 쓰는 코치입니다. 쓴 내용은 담당자가 확인한 뒤 신입사원 본인에게 공개됩니다.

작성 원칙
- 주어진 점수, 기준별 달성 수준, 자기평가 차이만 근거로 씁니다. 주어지지 않은 사실(성격, 태도, 다른 사람과의 비교, 순위)은 쓰지 않습니다.
- 신입사원에게 직접 말하듯 "~해 보세요" 같은 존댓말로, 따뜻하지만 구체적으로 씁니다. 칭찬은 한 문장으로 짧게 하고 개선 행동에 집중합니다.
- summary 는 2~3문장으로 현재 수준과 가장 먼저 키울 점을 말합니다.
- actions 는 정확히 ${ACTION_COUNT}개입니다. 점수가 낮거나 자기평가와 차이가 큰 영역부터 고르고, 각 action 의 detail 은 다음 업무에서 바로 해 볼 수 있는 행동을 2~3문장으로 씁니다. 서술형 기준표의 "다음 단계" 수준을 활용하면 좋습니다.
- chapter 는 주어진 복습 교재 장 목록에서 고르고, 맞는 장이 없으면 "none" 으로 둡니다.
- 점수 숫자를 그대로 나열하지 말고, 의미를 풀어 씁니다.
- 응시자가 실제로 무엇을 썼는지는 <observed> 에 있는 채점 근거로만 판단합니다. 기준표의 수준 설명과 예시 문구("보기 좋게", "조금 위험할 수 있다" 등)는 수준을 설명하는 말일 뿐 응시자가 쓴 말이 아니므로, 응시자의 말처럼 따옴표로 인용하거나 "~했다"고 단정하지 않습니다.
- 1점은 다음 단계 조건을 충족하지 못했다는 뜻이며, 해당 내용을 아예 쓰지 않은 경우도 포함합니다. 1점 칸의 설명대로 행동했다고 쓰지 말고, 근거가 없으면 "~이 드러나지 않았다"처럼 씁니다.`;

const levelText = (rubric: Rubric, key: string, score: number) => rubric.criteria.find((c) => c.key === key)?.levels[score - 1] ?? "";

export function buildFeedbackPrompt(
  result: ExamResult,
  // observed: 담당자가 확정한 점수와 같은 기준에 한해, AI 채점이 답안을 보고 쓴 판단 이유
  essays: { itemId: string; title: string; criterionScores: Record<string, number>; rubric: Rubric; observed?: Record<string, string> }[],
): string {
  const lines: string[] = [];
  lines.push(`<overall>종합 ${result.total}점(${result.grade}), 지식 ${result.knowledge}점, 실전 ${result.practice}점, 유형: ${result.aiType?.name} — ${result.aiType?.desc}</overall>`);
  lines.push("<factors>");
  for (const m of result.mids) {
    const gap = m.gapNote === "over" ? " (자기평가가 실제보다 크게 높음)" : m.gapNote === "under" ? " (자기평가가 실제보다 크게 낮음)" : "";
    lines.push(`- ${m.name}: 실제 ${m.score ?? "미확정"}점, 자기평가 ${m.selfScore ?? "없음"}점${gap}, 객관식 오답 ${m.wrongItems.length}개`);
  }
  lines.push("</factors>");
  lines.push("<essays>");
  for (const e of essays) {
    lines.push(`<essay title="${e.title}">`);
    for (const c of e.rubric.criteria) {
      const s = e.criterionScores[c.key];
      const now = s === 1 ? "최저 수준(다음 단계 미충족, 언급 없음 포함)" : `수준 설명: ${levelText(e.rubric, c.key, s)}`;
      const next = s < 4 ? ` / 다음 단계(${s + 1}점) 수준 설명: ${levelText(e.rubric, c.key, s + 1)}` : "";
      lines.push(`- ${c.name} ${s}점 — ${now}${next}`);
      const seen = e.observed?.[c.key];
      if (seen) lines.push(`  <observed>${seen}</observed>`);
    }
    lines.push("</essay>");
  }
  lines.push("</essays>");
  lines.push(`<chapters>\n${result.review.map((c) => `- ${c.id}: ${c.title}`).join("\n") || "- (없음)"}\n</chapters>`);
  return lines.join("\n");
}

export interface FeedbackOutput {
  summary: string;
  actions: { title: string; detail: string; chapter: string }[];
}

export class InvalidFeedbackError extends Error {}

export function normalizeFeedback(out: FeedbackOutput): { summary: string; actions: FeedbackAction[] } {
  const summary = out.summary.trim();
  const actions = out.actions
    .map((a) => ({
      title: a.title.trim(),
      detail: a.detail.trim(),
      chapter: a.chapter in CHAPTERS ? (a.chapter as ChapterId) : null,
    }))
    .filter((a) => a.title && a.detail);
  if (!summary || actions.length === 0) throw new InvalidFeedbackError("피드백 내용이 비어 있습니다.");
  return { summary, actions: actions.slice(0, ACTION_COUNT + 1) };
}

/** Claude API 키가 없을 때 개발용으로 쓰는 템플릿 피드백 */
export function fakeFeedback(result: ExamResult): { summary: string; actions: FeedbackAction[] } {
  // 점수가 낮은 중위요인부터 서로 다른 세 영역
  const weak = [...result.mids].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).map((m) => m.name).slice(0, ACTION_COUNT);
  const chapters = result.review.map((c) => c.id);
  return {
    summary: `[가짜 피드백] ${result.aiType?.name ?? ""} 유형입니다. ${weak.slice(0, 2).join("·")} 영역을 먼저 보완해 보세요. (Claude API 키 없이 만든 개발용 문구입니다.)`,
    actions: Array.from({ length: ACTION_COUNT }, (_, i) => ({
      title: `[가짜] ${weak[i % weak.length]} 연습`,
      detail: `${weak[i % weak.length]} 관련 교재 내용을 다시 읽고, 다음 업무에서 한 번 적용해 보세요.`,
      chapter: chapters[i] ?? null,
    })),
  };
}
