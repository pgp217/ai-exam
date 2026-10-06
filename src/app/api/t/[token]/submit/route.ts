import { submitAttempt } from "@/lib/attempt/service";
import { readJson, toResponse } from "../respond";

// 제출. 아직 저장되지 않은 응답을 함께 보낸다: { responses: [...] }
export async function POST(req: Request, ctx: RouteContext<"/api/t/[token]/submit">) {
  const { token } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  return toResponse(await submitAttempt(token, body));
}
