// 응시 흐름에서 쓰는 DB 행 모양과 저장소 인터페이스.
import type { AnalysisAttempt } from "../analysis/items";
import type { Survey } from "../survey/survey";

export interface ExamRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_limit_min: number;
  intro_text: string;
  show_result: boolean;
  collect_survey: boolean; // 제출 뒤 응시 후 설문을 받는다
  item_set_version: string;
  status: "draft" | "open" | "closed";
}

export type AttemptStatus = "in_progress" | "submitted" | "grading" | "complete";

export interface AttemptRow {
  id: string;
  candidate_id: string;
  started_at: string;
  submitted_at: string | null;
  duration_sec: number | null;
  status: AttemptStatus;
}

/** 객관식·자기평가는 value(보기 번호, 1부터), 서술형은 text */
export type Answer = { value: number } | { text: string };

export interface ResponseRow {
  item_id: string;
  answer: Answer;
  response_ms: number | null; // 문항에 머문 누적 시간
  pasted: boolean; // 서술형 입력 중 붙여넣기 발생
}

export interface Session {
  candidate: { id: string; name: string; retake_until: string | null };
  exam: ExamRow;
  attempt: AttemptRow | null;
  responses: ResponseRow[];
  surveyDone: boolean; // 이 응시의 설문을 이미 냈는지
}

export interface SubmitInput {
  attemptId: string;
  responses: ResponseRow[]; // 마지막으로 저장할 응답 (기존 응답에 덮어씀)
  durationSec: number;
  reliability: unknown;
  knowledgeScore: number;
  detail: unknown; // scoreAttempt() 결과
}

export interface ExamStore {
  findSession(token: string): Promise<Session | null>;
  /** 이미 시작했으면 아무것도 하지 않는다 (1인 1회 응시) */
  startAttempt(candidateId: string): Promise<void>;
  /** 응시 중이 아니면 저장하지 않고 false */
  saveResponses(attemptId: string, responses: ResponseRow[]): Promise<boolean>;
  /** 이미 제출됐으면 아무것도 바꾸지 않고 false */
  submitAttempt(input: SubmitInput): Promise<boolean>;
  /** 응시 1건당 1번. 이미 냈으면 false */
  saveSurvey(attemptId: string, survey: Survey): Promise<boolean>;
}

/** 관리자 화면용 설문 응답 */
export interface SurveyRow extends Survey {
  attemptId: string;
  created_at: string;
  candidate: CandidateInfo;
  exam: { id: string; title: string };
}

// ── 서술형 채점 (3단계) ─────────────────────────────────

export interface Evidence {
  criterion: string; // 기준 key
  quote: string; // 응답 원문 인용
  verified: boolean; // 인용이 실제 응답에 있는지 서버에서 확인한 결과
}

export interface AiGradingRow {
  id: string;
  response_id: string;
  model: string;
  prompt_version: string;
  criterion_scores: Record<string, number>;
  score: number;
  rationale: string; // 종합 판정 이유
  reasons: Record<string, string>; // 기준별 판정 이유 (raw.reasons 에서 읽음)
  evidence: Evidence[];
  created_at: string;
}

/** raw 에는 모델 원문 출력과 함께 기준별 이유를 { reasons, output, ... } 형태로 저장한다 */
export type NewAiGrading = Omit<AiGradingRow, "id" | "created_at" | "reasons"> & { raw: { reasons: Record<string, string> } & Record<string, unknown> };

export interface FinalGradingRow {
  response_id: string;
  ai_grading_id: string | null;
  grader_id: string;
  criterion_scores: Record<string, number>;
  score: number;
  override_reason: string | null;
  confirmed_at: string;
}

export interface CandidateInfo {
  name: string;
  employee_no: string;
  department: string | null;
  cohort: string | null;
}

