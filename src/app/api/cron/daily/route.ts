// 매일 자정(KST) Vercel Cron 이 부른다: 데모 대상자 응시 초기화 + DB 상태 확인(Supabase 무료 플랜 일시정지 방지).
import { getStore } from "@/lib/attempt/store";
import { cronAuthorized } from "@/lib/cron/auth";
import { resetDemoCandidates } from "@/lib/cron/demo-reset";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ ok: false }, { status: 401 });
  try {
    await getStore().ping();
    const demo = await resetDemoCandidates();
    return Response.json({ ok: true, at: new Date().toISOString(), demo }, { headers: noStore });
  } catch (e) {
    console.error("daily cron failed", e);
    return Response.json({ ok: false }, { status: 503, headers: noStore });
  }
}
