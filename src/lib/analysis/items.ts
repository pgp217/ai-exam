// 문항 분석 (순수 함수): 객관식 정답률·변별도·보기 분포, 신뢰도(KR-20), 자기평가 분포와 과대·과소평가, 서술형 기준별 평균·AI 일치율.
import { MID_FACTORS, type MidFactorId } from "../exam/factors";
import type { ItemSet } from "../exam/items";
import type { Rubric } from "../exam/answer-key.data";
import type { ExamResult } from "../exam/scoring";
import type { Answer } from "../attempt/types";

/** 제출한 응시 1건 (응시 중은 넣지 않는다) */
export interface AnalysisAttempt {
  attemptId: string;
  employee_no: string;
  responses: { item_id: string; answer: Answer }[];
  /** 서술형 문항 → 담당자 확정 기준 점수와 가장 최근 AI 기준 점수 */
  essays: Record<string, { final: Record<string, number> | null; ai: Record<string, number> | null }>;
  /** 결과 계산 내용. 채점 완료면 status "complete" */
  detail: ExamResult | null;
}

/** 이 인원 미만이면 통계가 크게 흔들리므로 참고용으로 표시한다 */
export const MIN_RELIABLE_N = 10;

export type ItemFlag = "easy" | "hard" | "low-disc" | "negative-disc" | "unused-option";

export const FLAG_LABELS: Record<ItemFlag, string> = {
  easy: "너무 쉬움 (정답률 90% 이상)",
  hard: "너무 어려움 (정답률 20% 이하)",
  "low-disc": "변별도 낮음",
  "negative-disc": "잘하는 사람이 더 틀림",
  "unused-option": "아무도 고르지 않은 보기",
};

export interface ChoiceStat {
  itemId: string;
  mid: MidFactorId;
  n: number;
  correct: number; // 정답 번호 (1~4)
  p: number; // 정답률 0~1
  /** 상·하위 27% 집단 정답률 차이 (-1~1) */
  d: number;
  /** 문항 점수와 나머지 객관식 점수의 상관 (교정 점이연 상관) */
  r: number | null;
  options: number[]; // 보기 1~4 선택 수
  blank: number;
  flags: ItemFlag[];
}

export interface SelfStat {
  itemId: string;
  mid: MidFactorId;
  midName: string;
  n: number;
  mean: number | null;
  counts: number[]; // 1~5
  /** 채점 완료자의 자기평가 환산 점수와 실제 요인 점수 평균, 차이(자기평가 - 실제) */
  selfScore: number | null;
  actual: number | null;
  gap: number | null;
}

export interface CriterionStat {
  key: string;
  name: string;
  n: number;
  mean: number | null; // 확정 점수 평균 1~4
  aiMean: number | null;
  agreement: number | null; // AI 와 확정 점수가 같은 비율 0~1
  pairs: number;
}

