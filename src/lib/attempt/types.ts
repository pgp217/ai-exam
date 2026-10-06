// 응시 흐름에서 쓰는 DB 행 모양과 저장소 인터페이스.

export interface ExamRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  time_limit_min: number;
  intro_text: string;
  show_result: boolean;
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
  candidate: { id: string; name: string };
  exam: ExamRow;
  attempt: AttemptRow | null;
  responses: ResponseRow[];
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
  exam: { id: string; title: string };
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
  exam: { id: string; title: string; show_result: boolean };
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

export interface ReportStore {
  getReport(attemptId: string): Promise<ReportData | null>;
  /** 같은 시험에서 결과가 확정된 응시자들 */
  getCohort(examId: string): Promise<CohortMember[]>;
  listResults(): Promise<ResultRow[]>;
  listExams(): Promise<{ id: string; title: string }[]>;
  saveFeedback(attemptId: string, feedback: Feedback): Promise<void>;
}
