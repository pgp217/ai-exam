// AI 채점·피드백에 쓸 모델 호출 방식 선택
// AI_GRADER=claude | fake. 지정하지 않으면 ANTHROPIC_API_KEY 가 있을 때 claude,
// 없으면 개발 환경에서만 fake(가짜 채점). 프로덕션에서는 가짜 채점으로 넘어가지 않는다.
export function graderMode(): "claude" | "fake" | "none" {
  const explicit = process.env.AI_GRADER;
  if (explicit === "claude" || explicit === "fake") return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return process.env.NODE_ENV === "production" ? "none" : "fake";
}

