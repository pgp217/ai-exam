// 개발용 메모리 저장소. Supabase 없이 응시 화면을 돌려 볼 때 쓴다 (서버 재시작 시 초기화).
// 데모 응시 링크: /t/demo, /t/demo2, /t/demo3 · 데모 관리자: memory-auth.ts 참고

import { ESSAY_ITEMS, ITEM_SET_VERSION } from "../exam/items";
import { mergeResponses } from "./responses";
import type {
  AiGradingRow, AttemptRow, CandidateInfo, ExamRow, ExamStore, FinalGradingRow, GradingStore, QueueRow, ResponseRow, ResultUpdate,
} from "./types";

interface Candidate extends CandidateInfo {
  id: string;
  exam_id: string;
  access_token: string;
}

type StoredResponse = ResponseRow & { id: string };

export interface MemoryDb {
  exams: ExamRow[];
  candidates: Candidate[];
  attempts: AttemptRow[];
  responses: Map<string, StoredResponse[]>; // attempt_id → 응답
  results: Map<string, Partial<ResultUpdate> & { knowledge_score: number; detail: unknown; status: "grading" | "complete" }>;
  reliability: Map<string, unknown>;
  aiGradings: AiGradingRow[];
  finals: FinalGradingRow[];
  admins: Map<string, { name: string }>; // user_id → 관리자
}

export const MEMORY_ADMIN_ID = "00000000-0000-4000-8000-00000000ad01";

/** 저장된 응답 위에 새 응답을 병합하고, 새로 생긴 응답에는 id 를 붙인다 */
function mergeStored(saved: StoredResponse[], incoming: ResponseRow[]): StoredResponse[] {
  const ids = new Map(saved.map((r) => [r.item_id, r.id]));
  return mergeResponses(saved, incoming).map((r) => ({ ...r, id: ids.get(r.item_id) ?? crypto.randomUUID() }));
}

export function demoDb(now = Date.now()): MemoryDb {
  const exam: ExamRow = {
    id: "demo-exam",
    title: "2026 하반기 신입사원 AI 역량 시험 (데모)",
    starts_at: new Date(now - 24 * 3600_000).toISOString(),
    ends_at: new Date(now + 30 * 24 * 3600_000).toISOString(),
    time_limit_min: 40,
    intro_text: "genai-book 교재 Ch 1~11 내용을 바탕으로 생성형 AI 활용 역량을 확인합니다.",
    show_result: true,
    item_set_version: ITEM_SET_VERSION,
    status: "open",
  };
  const names = ["김하늘", "이도윤", "박서연"];
  return {
    exams: [exam],
    candidates: ["demo", "demo2", "demo3"].map((t, i) => ({
      id: `demo-c${i + 1}`, exam_id: exam.id, name: names[i], access_token: t,
      employee_no: `D-00${i + 1}`, department: null, cohort: "2026-하반기",
    })),
    attempts: [],
    responses: new Map(),
    results: new Map(),
    reliability: new Map(),
    aiGradings: [],
    finals: [],
    admins: new Map([[MEMORY_ADMIN_ID, { name: "데모 관리자" }]]),
  };
}

