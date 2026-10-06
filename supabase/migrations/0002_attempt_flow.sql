-- 2단계: 응시 흐름 (임시 저장, 제출, 객관식 자동 채점 결과 저장)
-- 0001_init.sql 다음에 SQL Editor 에서 실행한다.

-- ── results: 서술형 확정 전에도 객관식 점수를 저장할 수 있게 ─────
-- 제출 시점에는 지식 점수(객관식)만 확정되고, 실전 점수·종합·등급·유형은 서술형 확정 후 채운다.
alter table public.results
  alter column practice_score drop not null,
  alter column total drop not null,
  alter column grade drop not null,
  alter column ai_type drop not null,
  add column status text not null default 'grading' check (status in ('grading', 'complete'));

-- ── 응답 임시 저장 ─────────────────────────────────────
-- 응시 중(in_progress)인 시도에만 저장한다. 제출과 동시에 들어온 저장 요청이
-- 제출된 응답을 덮어쓰지 않도록 시도 행을 잠근 뒤 상태를 확인한다.
-- p_responses: [{ "item_id": "Q01", "answer": {"value": 2}, "response_ms": 8000, "pasted": false }, ...]
create or replace function public.save_responses(p_attempt_id uuid, p_responses jsonb)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  perform 1 from public.attempts where id = p_attempt_id and status = 'in_progress' for update;
  if not found then
    return false;
  end if;

  insert into public.responses (attempt_id, item_id, answer, response_ms, pasted, updated_at)
  select p_attempt_id, r.item_id, r.answer, r.response_ms, coalesce(r.pasted, false), now()
  from jsonb_to_recordset(coalesce(p_responses, '[]'::jsonb))
    as r (item_id text, answer jsonb, response_ms integer, pasted boolean)
  on conflict (attempt_id, item_id) do update
    set answer = excluded.answer,
        response_ms = excluded.response_ms,
        -- 한 번이라도 붙여넣기가 있었으면 유지한다
        pasted = public.responses.pasted or excluded.pasted,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

-- ── 제출 ───────────────────────────────────────────────
-- 마지막 응답 저장, 시도 상태 변경, 객관식 채점 결과 저장을 한 트랜잭션에서 처리한다.
-- 이미 제출된 시도면 아무것도 바꾸지 않고 false 를 돌려준다.
create or replace function public.submit_attempt(
  p_attempt_id uuid,
  p_responses jsonb,
  p_duration_sec integer,
  p_reliability jsonb,
  p_knowledge_score numeric,
  p_detail jsonb
)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  if not public.save_responses(p_attempt_id, p_responses) then
    return false;
  end if;

  update public.attempts
    set status = 'submitted',
        submitted_at = now(),
        duration_sec = p_duration_sec,
        reliability = p_reliability
    where id = p_attempt_id;

  insert into public.results (attempt_id, knowledge_score, detail, status)
  values (p_attempt_id, p_knowledge_score, p_detail, 'grading')
  on conflict (attempt_id) do update
    set knowledge_score = excluded.knowledge_score,
        detail = excluded.detail,
        status = excluded.status,
        computed_at = now();

  return true;
end;
$$;

-- 서버(service_role)만 호출한다.
revoke all on function public.save_responses(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid, jsonb, integer, jsonb, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.save_responses(uuid, jsonb) to service_role;
grant execute on function public.submit_attempt(uuid, jsonb, integer, jsonb, numeric, jsonb) to service_role;
