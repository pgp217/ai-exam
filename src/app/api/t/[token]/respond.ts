import type { ActionResult } from "@/lib/attempt/service";

const MAX_BODY_BYTES = 256 * 1024;

export async function readJson(req: Request): Promise<unknown | Response> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "요청이 너무 큽니다." }, { status: 413 });
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: "JSON 형식이 아닙니다." }, { status: 400 });
  }
}

export function toResponse(r: ActionResult): Response {
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status });
}
