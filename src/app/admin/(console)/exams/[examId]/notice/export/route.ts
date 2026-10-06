import { getAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/attempt/store";
import { csvCell, noticeVars, renderTemplate, smsBytes, smsKind } from "@/lib/exams/notice";
import { appOrigin, examLink } from "@/lib/exams/service";

// 저장된 안내문을 대상자별로 치환해 CSV 로 내려준다 (엑셀에서 한글이 깨지지 않도록 BOM 포함)
export async function GET(req: Request, ctx: RouteContext<"/admin/exams/[examId]/notice/export">) {
  if (!(await getAdmin())) return new Response("로그인이 필요합니다.", { status: 401 });
  const { examId } = await ctx.params;
  const channel = new URL(req.url).searchParams.get("channel");
  if (channel !== "email" && channel !== "sms") return new Response("channel 은 email 또는 sms 입니다.", { status: 400 });

  const store = getStore();
  const exam = await store.getExam(examId);
  if (!exam) return new Response("시험을 찾을 수 없습니다.", { status: 404 });
  const notice = (await store.getNotices(examId)).find((n) => n.channel === channel);
  if (!notice) return new Response("저장된 안내문이 없습니다.", { status: 404 });
  const [candidates, origin] = await Promise.all([store.listCandidates(examId), appOrigin()]);

  const header = channel === "email" ? ["사번", "이름", "이메일", "제목", "본문"] : ["사번", "이름", "휴대폰", "본문", "바이트", "종류"];
  const lines = [header.join(",")];
  for (const c of candidates) {
    const vars = noticeVars({ name: c.name, title: exam.title, starts_at: exam.starts_at, ends_at: exam.ends_at, time_limit_min: exam.time_limit_min, url: examLink(origin, c.access_token) });
    const body = renderTemplate(notice.body, vars).text;
    const cells = channel === "email"
      ? [c.employee_no, c.name, c.email, renderTemplate(notice.subject ?? "", vars).text, body]
      : [c.employee_no, c.name, c.phone, body, String(smsBytes(body)), smsKind(smsBytes(body))];
    lines.push(cells.map(csvCell).join(","));
  }
  const name = `${exam.title}_${channel === "email" ? "메일" : "문자"}_안내문.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="notices.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
