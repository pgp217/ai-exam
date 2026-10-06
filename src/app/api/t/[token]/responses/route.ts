import { saveResponses } from "@/lib/attempt/service";
import { readJson, toResponse } from "../respond";

// 임시 저장. 바뀐 응답만 보낸다: { responses: [{ item_id, answer, response_ms, pasted }] }
export async function PUT(req: Request, ctx: RouteContext<"/api/t/[token]/responses">) {
  const { token } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  return toResponse(await saveResponses(token, body));
}
