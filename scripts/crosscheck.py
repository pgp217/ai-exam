# 정합성 점검: 설계안 3·4장의 채점 규칙을 앱 코드와 별개로 구현해 DB 에 저장된 결과와 대조한다 (읽기 전용).
#   npx tsx scripts/export-scoring-config.mts > /tmp/scoring-config.json
#   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/crosscheck.py /tmp/scoring-config.json
# 가상 응시자(사번 SIM-)는 서술형 확정 기록 없이 결과만 있으므로, 결과에 저장된 서술형 점수로 나머지 계산을 검증한다.
# 재응시한 대상자(attempt_archives 에 이전 응시가 있음)는 점검에서 빼고 인원만 알려 준다.
import json, math, os, sys, urllib.request
from decimal import Decimal, ROUND_HALF_UP

cfg = json.load(open(sys.argv[1]))
URL = (os.environ.get("SUPABASE_URL") or os.environ["NEXT_PUBLIC_SUPABASE_URL"]).rstrip("/") + "/rest/v1"

KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY") or ""
HEADERS = {"Accept": "application/json", "apikey": KEY}
if KEY.startswith("eyJ"): HEADERS["Authorization"] = "Bearer " + KEY

def get(path):
    with urllib.request.urlopen(urllib.request.Request(URL + path, headers=HEADERS)) as r:
        return json.load(r)

def r1(x):  # 소수 첫째 자리 반올림 (0.05 → 0.1)
    return float(Decimal(str(x)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))

def essay_score(crit):  # 기준 합(n~4n) → 0~100
    n = len(crit); return r1((sum(crit.values()) - n) / (3 * n) * 100)

BANDS = [(90, "A+"), (80, "A"), (70, "B+"), (60, "B"), (50, "C+"), (40, "C"), (30, "D+"), (0, "D")]
grade = lambda s: next(g for m, g in BANDS if s >= m)
band = lambda s: "high" if s >= 75 else "mid" if s >= 50 else "low"
TYPES = {("high","low"):"직관형 활용가",("high","mid"):"실전 성장가",("high","high"):"AI 에이스",
         ("mid","low"):"경험 학습가",("mid","mid"):"균형 성장형",("mid","high"):"지식 탄탄형",
         ("low","low"):"AI 입문자",("low","mid"):"기초 학습자",("low","high"):"이론 우선형"}

midTop = cfg["midTop"]
rows = get("/attempts?status=neq.in_progress&select=id,status,candidate:candidates(name,employee_no,retakes:attempt_archives(id),exam:exams(item_set_version)),"
           "result:results(status,knowledge_score,practice_score,total,grade,ai_type,detail),"
           "responses(id,item_id,answer,final_gradings(score,criterion_scores),ai_gradings(score,criterion_scores))")
one = lambda v: v[0] if isinstance(v, list) and v else (v if not isinstance(v, list) else None)

