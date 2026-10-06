// 정합성 점검(scripts/crosscheck.py)에 쓸 채점 설정값(정답, 문항-요인 연결, 기준 key)을 JSON 으로 출력한다.
//   npx tsx scripts/export-scoring-config.mts > /tmp/scoring-config.json
import { ANSWER_KEY, RUBRICS } from "../src/lib/exam/answer-key.data";
import { CHOICE_ITEMS, ESSAY_ITEMS } from "../src/lib/exam/items";
import { MID_FACTORS } from "../src/lib/exam/factors";

console.log(JSON.stringify({
  answerKey: ANSWER_KEY,
  choice: CHOICE_ITEMS.map((i) => ({ id: i.id, mid: i.mid })),
  essays: ESSAY_ITEMS.map((e) => ({ id: e.id, mid: e.mid, criteria: RUBRICS.find((r) => r.itemId === e.id)!.criteria.map((c) => c.key) })),
  midTop: Object.fromEntries(MID_FACTORS.map((m) => [m.id, m.top])),
}));