export function createMemoryStore(db: MemoryDb = demoDb()): ExamStore & GradingStore & { db: MemoryDb } {
  const clone = structuredClone;
  const candidateOf = (a: AttemptRow) => db.candidates.find((c) => c.id === a.candidate_id)!;
  const info = (c: Candidate): CandidateInfo => ({ name: c.name, employee_no: c.employee_no, department: c.department, cohort: c.cohort });

  return {
    db,

    async findSession(token) {
      const c = db.candidates.find((x) => x.access_token === token);
      if (!c) return null;
      const exam = db.exams.find((e) => e.id === c.exam_id)!;
      const attempt = db.attempts.find((a) => a.candidate_id === c.id) ?? null;
      return {
        candidate: { id: c.id, name: c.name },
        exam: { ...exam },
        attempt: attempt && { ...attempt },
        responses: attempt ? (db.responses.get(attempt.id) ?? []).map((r) => ({ item_id: r.item_id, answer: clone(r.answer), response_ms: r.response_ms, pasted: r.pasted })) : [],
      };
    },

    async startAttempt(candidateId) {
      if (db.attempts.some((a) => a.candidate_id === candidateId)) return;
      db.attempts.push({
        id: crypto.randomUUID(),
        candidate_id: candidateId,
        started_at: new Date().toISOString(),
        submitted_at: null,
        duration_sec: null,
        status: "in_progress",
      });
    },

    async saveResponses(attemptId, responses) {
      const a = db.attempts.find((x) => x.id === attemptId);
      if (!a || a.status !== "in_progress") return false;
      db.responses.set(attemptId, mergeStored(db.responses.get(attemptId) ?? [], clone(responses)));
      return true;
    },

    async submitAttempt(input) {
      const a = db.attempts.find((x) => x.id === input.attemptId);
      if (!a || a.status !== "in_progress") return false;
      db.responses.set(a.id, mergeStored(db.responses.get(a.id) ?? [], clone(input.responses)));
      a.status = "submitted";
      a.submitted_at = new Date().toISOString();
      a.duration_sec = input.durationSec;
      db.reliability.set(a.id, input.reliability);
      db.results.set(a.id, { knowledge_score: input.knowledgeScore, detail: input.detail, status: "grading" });
      return true;
    },

    async isAdmin(userId) {
      return db.admins.get(userId) ?? null;
    },

    async listQueue() {
      return db.attempts
        .filter((a) => a.status !== "in_progress")
        .sort((x, y) => (y.submitted_at ?? "").localeCompare(x.submitted_at ?? ""))
        .map((a): QueueRow => {
          const c = candidateOf(a);
          const responses = db.responses.get(a.id) ?? [];
          const aiGradingsById: Record<string, Record<string, number>> = {};
          const essays = ESSAY_ITEMS.map((e) => {
            const resp = responses.find((r) => r.item_id === e.id);
            const ais = db.aiGradings.filter((g) => g.response_id === resp?.id).sort((x, y) => y.created_at.localeCompare(x.created_at));
            ais.forEach((g) => (aiGradingsById[g.id] = clone(g.criterion_scores)));
            const final = db.finals.find((f) => f.response_id === resp?.id);
            return {
              itemId: e.id,
              responseId: resp?.id ?? null,
              ai: ais[0] ? { id: ais[0].id, criterion_scores: clone(ais[0].criterion_scores), score: ais[0].score } : null,
              final: final ? { criterion_scores: clone(final.criterion_scores), score: final.score, ai_grading_id: final.ai_grading_id } : null,
            };
          });
          return {
            attemptId: a.id, status: a.status, submittedAt: a.submitted_at, reliability: clone(db.reliability.get(a.id) ?? null),
            candidate: info(c), examTitle: db.exams.find((e) => e.id === c.exam_id)!.title, essays, aiGradingsById,
          };
        });
    },

    async getReviewAttempt(attemptId) {
      const a = db.attempts.find((x) => x.id === attemptId);
      if (!a) return null;
      const c = candidateOf(a);
      const exam = db.exams.find((e) => e.id === c.exam_id)!;
      const responses = db.responses.get(a.id) ?? [];
      const ids = new Set(responses.map((r) => r.id));
      const result = db.results.get(a.id);
      return {
        attempt: { ...clone(a), reliability: clone(db.reliability.get(a.id) ?? null) },
        candidate: info(c),
        exam: { id: exam.id, title: exam.title },
        knowledgeScore: result?.knowledge_score ?? null,
        resultStatus: result?.status ?? null,
        responses: clone(responses),
        aiGradings: clone(db.aiGradings.filter((g) => ids.has(g.response_id))).sort((x, y) => y.created_at.localeCompare(x.created_at)),
        finals: clone(db.finals.filter((f) => ids.has(f.response_id))),
      };
    },

    async ensureResponses(attemptId, rows) {
      const saved = db.responses.get(attemptId) ?? [];
      const missing = rows.filter((r) => !saved.some((s) => s.item_id === r.item_id));
      if (missing.length > 0) db.responses.set(attemptId, mergeStored(saved, clone(missing)));
    },

    async insertAiGrading(row) {
      const { raw, ...rest } = clone(row);
      // 같은 밀리초에 여러 건이 들어와도 최신순 정렬이 흔들리지 않게 순번을 더한다
      const created = new Date(Date.now() + db.aiGradings.length).toISOString();
      const saved: AiGradingRow = { ...rest, reasons: raw.reasons, id: crypto.randomUUID(), created_at: created };
      db.aiGradings.push(saved);
      return clone(saved);
    },

    async upsertFinalGrading(row) {
      const next = { ...clone(row), confirmed_at: new Date().toISOString() };
      const i = db.finals.findIndex((f) => f.response_id === row.response_id);
      if (i >= 0) db.finals[i] = next;
      else db.finals.push(next);
    },

    async setAttemptStatus(attemptId, to, from) {
      const a = db.attempts.find((x) => x.id === attemptId);
      if (a && from.includes(a.status)) a.status = to;
    },

    async updateResults(attemptId, update) {
      const r = db.results.get(attemptId);
      if (r) db.results.set(attemptId, { ...r, ...clone(update) });
    },
  };
}
