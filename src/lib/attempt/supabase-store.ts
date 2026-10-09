// Supabase(PostgREST) 저장소. 서버 전용 키로 RLS 를 우회해 접근하므로 서버에서만 쓴다.
// 관리자 기능은 이 저장소를 쓰기 전에 서버 코드에서 관리자 여부를 반드시 확인한다.
import "server-only";

import { ESSAY_ITEMS } from "../exam/items";
import type {
  AdminCandidate, AiGradingRow, AttemptRow, CandidateInfo, CohortMember, ExamAdminStore, ExamRow, ExamStore, ExamSummary, Feedback,
  FinalGradingRow, GradingStore, NoticeTemplate, QueueRow, ReportData, ReportStore, ResponseRow, ResultRow, ReviewAttempt, Session, SubmitInput, SurveyRow,
} from "./types";
import type { AnalysisAttempt } from "../analysis/items";
import type { ExamResult } from "../exam/scoring";

const REQUEST_TIMEOUT_MS = 15_000;
const ESSAY_FILTER = `in.(${ESSAY_ITEMS.map((e) => e.id).join(",")})`;

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

type AiRowRaw = Omit<AiGradingRow, "reasons"> & { raw?: { reasons?: Record<string, string> } | null };

function toAiRow(r: AiRowRaw): AiGradingRow {
  const { raw, ...rest } = r;
  return { ...rest, score: Number(rest.score), reasons: raw?.reasons ?? {} };
}

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const EXAM_COLUMNS = "id,title,starts_at,ends_at,time_limit_min,intro_text,show_result,collect_survey,item_set_version,status";
const UPSERT_CHUNK = 500;

