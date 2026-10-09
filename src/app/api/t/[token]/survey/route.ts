import { submitSurvey } from "@/lib/attempt/service";
import { readJson, toResponse } from "../respond";

// 응시 후 설문: { answers: { difficulty, time, clarity, relevance, usability }, had_issue, issue?, comment? }
export async function POST(req: Request, ctx: RouteContext<"/api/t/[token]/survey">) {
  const { token } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof Response) return body;
  return toResponse(await submitSurvey(token, body));
}
