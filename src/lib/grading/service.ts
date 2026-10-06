// 서술형 채점 흐름 (서버 전용): AI 1차 채점 → 담당자 확정 → 결과 계산.
import "server-only";

import { after } from "next/server";
import { ANSWER_KEY, rubricFor } from "../exam/answer-key";
import { ESSAY_ITEMS, type EssayItem } from "../exam/items";
import { essayScoreFromCriteria } from "../exam/scoring";
import { missingEssayRows, scoreSubmission } from "../attempt/responses";
import { getStore } from "../attempt/store";
import type { AiGradingRow, NewAiGrading, ReviewAttempt } from "../attempt/types";
import { onResultComplete } from "../feedback/service";
import { GRADER_MODEL, gradeWithClaude } from "./claude";
import { graderMode } from "./mode";
import {
  FAKE_MODEL, PROMPT_VERSION, differsFromAi, fakeGrade, gradeEmpty, normalizeOutput, parseCriterionScores,
} from "./grade";

const textOf = (r: ReviewAttempt["responses"][number] | undefined) => (r && "text" in r.answer ? r.answer.text : "");

async function gradeOne(item: EssayItem, responseId: string, answer: string): Promise<NewAiGrading> {
  const rubric = rubricFor(item.id);
  const base = { response_id: responseId, prompt_version: PROMPT_VERSION };

  if (answer.trim() === "") {
    const g = gradeEmpty(rubric);
    return { ...base, model: "rule:empty-answer", criterion_scores: g.criterionScores, score: g.score, rationale: g.rationale, evidence: [], raw: { reasons: g.reasons } };
  }

  const mode = graderMode();
  if (mode === "none") throw new Error("ANTHROPIC_API_KEY 가 없어 AI 채점을 할 수 없습니다.");
  if (mode === "fake") {
    const output = fakeGrade(rubric, answer);
    const g = normalizeOutput(rubric, output, answer);
    return { ...base, model: FAKE_MODEL, criterion_scores: g.criterionScores, score: g.score, rationale: g.rationale, evidence: g.evidence, raw: { reasons: g.reasons, output } };
  }

  const res = await gradeWithClaude(item, rubric, answer);
  const g = normalizeOutput(rubric, res.output, answer);
  return { ...base, model: res.model, criterion_scores: g.criterionScores, score: g.score, rationale: g.rationale, evidence: g.evidence, raw: { reasons: g.reasons, ...res.raw } };
}

export interface GradingRun {
  graded: string[]; // 새로 채점한 문항
  failed: { itemId: string; error: string }[];
}

/**
 * 제출된 응시의 서술형을 AI 로 1차 채점한다. 이미 AI 채점이 있는 문항은 건너뛴다(force 면 다시 채점).
 * 세 문항 모두 AI 채점이 끝나면 응시 상태를 submitted → grading(담당자 검토 대기)으로 바꾼다.
 */
export async function gradeAttemptEssays(attemptId: string, opts: { force?: boolean; itemIds?: string[] } = {}): Promise<GradingRun> {
  const store = getStore();
  let review = await store.getReviewAttempt(attemptId);
  if (!review || review.attempt.status === "in_progress") return { graded: [], failed: [] };

  const missing = missingEssayRows(review.responses);
  if (missing.length > 0) {
    await store.ensureResponses(attemptId, missing);
    review = (await store.getReviewAttempt(attemptId))!;
  }

  const targets = ESSAY_ITEMS.filter((item) => {
    if (opts.itemIds && !opts.itemIds.includes(item.id)) return false;
    const resp = review!.responses.find((r) => r.item_id === item.id)!;
    return opts.force || !review!.aiGradings.some((g) => g.response_id === resp.id);
  });

  const settled = await Promise.allSettled(
    targets.map(async (item) => {
      const resp = review!.responses.find((r) => r.item_id === item.id)!;
      await store.insertAiGrading(await gradeOne(item, resp.id, textOf(resp)));
      return item.id;
    }),
  );

  const run: GradingRun = { graded: [], failed: [] };
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") run.graded.push(s.value);
    else {
      const error = s.reason instanceof Error ? s.reason.message : String(s.reason);
      console.error(`[grading] ${attemptId} ${targets[i].id} 실패:`, s.reason);
      run.failed.push({ itemId: targets[i].id, error });
    }
  });

  const done = ESSAY_ITEMS.every((item) => {
    const resp = review!.responses.find((r) => r.item_id === item.id)!;
    return run.graded.includes(item.id) || review!.aiGradings.some((g) => g.response_id === resp.id);
  });
  if (done) await store.setAttemptStatus(attemptId, "grading", ["submitted"]);
  return run;
}

