// 데모 대상자 매일 초기화: 포트폴리오·면접에서 누구나 응시해 볼 수 있도록, 데모 링크의 응시 기록을 지워 처음 상태로 돌린다.
import "server-only";

import { getStore } from "../attempt/store";

/** 응시 중인 기록은 이 시간보다 오래 전에 시작한(버려진) 것만 지운다. 지금 풀고 있는 사람을 끊지 않기 위해서다 */
export const ABANDONED_AFTER_MS = 3 * 60 * 60 * 1000;

/** 운영 데모 시험(2026 하반기 … (데모))의 박서연(D-003). 응시 링크 토큰과 달리 id 만으로는 응시할 수 없다 */
export const DEFAULT_DEMO_CANDIDATE_IDS = "aad2c1a5-49cc-4f73-8eae-1f0f674fb887";

/** DEMO_RESET_CANDIDATE_IDS: 쉼표로 구분한 candidates.id. 지정하지 않으면 기본값, 빈 값이면 초기화하지 않는다 */
export function demoCandidateIds(env = process.env.DEMO_RESET_CANDIDATE_IDS): string[] {
  return (env ?? DEFAULT_DEMO_CANDIDATE_IDS)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
}

export async function resetDemoCandidates(now = Date.now()): Promise<{ candidates: number; cleared: number }> {
  const ids = demoCandidateIds();
  if (ids.length === 0) return { candidates: 0, cleared: 0 };
  const cleared = await getStore().clearDemoAttempts(ids, new Date(now - ABANDONED_AFTER_MS).toISOString());
  return { candidates: ids.length, cleared };
}
