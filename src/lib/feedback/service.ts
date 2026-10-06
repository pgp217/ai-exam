// 개인 리포트 AI 피드백 흐름 (서버 전용): 결과 확정 → 초안 생성 → 담당자 확인·수정 → 공개.
import "server-only";

import { after } from "next/server";
import { rubricFor } from "../exam/answer-key";
import { ESSAY_ITEMS } from "../exam/items";
import type { ExamResult } from "../exam/scoring";
import { getStore } from "../attempt/store";
import type { Feedback, FeedbackAction } from "../attempt/types";
import { graderMode } from "../grading/mode";
import { feedbackWithClaude } from "./claude";
import { buildFeedbackPrompt, fakeFeedback, normalizeFeedback } from "./feedback";

const basisOf = (r: ExamResult) => ({ total: r.total, practice: r.practice });
const sameBasis = (a: Feedback["basis"], b: Feedback["basis"]) => a.total === b.total && a.practice === b.practice;

/** 결과가 확정된 응시의 피드백 초안을 만든다. 이미 승인된 피드백은 force 일 때만 덮어쓴다. */
export async function generateFeedback(attemptId: string, opts: { force?: boolean } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = getStore();
  const [report, review] = await Promise.all([store.getReport(attemptId), store.getReviewAttempt(attemptId)]);
  const result = report?.result?.detail as ExamResult | undefined;
  if (!report || !review || report.result?.status !== "complete" || !result) return { ok: false, error: "결과가 확정되지 않았습니다." };
  if (report.result.feedback?.status === "approved" && !opts.force) return { ok: false, error: "이미 승인된 피드백이 있습니다." };

  const mode = graderMode();
  if (mode === "none") return { ok: false, error: "ANTHROPIC_API_KEY 가 없어 피드백을 만들 수 없습니다. 직접 작성할 수 있습니다." };

  let content: { summary: string; actions: FeedbackAction[] };
  let model: string;
  if (mode === "fake") {
    content = fakeFeedback(result);
    model = "fake-feedback";
  } else {
    const essays = ESSAY_ITEMS.flatMap((e) => {
      const resp = review.responses.find((r) => r.item_id === e.id);
      const final = review.finals.find((f) => f.response_id === resp?.id);
      return final ? [{ itemId: e.id, criterionScores: final.criterion_scores, rubric: rubricFor(e.id) }] : [];
    });
    const res = await feedbackWithClaude(buildFeedbackPrompt(result, essays));
    content = normalizeFeedback(res.output);
    model = res.model;
  }

  await store.saveFeedback(attemptId, { status: "draft", ...content, model, generated_at: new Date().toISOString(), basis: basisOf(result) });
  return { ok: true };
}

/**
 * 결과가 (다시) 확정됐을 때 호출한다. 피드백이 없거나 초안이면 새로 만들고,
 * 이미 승인된 피드백은 점수가 바뀌었을 때 "다시 생성 필요" 표시만 한다.
 */
export async function onResultComplete(attemptId: string, result: ExamResult, existing: Feedback | null) {
  if (existing?.status === "approved") {
    if (!sameBasis(existing.basis, basisOf(result)) && !existing.stale) {
      await getStore().saveFeedback(attemptId, { ...existing, stale: true });
    }
    return;
  }
  if (existing && sameBasis(existing.basis, basisOf(result))) return;
  after(async () => {
    try {
      const r = await generateFeedback(attemptId);
      if (!r.ok) console.warn(`[feedback] ${attemptId}: ${r.error}`);
    } catch (e) {
      console.error(`[feedback] ${attemptId} 생성 실패:`, e);
    }
  });
}

export type SaveFeedbackResult = { ok: true } | { ok: false; error: string };

/** 담당자가 확인·수정한 피드백을 저장한다. approve 면 응시자 리포트에 공개된다. */
export async function saveReviewedFeedback(input: {
  attemptId: string;
  adminId: string;
  summary: string;
  actions: FeedbackAction[];
  approve: boolean;
}): Promise<SaveFeedbackResult> {
  const store = getStore();
  const report = await store.getReport(input.attemptId);
  const result = report?.result?.detail as ExamResult | undefined;
  if (!report || report.result?.status !== "complete" || !result) return { ok: false, error: "결과가 확정되지 않았습니다." };

  const summary = input.summary.trim();
  const actions = input.actions.map((a) => ({ ...a, title: a.title.trim(), detail: a.detail.trim() })).filter((a) => a.title && a.detail);
  if (!summary) return { ok: false, error: "요약을 입력해 주세요." };
  if (actions.length === 0) return { ok: false, error: "실천 제안을 하나 이상 입력해 주세요." };
  if (summary.length > 1000 || actions.some((a) => a.title.length > 100 || a.detail.length > 1000)) return { ok: false, error: "내용이 너무 깁니다." };

  const prev = report.result.feedback;
  const now = new Date().toISOString();
  await store.saveFeedback(input.attemptId, {
    status: input.approve ? "approved" : "draft",
    summary,
    actions,
    model: prev?.model ?? "manual",
    generated_at: prev?.generated_at ?? now,
    approved_by: input.approve ? input.adminId : null,
    approved_at: input.approve ? now : null,
    stale: false,
    basis: basisOf(result),
  });
  return { ok: true };
}
