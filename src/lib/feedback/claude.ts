// Claude API 로 개인 리포트 피드백 초안을 만든다 (서버 전용).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CHAPTERS } from "../exam/factors";
import { ACTION_COUNT, FEEDBACK_SYSTEM, type FeedbackOutput } from "./feedback";

export const FEEDBACK_MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

const schema = z.object({
  summary: z.string(),
  actions: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        chapter: z.enum([...(Object.keys(CHAPTERS) as [string, ...string[]]), "none"]),
      }),
    )
    .min(1)
    .max(ACTION_COUNT + 1),
});

export async function feedbackWithClaude(prompt: string): Promise<{ output: FeedbackOutput; model: string }> {
  client ??= new Anthropic({ maxRetries: 3, timeout: 180_000 });
  const response = await client.beta.messages.parse({
    model: FEEDBACK_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: FEEDBACK_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") throw new Error(`모델이 피드백 작성을 거절했습니다 (${response.stop_details?.category ?? "unknown"}).`);
  if (response.stop_reason === "max_tokens") throw new Error("모델 출력이 길이 한도에서 잘렸습니다.");
  if (!response.parsed_output) throw new Error("모델 출력을 해석하지 못했습니다.");
  return { output: response.parsed_output, model: response.model };
}