export interface ReviewAttempt {
  attempt: AttemptRow & { reliability: unknown };
  candidate: CandidateInfo;
  exam: { id: string; title: string; item_set_version: string };
  knowledgeScore: number | null;
  resultStatus: "grading" | "complete" | null;
  responses: (ResponseRow & { id: string })[];
  aiGradings: AiGradingRow[]; // 최신순
  finals: FinalGradingRow[];
}

export interface QueueEssay {
  itemId: string;
  responseId: string | null;
  ai: Pick<AiGradingRow, "id" | "criterion_scores" | "score"> | null; // 최신 AI 채점
  final: Pick<FinalGradingRow, "criterion_scores" | "score" | "ai_grading_id"> | null;
}

export interface QueueRow {
  attemptId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  reliability: unknown;
  candidate: CandidateInfo;
  examTitle: string;
  essays: QueueEssay[];
  aiGradingsById: Record<string, Record<string, number>>; // 일치율 계산용: AI 채점 id → 기준별 점수
}

export interface ResultUpdate {
  practice_score: number | null;
  total: number | null;
  grade: string | null;
  ai_type: string | null;
  detail: unknown;
  status: "grading" | "complete";
}

export interface GradingStore {
  isAdmin(userId: string): Promise<{ name: string } | null>;
  listQueue(): Promise<QueueRow[]>;
  getReviewAttempt(attemptId: string): Promise<ReviewAttempt | null>;
  /** 없는 응답 행만 만든다 (미응답 서술형을 채점하려면 행이 있어야 한다) */
  ensureResponses(attemptId: string, rows: ResponseRow[]): Promise<void>;
  insertAiGrading(row: NewAiGrading): Promise<AiGradingRow>;
  upsertFinalGrading(row: Omit<FinalGradingRow, "confirmed_at">): Promise<void>;
  /** from 에 있는 상태일 때만 바꾼다 */
  setAttemptStatus(attemptId: string, to: AttemptStatus, from: AttemptStatus[]): Promise<void>;
  updateResults(attemptId: string, update: ResultUpdate): Promise<void>;
}

// ── 리포트·결과 목록 (4단계) ───────────────────────────

export interface FeedbackAction {
  title: string;
  detail: string;
  chapter: string | null; // 교재 장 id (ch01 ~ ch11)
}

export interface Feedback {
  status: "draft" | "approved";
  summary: string;
  actions: FeedbackAction[];
  model: string;
  prompt_version?: string;
  generated_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  stale?: boolean; // 승인 뒤 점수가 바뀌어 다시 생성이 필요함
  basis: { total: number | null; practice: number | null };
}

export interface ReportData {
  attemptId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  durationSec: number | null;
  reliability: unknown;
  candidate: CandidateInfo;
  exam: { id: string; title: string; show_result: boolean; item_set_version: string };
  result: { status: "grading" | "complete"; detail: unknown; feedback: Feedback | null } | null;
}

export interface CohortMember {
  attemptId: string;
  total: number;
  knowledge: number;
  practice: number;
  tops: Record<string, number>; // 상위요인 id → 점수
}

export interface ResultRow {
  candidateId: string;
  candidate: CandidateInfo;
  exam: { id: string; title: string };
  attempt: { id: string; status: AttemptStatus; submittedAt: string | null; reliability: unknown } | null;
  result: { status: "grading" | "complete"; total: number | null; grade: string | null; aiType: string | null; knowledge: number; practice: number | null; feedbackStatus: Feedback["status"] | null } | null;
}

/** BI 내보내기용: 채점이 끝난 응시 1건 (results.detail 은 scoreAttempt() 결과) */
export interface BiSourceRow {
  candidateId: string;
  employee_no: string;
  department: string | null;
  cohort: string | null;
  exam: { id: string; title: string; item_set_version: string };
  submittedAt: string | null;
  durationSec: number | null;
  reliability: unknown;
  detail: unknown;
}

