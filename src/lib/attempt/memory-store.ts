// 개발용 메모리 저장소. Supabase 없이 응시 화면을 돌려 볼 때 쓴다 (서버 재시작 시 초기화).
// 데모 응시 링크: /t/demo, /t/demo2, /t/demo3

import { ITEM_SET_VERSION } from "../exam/items";
import { mergeResponses } from "./responses";
import type { AttemptRow, ExamRow, ExamStore, ResponseRow } from "./types";

interface Candidate {
  id: string;
  exam_id: string;
  name: string;
  access_token: string;
}

export interface MemoryDb {
  exams: ExamRow[];
  candidates: Candidate[];
  attempts: AttemptRow[];
  responses: Map<string, ResponseRow[]>; // attempt_id → 응답
  results: Map<string, { knowledge_score: number; detail: unknown; status: "grading" }>;
  reliability: Map<string, unknown>;
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
    candidates: ["demo", "demo2", "demo3"].map((t, i) => ({ id: `demo-c${i + 1}`, exam_id: exam.id, name: names[i], access_token: t })),
    attempts: [],
    responses: new Map(),
    results: new Map(),
    reliability: new Map(),
  };
}

export function createMemoryStore(db: MemoryDb = demoDb()): ExamStore & { db: MemoryDb } {
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
        responses: attempt ? structuredClone(db.responses.get(attempt.id) ?? []) : [],
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
      db.responses.set(attemptId, mergeResponses(db.responses.get(attemptId) ?? [], structuredClone(responses)));
      return true;
    },

    async submitAttempt(input) {
      const a = db.attempts.find((x) => x.id === input.attemptId);
      if (!a || a.status !== "in_progress") return false;
      db.responses.set(a.id, mergeResponses(db.responses.get(a.id) ?? [], structuredClone(input.responses)));
      a.status = "submitted";
      a.submitted_at = new Date().toISOString();
      a.duration_sec = input.durationSec;
      db.reliability.set(a.id, input.reliability);
      db.results.set(a.id, { knowledge_score: input.knowledgeScore, detail: input.detail, status: "grading" });
      return true;
    },
  };
}
