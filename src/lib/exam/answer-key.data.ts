// 객관식 정답 키와 서술형 채점 기준표 (문항 세트 버전별). 서버 코드에서는 answer-key.ts(server-only)를 통해서만 import 한다.
// 테스트처럼 서버 밖에서 순수 로직을 검증할 때만 이 파일을 직접 쓴다.

import { ITEM_SET_VERSION } from "./items";
import { KEY_V1 } from "./answer-key.v1.data";
import { KEY_V2 } from "./answer-key.v2.data";

export interface RubricCriterion {
  key: string;
  name: string;
  // levels[0] = 1점 ... levels[3] = 4점 의 행동 기준
  levels: [string, string, string, string];
}

export interface Rubric {
  itemId: string;
  criteria: RubricCriterion[];
}

/** 한 버전의 채점 키: 객관식 정답 번호(1부터)와 서술형 채점 기준표 */
export interface ScoringKey {
  version: string;
  answerKey: Record<string, number>;
  rubrics: Rubric[];
}

const KEYS: Record<string, ScoringKey> = Object.fromEntries(
  [KEY_V1, KEY_V2].map((k) => [k.version, { version: k.version, answerKey: { ...k.answerKey }, rubrics: [...k.rubrics] }]),
);

/** 시험의 item_set_version 에 맞는 채점 키. 모르는 버전이면 오류 */
export function scoringKey(version: string): ScoringKey {
  const k = KEYS[version];
  if (!k) throw new Error(`unknown scoring key version: ${version}`);
  return k;
}

export const currentScoringKey = (): ScoringKey => scoringKey(ITEM_SET_VERSION);

export function rubricFor(key: ScoringKey, itemId: string): Rubric {
  const r = key.rubrics.find((x) => x.itemId === itemId);
  if (!r) throw new Error(`no rubric for ${itemId} in ${key.version}`);
  return r;
}
