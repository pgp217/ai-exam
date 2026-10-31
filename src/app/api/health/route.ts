// 상태 확인: DB 에 가벼운 조회를 한 번 한다. Vercel Cron 이 하루 한 번 불러
// Supabase 무료 플랜의 비활성 일시정지(7일)를 막는다. 응시자 정보는 돌려주지 않는다.
import { getStore } from "@/lib/attempt/store";

export async function GET(req: Request) {
  // CRON_SECRET 을 지정하면 Vercel Cron 이 Authorization: Bearer <값> 을 붙여 부른다. 그 밖의 호출은 막는다.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false }, { status: 401 });
  }
  try {
    await getStore().ping();
    return Response.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
