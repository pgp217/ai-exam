// Supabase(PostgREST) 저장소. 서버 전용 키로 RLS 를 우회해 접근하므로 서버에서만 쓴다.
import "server-only";

import type { AttemptRow, ExamRow, ExamStore, ResponseRow, Session, SubmitInput } from "./types";

export class SupabaseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function createSupabaseStore(url: string, key: string): ExamStore {
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
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new SupabaseError(`Supabase ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}: ${data?.message ?? text}`, res.status, data?.code);
    }
    return data as T;
  }

  type CandidateJoin = {
    id: string;
    name: string;
    exam: ExamRow;
    // attempts.candidate_id 가 unique 라 PostgREST 는 객체로 돌려주지만, 배열이어도 처리한다
    attempt: (AttemptRow & { responses: ResponseRow[] }) | (AttemptRow & { responses: ResponseRow[] })[] | null;
  };

  return {
    async findSession(token) {
      const select = [
        "id,name",
        "exam:exams(id,title,starts_at,ends_at,time_limit_min,intro_text,show_result,item_set_version,status)",
        "attempt:attempts(id,candidate_id,started_at,submitted_at,duration_sec,status,responses(item_id,answer,response_ms,pasted))",
      ].join(",");
      const rows = await rest<CandidateJoin[]>(`/candidates?access_token=eq.${encodeURIComponent(token)}&select=${select}`);
      const c = rows[0];
      if (!c) return null;
      const a = Array.isArray(c.attempt) ? (c.attempt[0] ?? null) : c.attempt;
      const session: Session = {
        candidate: { id: c.id, name: c.name },
        exam: c.exam,
        attempt: a ? { id: a.id, candidate_id: a.candidate_id, started_at: a.started_at, submitted_at: a.submitted_at, duration_sec: a.duration_sec, status: a.status } : null,
        responses: a?.responses ?? [],
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
  };
}
