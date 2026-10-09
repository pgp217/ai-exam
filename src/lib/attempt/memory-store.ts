// 개발용 메모리 저장소. Supabase 없이 응시 화면을 돌려 볼 때 쓴다 (서버 재시작 시 초기화).
// 데모 응시 링크: /t/demo, /t/demo2, /t/demo3 · 데모 관리자: memory-auth.ts 참고

import { ANSWER_KEY, RUBRICS } from "../exam/answer-key.data";
import { ESSAY_ITEMS, ITEM_SET_VERSION } from "../exam/items";
import { simulateCohort } from "../exam/simulate";
import { mergeResponses, scoreSubmission } from "./responses";
import type {
  AdminCandidate, AiGradingRow, AttemptRow, CandidateInfo, CohortMember, ExamAdminStore, ExamRow, ExamStore, ExamSummary, Feedback,
  FinalGradingRow, GradingStore, NoticeTemplate, QueueRow, ReportStore, ResponseRow, ResultRow, ResultUpdate, RetakeRecord, SurveyRow,
} from "./types";
import type { Survey } from "../survey/survey";

interface Candidate extends CandidateInfo {
  id: string;
  exam_id: string;
  access_token: string;
  email?: string | null;
  phone?: string | null;
  joined_at?: string | null;
  invited_at?: string | null;
  retake_until?: string | null;
}

/** 재응시로 보관한 이전 응시 (Supabase 의 attempt_archives 와 같은 내용) */
interface Archive extends RetakeRecord {
  candidate_id: string;
  attempt_id: string;
  archived_by: string | null;
  snapshot: { attempt: AttemptRow; result: unknown; survey?: unknown; responses: (StoredResponse & { ai_gradings?: AiGradingRow[]; final_grading?: FinalGradingRow | null })[] };
}

type StoredResponse = ResponseRow & { id: string };

export interface MemoryDb {
  exams: ExamRow[];
  candidates: Candidate[];
  attempts: AttemptRow[];
  responses: Map<string, StoredResponse[]>; // attempt_id → 응답
  results: Map<string, Partial<ResultUpdate> & { knowledge_score: number; detail: unknown; status: "grading" | "complete"; feedback?: Feedback | null }>;
  reliability: Map<string, unknown>;
  aiGradings: AiGradingRow[];
  finals: FinalGradingRow[];
  admins: Map<string, { name: string }>; // user_id → 관리자
  notices: Map<string, NoticeTemplate[]>; // exam_id → 안내문
  archives: Archive[];
  surveys: Map<string, Survey & { created_at: string }>; // attempt_id → 설문
}

export const MEMORY_ADMIN_ID = "00000000-0000-4000-8000-00000000ad01";

/** 저장된 응답 위에 새 응답을 병합하고, 새로 생긴 응답에는 id 를 붙인다 */
function mergeStored(saved: StoredResponse[], incoming: ResponseRow[]): StoredResponse[] {
  const ids = new Map(saved.map((r) => [r.item_id, r.id]));
  return mergeResponses(saved, incoming).map((r) => ({ ...r, id: ids.get(r.item_id) ?? crypto.randomUUID() }));
}

/** simulated: 동기 분포를 보여 주기 위한 가상 응시자 수 (채점까지 끝난 상태로 만든다) */
export function demoDb(now = Date.now(), opts: { simulated?: number } = {}): MemoryDb {
  const exam: ExamRow = {
    id: "demo-exam",
    title: "2026 하반기 신입사원 AI 역량 시험 (데모)",
    starts_at: new Date(now - 24 * 3600_000).toISOString(),
    ends_at: new Date(now + 30 * 24 * 3600_000).toISOString(),
    time_limit_min: 40,
    intro_text: "생성형 AI 활용 교재 Ch 1~11 내용을 바탕으로 생성형 AI 활용 역량을 확인합니다.",
    show_result: true,
    collect_survey: true,
    item_set_version: ITEM_SET_VERSION,
    status: "open",
  };
  const names = ["김하늘", "이도윤", "박서연"];
  const db: MemoryDb = {
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
    notices: new Map(),
    archives: [],
    surveys: new Map(),
  };
  if (opts.simulated) addSimulated(db, exam, opts.simulated, now);
  return db;
}

