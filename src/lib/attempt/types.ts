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
