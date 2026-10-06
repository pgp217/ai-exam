import { getAdmin } from "@/lib/admin/auth";
import { buildTemplate } from "@/lib/exams/xlsx";

export async function GET() {
  if (!(await getAdmin())) return new Response("로그인이 필요합니다.", { status: 401 });
  const body = new Uint8Array(await buildTemplate());
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="candidates-template.xlsx"; filename*=UTF-8''${encodeURIComponent("대상자_양식.xlsx")}`,
      "Cache-Control": "no-store",
    },
  });
}
