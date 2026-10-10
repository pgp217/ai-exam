import { getAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { BI_TABLES, buildTable, excludeRows, toCsv, type BiTable } from "@/lib/bi/export";

// BI 내보내기: 채점 완료된 응시를 표 하나씩 CSV 로 내려준다. ?table=people|scores|factors&exam=<id>&exclude=P-000,SIM-
export async function GET(req: Request) {
  if (!(await getAdmin())) return new Response("로그인이 필요합니다.", { status: 401 });
  const sp = new URL(req.url).searchParams;
  const table = sp.get("table") as BiTable;
  if (!(table in BI_TABLES)) return new Response("table 은 people, scores, factors 중 하나입니다.", { status: 400 });
  const exam = sp.get("exam") || undefined;
  const exclude = (sp.get("exclude") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const rows = table === "factors" ? [] : excludeRows(await getStore().getBiSource(exam), exclude);
  const name = `${BI_TABLES[table].file}.csv`;
  return new Response(toCsv(buildTable(table, rows)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
