// 정합성 점검(scripts/crosscheck.py)에 쓸 채점 설정값(정답, 문항-요인 연결, 기준 key)을 문항 세트 버전별 JSON 으로 출력한다.
//   npx tsx scripts/export-scoring-config.mts > /tmp/scoring-config.json
import { scoringKey } from "../src/lib/exam/answer-key.data";
import { ITEM_SET_VERSIONS, itemSet } from "../src/lib/exam/items";
import { MID_FACTORS } from "../src/lib/exam/factors";

const versions = Object.fromEntries(
  ITEM_SET_VERSIONS.map((v) => {
    const set = itemSet(v);
    const key = scoringKey(v);
    return [v, {
      answerKey: key.answerKey,
      choice: set.choice.map((i) => ({ id: i.id, mid: i.mid })),
      essays: set.essay.map((e) => ({ id: e.id, mid: e.mid, criteria: key.rubrics.find((r) => r.itemId === e.id)!.criteria.map((c) => c.key) })),
    }];
  }),
);

console.log(JSON.stringify({ versions, midTop: Object.fromEntries(MID_FACTORS.map((m) => [m.id, m.top])) }));