export function createSupabaseStore(url: string, key: string): ExamStore & GradingStore & ReportStore & ExamAdminStore {
  const base = url.replace(/\/+$/, "") + "/rest/v1";
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json", Accept: "application/json" };
  // 레거시 service_role 키(JWT)는 Authorization 에도 넣는다. 새 Secret key(sb_secret_...)는 apikey 만 쓴다.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  async function rest<T>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
    const res = await fetch(base + path, {
      method: init.method ?? "GET",
      headers: init.prefer ? { ...headers, Prefer: init.prefer } : headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      // signal 을 넘기면 Next.js 가 렌더링 중 같은 GET 요청을 메모이즈하지 않는다 (쓰기 직후 다시 읽어도 최신 값)
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new SupabaseError(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${data?.message ?? text}`, res.status, data?.code);
    }
    return data as T;
  }

  type AttemptJoin = AttemptRow & { responses: ResponseRow[]; survey: { attempt_id: string } | { attempt_id: string }[] | null };
  type CandidateJoin = {
    id: string;
    name: string;
    retake_until: string | null;
    exam: ExamRow;
    // attempts.candidate_id 가 unique 라 PostgREST 는 객체로 돌려주지만, 배열이어도 처리한다
    attempt: AttemptJoin | AttemptJoin[] | null;
  };

  const CANDIDATE_INFO = "name,employee_no,department,cohort";

  return {
    // ── 응시 ─────────────────────────────────────────
    async findSession(token) {
      const select = [
        "id,name,retake_until",
        `exam:exams(${EXAM_COLUMNS})`,
        "attempt:attempts(id,candidate_id,started_at,submitted_at,duration_sec,status,responses(item_id,answer,response_ms,pasted),survey:attempt_surveys(attempt_id))",
      ].join(",");
      const rows = await rest<CandidateJoin[]>(`/candidates?access_token=eq.${encodeURIComponent(token)}&select=${select}`);
      const c = rows[0];
      if (!c) return null;
      const a = one(c.attempt);
      const session: Session = {
        candidate: { id: c.id, name: c.name, retake_until: c.retake_until },
        exam: c.exam,
        attempt: a ? { id: a.id, candidate_id: a.candidate_id, started_at: a.started_at, submitted_at: a.submitted_at, duration_sec: a.duration_sec, status: a.status } : null,
        responses: a?.responses ?? [],
        surveyDone: !!one(a?.survey),
      };
      return session;
    },

    async startAttempt(candidateId) {
      await rest("/attempts?on_conflict=candidate_id", {
        method: "POST",
        body: { candidate_id: candidateId },
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    },

    async saveResponses(attemptId, responses) {
      return rest<boolean>("/rpc/save_responses", {
        method: "POST",
        body: { p_attempt_id: attemptId, p_responses: responses },
      });
    },

    async submitAttempt(input: SubmitInput) {
      return rest<boolean>("/rpc/submit_attempt", {
        method: "POST",
        body: {
          p_attempt_id: input.attemptId,
          p_responses: input.responses,
          p_duration_sec: input.durationSec,
          p_reliability: input.reliability,
          p_knowledge_score: input.knowledgeScore,
          p_detail: input.detail,
        },
      });
    },

    async saveSurvey(attemptId, survey) {
      const rows = await rest<unknown[]>("/attempt_surveys?on_conflict=attempt_id", {
        method: "POST",
        body: { attempt_id: attemptId, ...survey },
        prefer: "resolution=ignore-duplicates,return=representation",
      });
      return rows.length > 0;
    },

    // ── 채점 ─────────────────────────────────────────
    async isAdmin(userId) {
      const rows = await rest<{ name: string }[]>(`/admins?user_id=eq.${encodeURIComponent(userId)}&select=name`);
      return rows[0] ?? null;
    },

    async listQueue() {
      type Row = {
        id: string;
        status: AttemptRow["status"];
        submitted_at: string | null;
        reliability: unknown;
        candidate: CandidateInfo & { exam: { title: string } };
        responses: {
          id: string;
          item_id: string;
          ai_gradings: { id: string; criterion_scores: Record<string, number>; score: number; created_at: string }[];
          final_gradings: Pick<FinalGradingRow, "criterion_scores" | "score" | "ai_grading_id"> | Pick<FinalGradingRow, "criterion_scores" | "score" | "ai_grading_id">[] | null;
        }[];
      };
      const select = [
        "id,status,submitted_at,reliability",
        `candidate:candidates(${CANDIDATE_INFO},exam:exams(title))`,
        "responses(id,item_id,ai_gradings(id,criterion_scores,score,created_at),final_gradings(criterion_scores,score,ai_grading_id))",
      ].join(",");
      const rows = await rest<Row[]>(
        `/attempts?status=neq.in_progress&select=${select}&responses.item_id=${ESSAY_FILTER}&order=submitted_at.desc`,
      );
      return rows.map((r): QueueRow => {
        const aiGradingsById: Record<string, Record<string, number>> = {};
        const essays = ESSAY_ITEMS.map((e) => {
          const resp = r.responses.find((x) => x.item_id === e.id);
          const ais = [...(resp?.ai_gradings ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
          ais.forEach((g) => (aiGradingsById[g.id] = g.criterion_scores));
          const latest = ais[0];
          const final = one(resp?.final_gradings);
          return {
            itemId: e.id,
            responseId: resp?.id ?? null,
            ai: latest ? { id: latest.id, criterion_scores: latest.criterion_scores, score: Number(latest.score) } : null,
            final: final ? { ...final, score: Number(final.score) } : null,
          };
        });
        const { exam, ...candidate } = r.candidate;
        return { attemptId: r.id, status: r.status, submittedAt: r.submitted_at, reliability: r.reliability, candidate, examTitle: exam.title, essays, aiGradingsById };
      });
    },

    async getReviewAttempt(attemptId) {
      type Row = AttemptRow & {
        reliability: unknown;
        candidate: CandidateInfo & { exam: { id: string; title: string } };
        result: { knowledge_score: number; status: "grading" | "complete" } | { knowledge_score: number; status: "grading" | "complete" }[] | null;
        responses: (ResponseRow & {
          id: string;
          ai_gradings: AiRowRaw[];
          final_gradings: FinalGradingRow | FinalGradingRow[] | null;
        })[];
      };
      const select = [
        "id,candidate_id,started_at,submitted_at,duration_sec,status,reliability",
        `candidate:candidates(${CANDIDATE_INFO},exam:exams(id,title))`,
        "result:results(knowledge_score,status)",
        "responses(id,item_id,answer,response_ms,pasted,ai_gradings(id,response_id,model,prompt_version,criterion_scores,score,rationale,evidence,raw,created_at),final_gradings(*))",
      ].join(",");
      const rows = await rest<Row[]>(`/attempts?id=eq.${encodeURIComponent(attemptId)}&select=${select}`);
      const r = rows[0];
      if (!r) return null;
      const { exam, ...candidate } = r.candidate;
      const result = one(r.result);
      const review: ReviewAttempt = {
        attempt: { id: r.id, candidate_id: r.candidate_id, started_at: r.started_at, submitted_at: r.submitted_at, duration_sec: r.duration_sec, status: r.status, reliability: r.reliability },
        candidate,
        exam,
        knowledgeScore: result ? Number(result.knowledge_score) : null,
        resultStatus: result?.status ?? null,
        responses: r.responses.map((x) => ({ id: x.id, item_id: x.item_id, answer: x.answer, response_ms: x.response_ms, pasted: x.pasted })),
        aiGradings: r.responses.flatMap((x) => x.ai_gradings.map(toAiRow)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
        finals: r.responses.flatMap((x) => {
          const f = one(x.final_gradings);
          return f ? [{ ...f, score: Number(f.score) }] : [];
        }),
      };
      return review;
    },

    async ensureResponses(attemptId, rows) {
      if (rows.length === 0) return;
      await rest("/responses?on_conflict=attempt_id,item_id", {
        method: "POST",
        body: rows.map((r) => ({ attempt_id: attemptId, ...r })),
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    },

    async insertAiGrading(row) {
      const rows = await rest<AiRowRaw[]>("/ai_gradings?select=id,response_id,model,prompt_version,criterion_scores,score,rationale,evidence,raw,created_at", {
        method: "POST",
        body: row,
        prefer: "return=representation",
      });
      return toAiRow(rows[0]);
    },

    async upsertFinalGrading(row) {
      await rest("/final_gradings?on_conflict=response_id", {
        method: "POST",
        body: { ...row, confirmed_at: new Date().toISOString() },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },

    async setAttemptStatus(attemptId, to, from) {
      await rest(`/attempts?id=eq.${encodeURIComponent(attemptId)}&status=in.(${from.join(",")})`, {
        method: "PATCH",
        body: { status: to },
        prefer: "return=minimal",
      });
    },

    async updateResults(attemptId, update) {
      await rest(`/results?attempt_id=eq.${encodeURIComponent(attemptId)}`, {
        method: "PATCH",
        body: { ...update, computed_at: new Date().toISOString() },
        prefer: "return=minimal",
      });
    },

    // ── 리포트·결과 목록 ─────────────────────────────
    async getReport(attemptId) {
      type Row = AttemptRow & {
        reliability: unknown;
        candidate: CandidateInfo & { exam: { id: string; title: string; show_result: boolean } };
        result: ReportResult | ReportResult[] | null;
      };
      type ReportResult = { status: "grading" | "complete"; detail: unknown; feedback: Feedback | null };
      const select = [
        "id,candidate_id,started_at,submitted_at,duration_sec,status,reliability",
        `candidate:candidates(${CANDIDATE_INFO},exam:exams(id,title,show_result))`,
        "result:results(status,detail,feedback)",
      ].join(",");
      const rows = await rest<Row[]>(`/attempts?id=eq.${encodeURIComponent(attemptId)}&select=${select}`);
      const r = rows[0];
      if (!r) return null;
      const { exam, ...candidate } = r.candidate;
      const report: ReportData = {
        attemptId: r.id, status: r.status, submittedAt: r.submitted_at, durationSec: r.duration_sec, reliability: r.reliability,
        candidate, exam, result: one(r.result),
      };
      return report;
    },

    async getCohort(examId) {
      type Row = { attempt_id: string; total: number; knowledge_score: number; practice_score: number; detail: { tops?: { id: string; score: number | null }[] } };
      const rows = await rest<Row[]>(
        `/results?status=eq.complete&select=attempt_id,total,knowledge_score,practice_score,detail,attempt:attempts!inner(candidate:candidates!inner(exam_id))&attempt.candidate.exam_id=eq.${encodeURIComponent(examId)}`,
      );
      return rows.map((r): CohortMember => ({
        attemptId: r.attempt_id,
        total: Number(r.total),
        knowledge: Number(r.knowledge_score),
        practice: Number(r.practice_score),
        tops: Object.fromEntries((r.detail.tops ?? []).filter((t) => t.score != null).map((t) => [t.id, Number(t.score)])),
      }));
    },

    async listResults() {
      type Res = { status: "grading" | "complete"; total: number | null; grade: string | null; ai_type: string | null; knowledge_score: number; practice_score: number | null; feedback: Feedback | null };
      type Att = { id: string; status: AttemptRow["status"]; submitted_at: string | null; reliability: unknown; result: Res | Res[] | null };
      type Row = CandidateInfo & { id: string; exam: { id: string; title: string }; attempt: Att | Att[] | null };
      const select = `id,${CANDIDATE_INFO},exam:exams(id,title),attempt:attempts(id,status,submitted_at,reliability,result:results(status,total,grade,ai_type,knowledge_score,practice_score,feedback))`;
      const rows = await rest<Row[]>(`/candidates?select=${select}&order=employee_no.asc`);
      return rows.map((r): ResultRow => {
        const a = one(r.attempt);
        const res = a ? one(a.result) : null;
        return {
          candidateId: r.id,
          candidate: { name: r.name, employee_no: r.employee_no, department: r.department, cohort: r.cohort },
          exam: r.exam,
          attempt: a ? { id: a.id, status: a.status, submittedAt: a.submitted_at, reliability: a.reliability } : null,
          result: res
            ? {
                status: res.status, total: res.total == null ? null : Number(res.total), grade: res.grade, aiType: res.ai_type,
                knowledge: Number(res.knowledge_score), practice: res.practice_score == null ? null : Number(res.practice_score),
                feedbackStatus: res.feedback?.status ?? null,
              }
            : null,
        };
      });
    },

    async listExams() {
      return rest<{ id: string; title: string }[]>("/exams?select=id,title&order=created_at.desc");
    },

    async saveFeedback(attemptId, feedback) {
      await rest(`/results?attempt_id=eq.${encodeURIComponent(attemptId)}`, {
        method: "PATCH",
        body: { feedback },
        prefer: "return=minimal",
      });
    },

    async listSurveys(examId) {
      type Row = Omit<SurveyRow, "attemptId" | "candidate" | "exam"> & {
        attempt_id: string;
        attempt: { candidate: CandidateInfo & { exam: { id: string; title: string } } };
      };
      const select = `attempt_id,answers,had_issue,issue,comment,created_at,attempt:attempts!inner(candidate:candidates!inner(${CANDIDATE_INFO},exam_id,exam:exams(id,title)))`;
      const filter = examId ? `&attempt.candidate.exam_id=eq.${encodeURIComponent(examId)}` : "";
      const rows = await rest<Row[]>(`/attempt_surveys?select=${select}${filter}&order=created_at.desc`);
      return rows.map(({ attempt_id, attempt, ...s }): SurveyRow => {
        const { exam, ...c } = attempt.candidate;
        return { ...s, attemptId: attempt_id, candidate: { name: c.name, employee_no: c.employee_no, department: c.department, cohort: c.cohort }, exam };
      });
    },

    async getAnalysisData(examId) {
      type Resp = ResponseRow & {
        ai_gradings: { criterion_scores: Record<string, number>; created_at: string }[];
        final_gradings: { criterion_scores: Record<string, number> } | { criterion_scores: Record<string, number> }[] | null;
      };
      type Row = { id: string; candidate: { employee_no: string }; result: { detail: ExamResult } | { detail: ExamResult }[] | null; responses: Resp[] };
      const select = "id,candidate:candidates!inner(employee_no,exam_id),result:results(detail),responses(item_id,answer,response_ms,pasted,ai_gradings(criterion_scores,created_at),final_gradings(criterion_scores))";
      const rows = await rest<Row[]>(`/attempts?status=neq.in_progress&select=${select}&candidate.exam_id=eq.${encodeURIComponent(examId)}&order=submitted_at.asc`);
      return rows.map((r): AnalysisAttempt => ({
        attemptId: r.id,
        employee_no: r.candidate.employee_no,
        responses: r.responses.map((x) => ({ item_id: x.item_id, answer: x.answer })),
        essays: Object.fromEntries(
          r.responses
            .filter((x) => ESSAY_ITEMS.some((e) => e.id === x.item_id))
            .map((x) => {
              const ai = [...x.ai_gradings].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              return [x.item_id, { final: one(x.final_gradings)?.criterion_scores ?? null, ai: ai?.criterion_scores ?? null }];
            }),
        ),
        detail: one(r.result)?.detail ?? null,
      }));
    },

    // ── 시험·대상자·안내문 관리 ───────────────────────
    async listExamSummaries() {
      type Row = ExamRow & { candidates: { attempt: { status: AttemptRow["status"] } | { status: AttemptRow["status"] }[] | null }[] };
      const rows = await rest<Row[]>(`/exams?select=${EXAM_COLUMNS},candidates(attempt:attempts(status))&order=created_at.desc`);
      return rows.map(({ candidates, ...exam }): ExamSummary => {
        const statuses = candidates.map((c) => one(c.attempt)?.status).filter(Boolean);
        return {
          ...exam, candidates: candidates.length, started: statuses.length,
          submitted: statuses.filter((st) => st !== "in_progress").length, complete: statuses.filter((st) => st === "complete").length,
        };
      });
    },

    async getExam(examId) {
      const rows = await rest<ExamRow[]>(`/exams?id=eq.${encodeURIComponent(examId)}&select=${EXAM_COLUMNS}`);
      return rows[0] ?? null;
    },

    async createExam(input, createdBy) {
      const rows = await rest<{ id: string }[]>("/exams?select=id", {
        method: "POST",
        body: { ...input, status: "draft", created_by: createdBy },
        prefer: "return=representation",
      });
      return rows[0].id;
    },

    async updateExam(examId, patch) {
      await rest(`/exams?id=eq.${encodeURIComponent(examId)}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
    },

    async listCandidates(examId) {
      type Row = Omit<AdminCandidate, "attemptStatus"> & { attempt: { status: AttemptRow["status"] } | { status: AttemptRow["status"] }[] | null };
      const select = [
        "id,employee_no,name,email,phone,department,cohort,joined_at,access_token,invited_at,retake_until",
        "attempt:attempts(status)",
        "retakes:attempt_archives(id,status,grade,reason,archived_at,scores_cleared_at)",
      ].join(",");
      const rows = await rest<Row[]>(
        `/candidates?exam_id=eq.${encodeURIComponent(examId)}&select=${select}&order=employee_no.asc&retakes.order=archived_at.desc`,
      );
      return rows.map(({ attempt, ...c }) => ({ ...c, attemptStatus: one(attempt)?.status ?? null }));
    },

    async upsertCandidates(examId, rows) {
      const existing = new Set(
        (await rest<{ employee_no: string }[]>(`/candidates?exam_id=eq.${encodeURIComponent(examId)}&select=employee_no`)).map((r) => r.employee_no),
      );
      for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
        await rest("/candidates?on_conflict=exam_id,employee_no", {
          method: "POST",
          body: rows.slice(i, i + UPSERT_CHUNK).map((r) => ({ exam_id: examId, ...r })),
          prefer: "resolution=merge-duplicates,return=minimal",
        });
      }
      const updated = rows.filter((r) => existing.has(r.employee_no)).length;
      return { inserted: rows.length - updated, updated };
    },

    async deleteCandidate(examId, candidateId) {
      const q = `id=eq.${encodeURIComponent(candidateId)}&exam_id=eq.${encodeURIComponent(examId)}`;
      const rows = await rest<{ attempt: unknown }[]>(`/candidates?${q}&select=attempt:attempts(id)`);
      if (!rows[0] || one(rows[0].attempt as { id: string } | { id: string }[] | null)) return false;
      await rest(`/candidates?${q}`, { method: "DELETE", prefer: "return=minimal" });
      return true;
    },

    async resetAttempt(examId, candidateId, input) {
      const rows = await rest<{ id: string }[]>(`/candidates?id=eq.${encodeURIComponent(candidateId)}&exam_id=eq.${encodeURIComponent(examId)}&select=id`);
      if (!rows[0]) return false;
      return rest<boolean>("/rpc/reset_attempt", {
        method: "POST",
        body: { p_candidate_id: candidateId, p_reason: input.reason, p_admin: input.adminId, p_retake_until: input.retakeUntil },
      });
    },

    async clearArchiveScores(examId, candidateId, archiveId) {
      const rows = await rest<{ id: string }[]>(
        `/attempt_archives?id=eq.${encodeURIComponent(archiveId)}&candidate_id=eq.${encodeURIComponent(candidateId)}&select=id,candidate:candidates!inner(exam_id)&candidate.exam_id=eq.${encodeURIComponent(examId)}`,
      );
      if (!rows[0]) return false;
      return rest<boolean>("/rpc/clear_archive_scores", { method: "POST", body: { p_archive_id: archiveId } });
    },

    async getNotices(examId) {
      return rest<NoticeTemplate[]>(`/notice_templates?exam_id=eq.${encodeURIComponent(examId)}&select=channel,subject,body,updated_at`);
    },

    async saveNotice(examId, notice) {
      await rest("/notice_templates?on_conflict=exam_id,channel", {
        method: "POST",
        body: { exam_id: examId, channel: notice.channel, subject: notice.subject, body: notice.body, updated_at: new Date().toISOString() },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    },
  };
}
