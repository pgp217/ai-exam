// 응답 검증·병합과 제출 시 채점 (순수 함수). 정답 키는 호출하는 쪽(서버)에서 넘겨준다.

import { LIKERT_LABELS, type ItemSet } from "../exam/items";
import { assessReliability, type ReliabilityResult } from "../exam/reliability";
import { scoreAttempt, type ExamResult } from "../exam/scoring";
import type { ResponseRow } from "./types";

export const MAX_ESSAY_LENGTH = 4000;
const MAX_RESPONSE_MS = 4 * 60 * 60 * 1000;

export class InvalidResponseError extends Error {}

function fail(msg: string): never {
  throw new InvalidResponseError(msg);
}

/** 클라이언트가 보낸 응답 배열을 시험의 문항 세트 기준으로 검증해 ResponseRow[] 로 바꾼다. 형식이 틀리면 InvalidResponseError. */
export function parseResponses(input: unknown, set: ItemSet): ResponseRow[] {
  if (!Array.isArray(input)) fail("responses must be an array");
  if (input.length > set.all.length) fail("too many responses");

  const seen = new Set<string>();
  return input.map((raw): ResponseRow => {
    if (typeof raw !== "object" || raw === null) fail("response must be an object");
    const r = raw as Record<string, unknown>;

    const itemId = r.item_id;
    if (typeof itemId !== "string") fail("item_id must be a string");
    const item = set.all.find((i) => i.id === itemId) ?? fail(`unknown item ${itemId}`);
    if (seen.has(itemId)) fail(`duplicate item ${itemId}`);
    seen.add(itemId);

    const ms = r.response_ms ?? null;
    if (ms !== null && !(Number.isInteger(ms) && (ms as number) >= 0 && (ms as number) <= MAX_RESPONSE_MS)) {
      fail(`invalid response_ms for ${itemId}`);
    }

    const answer = r.answer as Record<string, unknown> | null | undefined;
    if (typeof answer !== "object" || answer === null) fail(`answer must be an object for ${itemId}`);

    if (item.type === "essay") {
      const text = answer.text;
      if (typeof text !== "string") fail(`answer.text must be a string for ${itemId}`);
      if (text.length > MAX_ESSAY_LENGTH) fail(`answer too long for ${itemId}`);
      return { item_id: itemId, answer: { text }, response_ms: ms as number | null, pasted: r.pasted === true };
    }

    const max = item.type === "choice" ? item.options.length : LIKERT_LABELS.length;
    const value = answer.value;
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
      fail(`answer.value must be 1..${max} for ${itemId}`);
    }
    // 붙여넣기는 서술형에서만 의미가 있다
    return { item_id: itemId, answer: { value: value as number }, response_ms: ms as number | null, pasted: false };
  });
}

/** 저장된 응답 위에 새 응답을 덮어쓴다. 붙여넣기 기록은 한 번 생기면 유지한다. */
export function mergeResponses(saved: ResponseRow[], incoming: ResponseRow[], set: ItemSet): ResponseRow[] {
  const byId = new Map(saved.map((r) => [r.item_id, r]));
  for (const r of incoming) {
    const prev = byId.get(r.item_id);
    byId.set(r.item_id, { ...r, pasted: r.pasted || (prev?.pasted ?? false) });
  }
  return set.all.filter((i) => byId.has(i.id)).map((i) => byId.get(i.id)!);
}

export interface SubmissionScore {
  knowledge: number;
  detail: ExamResult; // 서술형 확정 전이라 status: "grading"
  reliability: ReliabilityResult;
}

/**
 * 객관식 자동 채점과 응답 신뢰도 판정. 제출 시점에는 서술형 점수가 없고(essayScores 생략),
 * 담당자가 서술형을 확정하면 확정 점수를 넣어 다시 계산한다.
 */
export function scoreSubmission(
  responses: ResponseRow[],
  set: ItemSet,
  answerKey: Record<string, number>,
  essayScores: Record<string, number | null> = {},
): SubmissionScore {
  const value = (id: string) => {
    const a = responses.find((r) => r.item_id === id)?.answer;
    return a && "value" in a ? a.value : null;
  };
  const row = (id: string) => responses.find((r) => r.item_id === id);

  const choiceIds = set.choice.map((i) => i.id);
  const selfIds = set.self.map((i) => i.id);
  const essayIds = set.essay.map((i) => i.id);

  const choice = Object.fromEntries(choiceIds.map((id) => [id, value(id)]));
  const self = Object.fromEntries(selfIds.map((id) => [id, value(id)]));

  const detail = scoreAttempt(
    { choice, self, essay: Object.fromEntries(essayIds.map((id) => [id, essayScores[id] ?? null])) },
    set,
    answerKey,
  );

  const reliability = assessReliability({
    choice,
    choiceMs: Object.fromEntries(choiceIds.map((id) => [id, row(id)?.response_ms ?? null])),
    self,
    essayText: Object.fromEntries(
      essayIds.map((id) => {
        const a = row(id)?.answer;
        return [id, a && "text" in a ? a.text : null];
      }),
    ),
    essayPasted: Object.fromEntries(essayIds.map((id) => [id, row(id)?.pasted ?? false])),
  }, set);

  return { knowledge: detail.knowledge, detail, reliability };
}

/** 응답이 없는 서술형 문항에 빈 답안 행을 만든다 (빈 답안도 채점·확정 대상) */
export function missingEssayRows(responses: Pick<ResponseRow, "item_id">[], set: ItemSet): ResponseRow[] {
  return set.essay.filter((i) => !responses.some((r) => r.item_id === i.id)).map((i) => ({
    item_id: i.id,
    answer: { text: "" },
    response_ms: null,
    pasted: false,
  }));
}