export interface ReportStore {
  getReport(attemptId: string): Promise<ReportData | null>;
  /** 같은 시험에서 결과가 확정된 응시자들 */
  getCohort(examId: string): Promise<CohortMember[]>;
  listResults(): Promise<ResultRow[]>;
  listExams(): Promise<{ id: string; title: string }[]>;
  saveFeedback(attemptId: string, feedback: Feedback): Promise<void>;
  /** examId 가 있으면 그 시험만, 최근 순 */
  listSurveys(examId?: string): Promise<SurveyRow[]>;
  /** 문항 분석용: 그 시험의 제출된 응시 전체 (응답, 서술형 확정·최근 AI 기준 점수, 결과) */
  getAnalysisData(examId: string): Promise<AnalysisAttempt[]>;
  /** BI 내보내기용: 채점 완료된 응시 (examId 가 없으면 모든 시험) */
  getBiSource(examId?: string): Promise<BiSourceRow[]>;
}

// ── 시험·대상자·안내문 관리 (5단계) ─────────────────────

export interface ExamSummary extends ExamRow {
  candidates: number;
  started: number; // 응시 시작(응시 중 포함)
  submitted: number;
  complete: number;
}

export interface AdminCandidate {
  id: string;
  employee_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  cohort: string | null;
  joined_at: string | null;
  access_token: string;
  invited_at: string | null;
  attemptStatus: AttemptStatus | null;
  retake_until: string | null;
  retakes: RetakeRecord[]; // 이전 응시 보관 기록 (최근 순)
}

/** 재응시를 허용하며 보관한 이전 응시 */
export interface RetakeRecord {
  id: string;
  status: AttemptStatus; // 보관 시점의 응시 상태
  grade: string | null;
  reason: string;
  archived_at: string;
  scores_cleared_at: string | null; // 이전 AI 채점·확정 점수를 지운 시각
}

export interface RetakeInput {
  reason: string;
  adminId: string | null;
  retakeUntil: string | null; // 시험 기간이 끝났을 때 이 대상자만 응시할 수 있는 마감 (ISO)
}

export interface CandidateUpsert {
  employee_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  cohort: string | null;
  joined_at: string | null;
}

export interface NoticeTemplate {
  channel: "email" | "sms";
  subject: string | null;
  body: string;
  updated_at?: string;
}

export type ExamPatch = Partial<Pick<ExamRow, "title" | "starts_at" | "ends_at" | "time_limit_min" | "intro_text" | "show_result" | "collect_survey" | "status">>;

export interface ExamAdminStore {
  listExamSummaries(): Promise<ExamSummary[]>;
  getExam(examId: string): Promise<ExamRow | null>;
  createExam(input: Pick<ExamRow, "title" | "starts_at" | "ends_at" | "time_limit_min" | "intro_text" | "show_result" | "collect_survey" | "item_set_version">, createdBy: string | null): Promise<string>;
  updateExam(examId: string, patch: ExamPatch): Promise<void>;
  listCandidates(examId: string): Promise<AdminCandidate[]>;
  /** 사번 기준으로 새로 넣거나 정보를 바꾼다. 응시 링크(access_token)는 바뀌지 않는다 */
  upsertCandidates(examId: string, rows: CandidateUpsert[]): Promise<{ inserted: number; updated: number }>;
  /** 응시 기록이 있으면 지우지 않고 false */
  deleteCandidate(examId: string, candidateId: string): Promise<boolean>;
  /** 이전 응시를 보관하고 지워 같은 링크로 다시 응시하게 한다. 응시 기록이 없으면 false */
  resetAttempt(examId: string, candidateId: string, input: RetakeInput): Promise<boolean>;
  /** 보관본의 AI 채점·확정 점수·결과만 지운다 (응답 원문·사유는 남김). 없거나 이미 지웠으면 false */
  clearArchiveScores(examId: string, candidateId: string, archiveId: string): Promise<boolean>;
  getNotices(examId: string): Promise<NoticeTemplate[]>;
  saveNotice(examId: string, notice: NoticeTemplate): Promise<void>;
}
