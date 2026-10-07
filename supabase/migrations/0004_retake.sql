-- 재응시: 오류 등으로 응시를 다시 해야 하는 대상자에게 관리자가 재응시를 허용한다.
-- 0003_report_feedback.sql 다음에 SQL Editor 에서 실행한다.
--
-- attempts 는 1인 1회(candidate_id unique)를 유지한다. 재응시를 허용하면 이전 응시(응답·AI 채점·확정 점수·결과)를
-- attempt_archives 에 통째로 보관한 뒤 attempts 에서 지운다. 대상자는 같은 응시 링크로 처음부터 다시 응시한다.

-- ── 대상자별 재응시 마감 ───────────────────────────────
-- 시험 응시 기간이 끝난 뒤 재응시를 허용할 때, 그 대상자만 이 시각까지 응시할 수 있다.
alter table public.candidates add column if not exists retake_until timestamptz;

-- ── 이전 응시 보관 ─────────────────────────────────────
create table if not exists public.attempt_archives (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  attempt_id uuid not null, -- 보관 전 attempts.id (원래 행은 지워진다)
  status text not null, -- 보관 시점의 응시 상태
  grade text, -- 보관 시점의 등급 (확정 전이면 null)
  reason text not null check (length(btrim(reason)) between 1 and 500),
  archived_by uuid references auth.users (id),
  archived_at timestamptz not null default now(),
  scores_cleared_at timestamptz, -- 재응시 점수 확정 뒤 이전 AI 채점·확정 점수를 지운 시각
  snapshot jsonb not null -- { attempt, result, responses: [{ ..., ai_gradings: [], final_grading }] }
);
create index if not exists attempt_archives_candidate_idx on public.attempt_archives (candidate_id, archived_at desc);

alter table public.attempt_archives enable row level security;
revoke all on public.attempt_archives from anon, authenticated;
grant select on public.attempt_archives to authenticated;
grant all on public.attempt_archives to service_role;
drop policy if exists "admin read archives" on public.attempt_archives;
create policy "admin read archives" on public.attempt_archives for select to authenticated using (public.is_admin());

-- ── 재응시 허용 ───────────────────────────────────────
-- 응시 행을 잠근 뒤 보관하고 지운다. 같은 행을 잠그는 save_responses·submit_attempt 와 순서대로 처리된다.
-- 응시 기록이 없으면 false.
create or replace function public.reset_attempt(p_candidate_id uuid, p_reason text, p_admin uuid, p_retake_until timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  a public.attempts%rowtype;
  snap jsonb;
begin
  select * into a from public.attempts where candidate_id = p_candidate_id for update;
  if not found then
    return false;
  end if;

  select jsonb_build_object(
    'attempt', to_jsonb(a),
    'result', (select to_jsonb(r) from public.results r where r.attempt_id = a.id),
    'responses', coalesce((
      select jsonb_agg(
        to_jsonb(x) || jsonb_build_object(
          'ai_gradings', coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at) from public.ai_gradings g where g.response_id = x.id), '[]'::jsonb),
          'final_grading', (select to_jsonb(f) from public.final_gradings f where f.response_id = x.id)
        ) order by x.item_id)
      from public.responses x where x.attempt_id = a.id
    ), '[]'::jsonb)
  ) into snap;

  insert into public.attempt_archives (candidate_id, attempt_id, status, grade, reason, archived_by, snapshot)
  values (p_candidate_id, a.id, a.status, (select grade from public.results where attempt_id = a.id), btrim(p_reason), p_admin, snap);

  -- responses · ai_gradings · final_gradings · results 는 on delete cascade 로 함께 지워진다
  delete from public.attempts where id = a.id;
  update public.candidates set retake_until = p_retake_until where id = p_candidate_id;
  return true;
end;
$$;

revoke all on function public.reset_attempt(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reset_attempt(uuid, text, uuid, timestamptz) to service_role;

-- ── 이전 채점 기록 삭제 ─────────────────────────────────
-- 재응시 점수가 확정된 뒤(앱에서 확인) 보관본의 AI 채점·확정 점수·결과만 지운다.
-- 응답 원문과 재응시 사유는 오류 원인을 확인할 수 있도록 남긴다. 이미 지웠거나 없으면 false.
create or replace function public.clear_archive_scores(p_archive_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.attempt_archives
    set snapshot = (snapshot - 'result') || jsonb_build_object(
          'responses',
          coalesce((select jsonb_agg(r - 'ai_gradings' - 'final_grading') from jsonb_array_elements(snapshot -> 'responses') r), '[]'::jsonb)
        ),
        grade = null,
        scores_cleared_at = now()
    where id = p_archive_id and scores_cleared_at is null;
  return found;
end;
$$;

revoke all on function public.clear_archive_scores(uuid) from public, anon, authenticated;
grant execute on function public.clear_archive_scores(uuid) to service_role;