/** 응답을 보낸 뒤 백그라운드로 AI 채점을 실행한다 (Vercel 에서는 함수가 끝나기 전까지 이어서 실행) */
export function scheduleGrading(attemptId: string) {
  after(async () => {
    try {
      await gradeAttemptEssays(attemptId);
    } catch (e) {
      console.error(`[grading] ${attemptId} 예약 채점 실패:`, e);
    }
  });
}

// ── 담당자 확정 ─────────────────────────────────────────

export type ConfirmResult = { ok: true; complete: boolean } | { ok: false; error: string };

export async function confirmGrading(input: {
  attemptId: string;
  itemId: string;
  graderId: string;
  scores: Record<string, unknown>;
  reason: string;
}): Promise<ConfirmResult> {
  const store = getStore();
  const item = ESSAY_ITEMS.find((e) => e.id === input.itemId);
  if (!item) return { ok: false, error: "알 수 없는 문항입니다." };
  const review = await store.getReviewAttempt(input.attemptId);
  if (!review || review.attempt.status === "in_progress") return { ok: false, error: "제출된 응시가 아닙니다." };
  const resp = review.responses.find((r) => r.item_id === item.id);
  if (!resp) return { ok: false, error: "응답이 없습니다. AI 채점을 먼저 실행해 주세요." };

  const rubric = rubricFor(item.id);
  const scores = parseCriterionScores(rubric, input.scores);
  if (typeof scores === "string") return { ok: false, error: scores };

  const ai: AiGradingRow | undefined = review.aiGradings.find((g) => g.response_id === resp.id); // 최신순
  const reason = input.reason.trim();
  if (differsFromAi(rubric, scores, ai?.criterion_scores ?? null) && reason.length === 0) {
    return { ok: false, error: "AI 1차 점수와 다르게 확정하려면 사유를 적어 주세요." };
  }

  await store.upsertFinalGrading({
    response_id: resp.id,
    ai_grading_id: ai?.id ?? null,
    grader_id: input.graderId,
    criterion_scores: scores,
    score: essayScoreFromCriteria(rubric, scores),
    override_reason: reason || null,
  });

  const complete = await recomputeResult(input.attemptId);
  return { ok: true, complete };
}

/** 확정된 서술형 점수로 결과를 다시 계산한다. 세 문항이 모두 확정되면 결과와 응시 상태를 complete 로 바꾼다. */
export async function recomputeResult(attemptId: string): Promise<boolean> {
  const store = getStore();
  const review = await store.getReviewAttempt(attemptId);
  if (!review) return false;

  const essayScores = Object.fromEntries(
    ESSAY_ITEMS.map((e) => {
      const resp = review.responses.find((r) => r.item_id === e.id);
      const final = review.finals.find((f) => f.response_id === resp?.id);
      return [e.id, final ? final.score : null];
    }),
  );
  const { detail } = scoreSubmission(review.responses, ANSWER_KEY, essayScores);
  const complete = detail.status === "complete";

  await store.updateResults(attemptId, {
    practice_score: detail.practice,
    total: detail.total,
    grade: detail.grade,
    ai_type: detail.aiType?.name ?? null,
    detail,
    status: complete ? "complete" : "grading",
  });
  if (complete) {
    await store.setAttemptStatus(attemptId, "complete", ["submitted", "grading"]);
    // 개인 리포트의 AI 피드백 초안을 만들거나, 승인된 피드백이면 점수 변경을 표시한다
    const report = await store.getReport(attemptId);
    await onResultComplete(attemptId, detail, report?.result?.feedback ?? null);
  }
  return complete;
}

export { GRADER_MODEL, graderMode };
