// 상태 확인: DB 에 가벼운 조회를 한 번 한다. 응시자 정보는 돌려주지 않는다.
// 매일 부르는 일은 /api/cron/daily 가 한다 (같은 조회 + 데모 초기화).
import { getStore } from "@/lib/attempt/store";
import { cronAuthorized } from "@/lib/cron/auth";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ ok: false }, { status: 401 });
  try {
    await getStore().ping();
    return Response.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
