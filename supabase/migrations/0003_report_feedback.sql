-- 4단계: 개인 리포트의 AI 피드백 (담당자 확인 후 공개)
-- 0002_attempt_flow.sql 다음에 SQL Editor 에서 실행한다.
--
-- feedback 형태:
-- { "status": "draft" | "approved", "summary": "...", "actions": [{ "title", "detail", "chapter" }],
--   "model", "generated_at", "approved_by", "approved_at", "stale", "basis": { "total", "practice" } }
-- 결과(detail)를 다시 계산해도 피드백은 따로 보존되도록 별도 칸에 둔다.
alter table public.results add column if not exists feedback jsonb;