export interface ItemAnalysis {
  n: number;
  complete: number;
  knowledge: { mean: number | null; sd: number | null; min: number | null; max: number | null };
  /** 객관식 24문항 내적 신뢰도 (KR-20). 0.7 이상이면 양호 */
  kr20: number | null;
  choice: ChoiceStat[];
  self: SelfStat[];
  essay: { itemId: string; criteria: CriterionStat[] }[];
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function sd(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

function corr(xs: number[], ys: number[]): number | null {
  const mx = mean(xs);
  const my = mean(ys);
  if (mx == null || my == null) return null;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  });
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

const valueOf = (a: AnalysisAttempt, itemId: string) => {
  const ans = a.responses.find((r) => r.item_id === itemId)?.answer;
  return ans && "value" in ans ? ans.value : null;
};

export function analyzeItems(attempts: AnalysisAttempt[], set: ItemSet, answerKey: Record<string, number>, rubrics: Rubric[]): ItemAnalysis {
  const { choice: CHOICE_ITEMS, self: SELF_ITEMS, essay: ESSAY_ITEMS } = set;
  const n = attempts.length;
  // 응시자 × 객관식 정오 (무응답은 오답)
  const matrix = attempts.map((a) => CHOICE_ITEMS.map((it) => (valueOf(a, it.id) === answerKey[it.id] ? 1 : 0)));
  const totals = matrix.map((row) => row.reduce((s: number, v) => s + v, 0));
  const k = CHOICE_ITEMS.length;

  // 상·하위 27% 집단 (총점 순, 동점은 입력 순서)
  const order = totals.map((t, i) => [t, i] as const).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
  const g = Math.max(1, Math.round(n * 0.27));
  const upper = order.slice(0, g);
  const lower = order.slice(-g);

  const choice: ChoiceStat[] = CHOICE_ITEMS.map((it, j) => {
    const col = matrix.map((row) => row[j]);
    const correct = col.reduce((s: number, v) => s + v, 0);
    const p = n ? correct / n : 0;
    const pu = mean(upper.map((i) => col[i])) ?? 0;
    const pl = mean(lower.map((i) => col[i])) ?? 0;
    const d = n >= 2 ? pu - pl : 0;
    const r = n >= 3 ? corr(col, totals.map((t, i) => t - col[i])) : null;
    const options = [1, 2, 3, 4].map((o) => attempts.filter((a) => valueOf(a, it.id) === o).length);
    const blank = n - options.reduce((s, v) => s + v, 0);
    const flags: ItemFlag[] = [];
    if (n > 0 && p >= 0.9) flags.push("easy");
    if (n > 0 && p <= 0.2) flags.push("hard");
    if (r != null && r < 0) flags.push("negative-disc");
    else if (r != null && r < 0.2) flags.push("low-disc");
    if (n > 0 && options.some((c, o) => c === 0 && o + 1 !== answerKey[it.id])) flags.push("unused-option");
    return { itemId: it.id, mid: it.mid, n, correct: answerKey[it.id], p: round(p), d: round(d), r: r == null ? null : round(r), options, blank, flags };
  });

  // KR-20 = k/(k-1) × (1 - Σ p(1-p) / 총점 분산)
  const avgTotal = n ? totals.reduce((x, y) => x + y, 0) / n : 0;
  const variance = n ? totals.reduce((acc, t) => acc + (t - avgTotal) ** 2, 0) / n : 0;
  let pq = 0;
  for (let j = 0; j < k; j++) {
    const pj = n ? matrix.reduce((x, row) => x + row[j], 0) / n : 0;
    pq += pj * (1 - pj);
  }
  const kr20 = n >= 2 && variance > 0 ? round((k / (k - 1)) * (1 - pq / variance)) : null;

  const knowledgeScores = attempts.map((a, i) => a.detail?.knowledge ?? round((totals[i] / k) * 100, 1));
  const complete = attempts.filter((a) => a.detail?.status === "complete");

  const self: SelfStat[] = SELF_ITEMS.map((it) => {
    const vals = attempts.map((a) => valueOf(a, it.id)).filter((v): v is number => typeof v === "number");
    const mids = complete.map((a) => a.detail!.mids.find((m) => m.id === it.mid)).filter((m) => m && m.selfScore != null && m.score != null);
    const s = mean(mids.map((m) => m!.selfScore!));
    const act = mean(mids.map((m) => m!.score!));
    return {
      itemId: it.id, mid: it.mid, midName: MID_FACTORS.find((m) => m.id === it.mid)!.name, n: vals.length,
      mean: vals.length ? round(mean(vals)!, 1) : null,
      counts: [1, 2, 3, 4, 5].map((v) => vals.filter((x) => x === v).length),
      selfScore: s == null ? null : round(s, 1), actual: act == null ? null : round(act, 1), gap: s == null || act == null ? null : round(s - act, 1),
    };
  });

  const essay = ESSAY_ITEMS.map((it) => {
    const rubric = rubrics.find((r) => r.itemId === it.id)!;
    return {
      itemId: it.id,
      criteria: rubric.criteria.map((c): CriterionStat => {
        const finals = attempts.map((a) => a.essays[it.id]?.final?.[c.key]).filter((v): v is number => typeof v === "number");
        const ais = attempts.map((a) => a.essays[it.id]?.ai?.[c.key]).filter((v): v is number => typeof v === "number");
        const pairs = attempts.flatMap((a) => {
          const e = a.essays[it.id];
          const f = e?.final?.[c.key];
          const ai = e?.ai?.[c.key];
          return typeof f === "number" && typeof ai === "number" ? [f === ai ? 1 : 0] : [];
        });
        return {
          key: c.key, name: c.name, n: finals.length,
          mean: finals.length ? round(mean(finals)!, 1) : null,
          aiMean: ais.length ? round(mean(ais)!, 1) : null,
          agreement: pairs.length ? round(mean(pairs)!) : null,
          pairs: pairs.length,
        };
      }),
    };
  });

  return {
    n,
    complete: complete.length,
    knowledge: {
      mean: n ? round(mean(knowledgeScores)!, 1) : null,
      sd: sd(knowledgeScores) == null ? null : round(sd(knowledgeScores)!, 1),
      min: n ? Math.min(...knowledgeScores) : null,
      max: n ? Math.max(...knowledgeScores) : null,
    },
    kr20,
    choice,
    self,
    essay,
  };
}