problems, checked, complete, sims_checked, retakes_skipped, versions_seen = [], 0, 0, [], [], {}
for a in rows:
    if a["candidate"]["retakes"]:
        retakes_skipped.append(a["candidate"]["name"]); continue
    name = a["candidate"]["name"]; res = one(a["result"]); checked += 1
    # 응시가 속한 시험의 문항 세트 버전 설정으로 검증한다
    ver = a["candidate"]["exam"]["item_set_version"]
    if ver not in cfg["versions"]: problems.append(f"{name}: 설정에 없는 문항 세트 {ver}"); continue
    key = cfg["versions"][ver]["answerKey"]; choice = cfg["versions"][ver]["choice"]; essays = cfg["versions"][ver]["essays"]
    versions_seen[ver] = versions_seen.get(ver, 0) + 1
    resp = {r["item_id"]: r for r in a["responses"]}
    if not res: problems.append(f"{name}: 결과 행 없음"); continue
    def ok(cond, msg):
        if not cond: problems.append(f"{name}: {msg}")
    correct = lambda ids: sum(1 for i in ids if i in resp and resp[i]["answer"].get("value") == key[i])
    all_ids = [c["id"] for c in choice]
    knowledge = r1(correct(all_ids) / len(all_ids) * 100)
    ok(abs(float(res["knowledge_score"]) - knowledge) < 1e-9, f"지식 {res['knowledge_score']} ≠ 재계산 {knowledge}")

    # 서술형: 확정 점수 = 기준 점수로 계산, AI 점수도 기준 점수와 일치
    finals = {}
    for e in essays:
        r = resp.get(e["id"])
        if not r: continue
        for g in r["ai_gradings"]:
            ok(abs(float(g["score"]) - essay_score(g["criterion_scores"])) < 1e-9, f"{e['id']} AI 점수 {g['score']} ≠ 기준 합 환산 {essay_score(g['criterion_scores'])}")
        f = one(r["final_gradings"])
        if f:
            ok(set(f["criterion_scores"]) == set(e["criteria"]), f"{e['id']} 확정 기준 키 불일치")
            ok(abs(float(f["score"]) - essay_score(f["criterion_scores"])) < 1e-9, f"{e['id']} 확정 {f['score']} ≠ 환산 {essay_score(f['criterion_scores'])}")
            finals[e["id"]] = float(f["score"])

    sim = a["candidate"]["employee_no"].startswith("SIM-")
    if sim and not finals:
        # 가상 응시자는 확정 기록 없이 결과만 있다: 결과에 저장된 서술형 점수로 나머지 계산을 검증한다
        mids = {m["id"]: m for m in res["detail"]["mids"]}
        finals = {e["id"]: float(mids[e["mid"]]["essayScore"]) for e in essays}
        sims_checked.append(name)
    all_final = len(finals) == len(essays)
    ok((res["status"] == "complete") == all_final, f"결과 상태 {res['status']} 인데 확정 {len(finals)}/{len(essays)}")
    ok((a["status"] == "complete") == all_final, f"응시 상태 {a['status']} 인데 확정 {len(finals)}/{len(essays)}")
    if not all_final:
        ok(res["practice_score"] is None and res["total"] is None, "미확정인데 실전/종합 점수가 있음"); continue

    complete += 1
    practice = r1(sum(finals.values()) / len(finals))
    ratio = lambda top: (lambda ids: correct(ids) / len(ids) * 100)([c["id"] for c in choice if midTop[c["mid"]] == top])
    es = lambda top: [finals[e["id"]] for e in essays if midTop[e["mid"]] == top]
    tops = {}
    for top in ["understand", "apply", "responsible"]:
        tops[top] = r1(ratio(top)) if not es(top) else r1(ratio(top) * 0.4 + sum(es(top)) / len(es(top)) * 0.6)
    total = r1(sum(tops.values()) / 3)
    exp = {"practice_score": practice, "total": total, "grade": grade(total), "ai_type": TYPES[(band(practice), band(knowledge))]}
    for k, v in exp.items():
        got = res[k] if isinstance(v, str) else float(res[k])
        ok(got == v, f"{k} {res[k]} ≠ 재계산 {v}")
    dt = {t["id"]: t["score"] for t in res["detail"]["tops"]}
    for t, v in tops.items(): ok(abs(float(dt[t]) - v) < 1e-9, f"상위요인 {t} {dt[t]} ≠ 재계산 {v}")

print("문항 세트별:", ", ".join(f"{v} {n}건" for v, n in sorted(versions_seen.items())))
print(f"점검한 응시 {checked}건 (채점 완료 {complete}건, 그중 가상 {len(sims_checked)}건은 결과 내부 서술형 점수로 검증)")
if retakes_skipped: print(f"재응시 {len(retakes_skipped)}건은 점검에서 뺐습니다: {', '.join(retakes_skipped)}")
print("불일치 없음" if not problems else f"불일치 {len(problems)}건:\n  " + "\n  ".join(problems))
sys.exit(1 if problems else 0)