function addSimulated(db: MemoryDb, exam: ExamRow, n: number, now: number) {
  simulateCohort(n, ANSWER_KEY, RUBRICS).forEach((sim, i) => {
    const candidateId = `sim-c${i + 1}`;
    const attemptId = `sim-a${i + 1}`;
    const submitted = new Date(now - (n - i) * 3600_000);
    db.candidates.push({ id: candidateId, exam_id: exam.id, name: sim.name, access_token: `sim-${i + 1}`, employee_no: sim.employee_no, department: sim.department, cohort: "2026-하반기" });
    db.attempts.push({
      id: attemptId, candidate_id: candidateId, status: "complete", duration_sec: sim.durationSec,
      started_at: new Date(submitted.getTime() - sim.durationSec * 1000).toISOString(), submitted_at: submitted.toISOString(),
    });
    const responses = sim.responses.map((r) => ({ ...r, id: crypto.randomUUID() }));
    db.responses.set(attemptId, responses);
    const { detail, reliability } = scoreSubmission(sim.responses, ANSWER_KEY, sim.essayScores);
    db.reliability.set(attemptId, reliability);
    for (const e of ESSAY_ITEMS) {
      const resp = responses.find((r) => r.item_id === e.id)!;
      db.finals.push({ response_id: resp.id, ai_grading_id: null, grader_id: MEMORY_ADMIN_ID, criterion_scores: sim.essayCriteria[e.id], score: sim.essayScores[e.id], override_reason: null, confirmed_at: submitted.toISOString() });
    }
    db.results.set(attemptId, {
      knowledge_score: detail.knowledge, practice_score: detail.practice, total: detail.total, grade: detail.grade,
      ai_type: detail.aiType?.name ?? null, detail, status: "complete", feedback: null,
    });
  });
}

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export function createMemoryStore(db: MemoryDb = demoDb()): ExamStore & GradingStore & ReportStore & ExamAdminStore & { db: MemoryDb } {
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
        candidate: { id: c.id, name: c.name, retake_until: c.retake_until ?? null },
        exam: { ...exam },
        attempt: attempt && { ...attempt },
        responses: attempt ? (db.responses.get(attempt.id) ?? []).map((r) => ({ item_id: r.item_id, answer: clone(r.answer), response_ms: r.response_ms, pasted: r.pasted })) : [],
        surveyDone: !!attempt && db.surveys.has(attempt.id),
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

    async saveSurvey(attemptId, survey) {
      if (db.surveys.has(attemptId) || !db.attempts.some((a) => a.id === attemptId)) return false;
      db.surveys.set(attemptId, { ...clone(survey), created_at: new Date(Date.now() + db.surveys.size).toISOString() });
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

    async getReport(attemptId) {
      const a = db.attempts.find((x) => x.id === attemptId);
      if (!a) return null;
      const c = candidateOf(a);
      const exam = db.exams.find((e) => e.id === c.exam_id)!;
      const r = db.results.get(a.id);
      return {
        attemptId: a.id, status: a.status, submittedAt: a.submitted_at, durationSec: a.duration_sec, reliability: clone(db.reliability.get(a.id) ?? null),
        candidate: info(c), exam: { id: exam.id, title: exam.title, show_result: exam.show_result },
        result: r ? { status: r.status, detail: clone(r.detail), feedback: clone(r.feedback ?? null) } : null,
      };
    },

    async getCohort(examId) {
      return db.attempts.flatMap((a): CohortMember[] => {
        const r = db.results.get(a.id);
        if (!r || r.status !== "complete" || candidateOf(a).exam_id !== examId) return [];
        const tops = (r.detail as { tops: { id: string; score: number | null }[] }).tops;
        return [{
          attemptId: a.id, total: r.total!, knowledge: r.knowledge_score, practice: r.practice_score!,
          tops: Object.fromEntries(tops.filter((t) => t.score != null).map((t) => [t.id, t.score as number])),
        }];
      });
    },

    async listResults() {
      return [...db.candidates].sort((x, y) => x.employee_no.localeCompare(y.employee_no)).map((c): ResultRow => {
        const a = db.attempts.find((x) => x.candidate_id === c.id);
        const r = a ? db.results.get(a.id) : undefined;
        return {
          candidateId: c.id, candidate: info(c), exam: { id: c.exam_id, title: db.exams.find((e) => e.id === c.exam_id)!.title },
          attempt: a ? { id: a.id, status: a.status, submittedAt: a.submitted_at, reliability: clone(db.reliability.get(a.id) ?? null) } : null,
          result: r
            ? { status: r.status, total: r.total ?? null, grade: r.grade ?? null, aiType: r.ai_type ?? null, knowledge: r.knowledge_score, practice: r.practice_score ?? null, feedbackStatus: r.feedback?.status ?? null }
            : null,
        };
      });
    },

    async listExams() {
      return db.exams.map((e) => ({ id: e.id, title: e.title }));
    },

    async saveFeedback(attemptId, feedback) {
      const r = db.results.get(attemptId);
      if (r) r.feedback = clone(feedback);
    },

    async listSurveys(examId) {
      return [...db.surveys.entries()]
        .flatMap(([attemptId, s]): SurveyRow[] => {
          const a = db.attempts.find((x) => x.id === attemptId);
          if (!a) return [];
          const c = candidateOf(a);
          if (examId && c.exam_id !== examId) return [];
          const exam = db.exams.find((e) => e.id === c.exam_id)!;
          return [{ ...clone(s), attemptId, candidate: info(c), exam: { id: exam.id, title: exam.title } }];
        })
        .sort((x, y) => y.created_at.localeCompare(x.created_at));
    },

    async listExamSummaries() {
      return [...db.exams].reverse().map((e): ExamSummary => {
        const cands = db.candidates.filter((c) => c.exam_id === e.id);
        const statuses = cands.map((c) => db.attempts.find((a) => a.candidate_id === c.id)?.status).filter(Boolean);
        return {
          ...clone(e), candidates: cands.length, started: statuses.length,
          submitted: statuses.filter((st) => st !== "in_progress").length, complete: statuses.filter((st) => st === "complete").length,
        };
      });
    },

    async getExam(examId) {
      const e = db.exams.find((x) => x.id === examId);
      return e ? clone(e) : null;
    },

    async createExam(input) {
      const id = crypto.randomUUID();
      db.exams.push({ id, ...clone(input), status: "draft" });
      return id;
    },

    async updateExam(examId, patch) {
      const e = db.exams.find((x) => x.id === examId);
      if (e) Object.assign(e, clone(patch));
    },

    async listCandidates(examId) {
      return db.candidates
        .filter((c) => c.exam_id === examId)
        .sort((x, y) => x.employee_no.localeCompare(y.employee_no))
        .map((c): AdminCandidate => ({
          id: c.id, employee_no: c.employee_no, name: c.name, email: c.email ?? null, phone: c.phone ?? null,
          department: c.department, cohort: c.cohort, joined_at: c.joined_at ?? null, access_token: c.access_token,
          invited_at: c.invited_at ?? null, attemptStatus: db.attempts.find((a) => a.candidate_id === c.id)?.status ?? null,
          retake_until: c.retake_until ?? null,
          retakes: db.archives
            .filter((x) => x.candidate_id === c.id)
            .sort((x, y) => y.archived_at.localeCompare(x.archived_at))
            .map((x) => ({ id: x.id, status: x.status, grade: x.grade, reason: x.reason, archived_at: x.archived_at, scores_cleared_at: x.scores_cleared_at })),
        }));
    },

    async upsertCandidates(examId, rows) {
      let inserted = 0;
      let updated = 0;
      for (const r of rows) {
        const existing = db.candidates.find((c) => c.exam_id === examId && c.employee_no === r.employee_no);
        if (existing) {
          Object.assign(existing, clone(r));
          updated++;
        } else {
          db.candidates.push({ id: crypto.randomUUID(), exam_id: examId, access_token: newToken(), ...clone(r) });
          inserted++;
        }
      }
      return { inserted, updated };
    },

    async deleteCandidate(examId, candidateId) {
      const i = db.candidates.findIndex((c) => c.id === candidateId && c.exam_id === examId);
      if (i < 0 || db.attempts.some((a) => a.candidate_id === candidateId)) return false;
      db.candidates.splice(i, 1);
      return true;
    },

    async resetAttempt(examId, candidateId, input) {
      const c = db.candidates.find((x) => x.id === candidateId && x.exam_id === examId);
      const a = c && db.attempts.find((x) => x.candidate_id === c.id);
      if (!c || !a) return false;
      const responses = db.responses.get(a.id) ?? [];
      const result = db.results.get(a.id);
      db.archives.push({
        id: crypto.randomUUID(), candidate_id: c.id, attempt_id: a.id, status: a.status, grade: result?.grade ?? null,
        reason: input.reason.trim(), archived_by: input.adminId, archived_at: new Date(Date.now() + db.archives.length).toISOString(), scores_cleared_at: null,
        snapshot: clone({
          attempt: a,
          result: result ?? null,
          responses: responses.map((r) => ({
            ...r,
            ai_gradings: db.aiGradings.filter((g) => g.response_id === r.id),
            final_grading: db.finals.find((f) => f.response_id === r.id) ?? null,
          })),
          survey: db.surveys.get(a.id) ?? null,
        }),
      });
      const ids = new Set(responses.map((r) => r.id));
      db.attempts = db.attempts.filter((x) => x.id !== a.id);
      db.responses.delete(a.id);
      db.results.delete(a.id);
      db.reliability.delete(a.id);
      db.surveys.delete(a.id);
      db.aiGradings = db.aiGradings.filter((g) => !ids.has(g.response_id));
      db.finals = db.finals.filter((f) => !ids.has(f.response_id));
      c.retake_until = input.retakeUntil;
      return true;
    },

    async clearArchiveScores(examId, candidateId, archiveId) {
      const c = db.candidates.find((x) => x.id === candidateId && x.exam_id === examId);
      const x = c && db.archives.find((r) => r.id === archiveId && r.candidate_id === c.id);
      if (!x || x.scores_cleared_at) return false;
      x.snapshot.result = null;
      for (const r of x.snapshot.responses) {
        delete r.ai_gradings;
        delete r.final_grading;
      }
      x.grade = null;
      x.scores_cleared_at = new Date().toISOString();
      return true;
    },

    async getNotices(examId) {
      return clone(db.notices.get(examId) ?? []);
    },

    async saveNotice(examId, notice) {
      const list = (db.notices.get(examId) ?? []).filter((n) => n.channel !== notice.channel);
      db.notices.set(examId, [...list, { ...clone(notice), updated_at: new Date().toISOString() }]);
    },
  };
}
