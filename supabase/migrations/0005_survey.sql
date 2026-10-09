-- 응시 후 설문: 제출한 응시자에게 짧은 설문(난이도·시간·문항 이해도 등)을 받는다. 파일럿 운영과 문항 개선에 쓴다.
-- 0004_retake.sql 다음에 SQL Editor 에서 실행한다. 다시 실행해도 안전하다.

-- ── 시험별 설정: 설문 받기 (기본 끔) ─────────────────────
alter table public.exams add column if not exists collect_survey boolean not null default false;

-- ── 설문 응답: 응시 1건당 1개 ───────────────────────────
create table if not exists public.attempt_surveys (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  answers jsonb not null, -- { "difficulty": 1~5, "time": 1~5, "clarity": 1~5, "usability": 1~5, "relevance": 1~5 }
  had_issue boolean not null default false, -- 응시 중 오류·불편이 있었는지
  issue text check (issue is null or length(issue) <= 1000),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.attempt_surveys enable row level security;
revoke all on public.attempt_surveys from anon, authenticated;
grant select on public.attempt_surveys to authenticated;
grant all on public.attempt_surveys to service_role;
drop policy if exists "admin read surveys" on public.attempt_surveys;
create policy "admin read surveys" on public.attempt_surveys for select to authenticated using (public.is_admin());

-- ── 재응시: 보관본에 설문도 함께 남긴다 (0004 의 함수를 바꿈) ─────
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
    ), '[]'::jsonb),
    'survey', (select to_jsonb(s) from public.attempt_surveys s where s.attempt_id = a.id)
  ) into snap;

  insert into public.attempt_archives (candidate_id, attempt_id, status, grade, reason, archived_by, snapshot)
  values (p_candidate_id, a.id, a.status, (select grade from public.results where attempt_id = a.id), btrim(p_reason), p_admin, snap);

  -- responses · ai_gradings · final_gradings · results · attempt_surveys 는 on delete cascade 로 함께 지워진다
  delete from public.attempts where id = a.id;
  update public.candidates set retake_until = p_retake_until where id = p_candidate_id;
  return true;
end;
$$;

revoke all on function public.reset_attempt(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reset_attempt(uuid, text, uuid, timestamptz) to service_role;
