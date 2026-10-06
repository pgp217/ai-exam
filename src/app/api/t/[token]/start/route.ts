import { startAttempt } from "@/lib/attempt/service";
import { toResponse } from "../respond";

export async function POST(_req: Request, ctx: RouteContext<"/api/t/[token]/start">) {
  const { token } = await ctx.params;
  return toResponse(await startAttempt(token));
}
