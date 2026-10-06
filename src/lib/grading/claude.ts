// Claude API 로 서술형 1차 채점. 서버 전용 (ANTHROPIC_API_KEY 는 서버 환경 변수에만 둔다).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { EssayItem } from "../exam/items";
import type { Rubric } from "../exam/answer-key.data";
import { buildUserPrompt, SYSTEM_PROMPT, type GraderOutput } from "./grade";

export const GRADER_MODEL = "claude-opus-5-5";

export class GraderError extends Error {}

let client: Anthropic | null = null;

function outputSchema(rubric: Rubric) {
  const keys = rubric.criteria.map((c) => c.key) as [string, ...string[]];
  return z.object({
    criteria: z.array(
      z.object({
        key: z.enum(keys),
        score: z.number().int().min(1).max(4),
        reason: z.string(),
        quotes: z.array(z.string()),
      }),
    ),
    summary: z.string(),
  });
}

export interface ClaudeGrade {
  output: GraderOutput;
  model: string; // 실제로 응답한 모델 (fallback 이 동작하면 요청한 모델과 다를 수 있다)
  raw: Record<string, unknown>;
}

export async function gradeWithClaude(item: EssayItem, rubric: Rubric, answer: string): Promise<ClaudeGrade> {
  client ??= new Anthropic({ maxRetries: 3, timeout: 180_000 });

  const response = await client.beta.messages.parse({
    model: GRADER_MODEL,
    max_tokens: 16000,
    // 채점 일관성이 중요해 effort 를 high 로 둔다 (Opus 5.5 기본값은 medium)
    output_config: { effort: "high", format: betaZodOutputFormat(outputSchema(rubric)) },
    // 안전 분류기가 요청을 거절하면 서버에서 다른 모델로 다시 실행한다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(item, rubric, answer) }],
  });

  if (response.stop_reason === "refusal") {
    throw new GraderError(`모델이 채점을 거절했습니다 (${response.stop_details?.category ?? "unknown"}).`);
  }
  if (response.stop_reason === "max_tokens") throw new GraderError("모델 출력이 길이 한도에서 잘렸습니다.");
  const output = response.parsed_output;
  if (!output) throw new GraderError("모델 출력을 해석하지 못했습니다.");

  return {
    output,
    model: response.model,
    raw: { output, stop_reason: response.stop_reason, usage: response.usage, id: response.id },
  };
}
