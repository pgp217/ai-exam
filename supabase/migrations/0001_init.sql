-- ai-exam 초기 스키마
-- 프로젝트 설정: "Automatically expose new tables" 끔, "Enable automatic RLS" 켬.
-- 따라서 테이블마다 권한(GRANT)과 RLS 정책을 직접 지정한다.
--
-- 접근 모델
--   * 관리자: Supabase Auth 로그인 + admins 테이블에 등록된 사용자 (authenticated 역할 + RLS)
--   * 응시자: 로그인 없음. 개인별 access_token 링크로 서버(API Route)만 접근하며,
--             서버는 service_role 키로 DB에 접근한다. anon 역할에는 아무 권한도 주지 않는다.
-- 문항·정답·채점 기준표는 앱 코드(src/lib/exam)에 있고, DB에는 item_id 와 item_set_version 만 저장한다.

create extension if not exists pgcrypto;

-- ── 관리자 ─────────────────────────────────────────────
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ── 시험 ───────────────────────────────────────────────
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_limit_min integer not null default 40 check (time_limit_min between 5 and 240),
  intro_text text not null default '',
  show_result boolean not null default false, -- 응시자에게 리포트 공개 여부
  item_set_version text not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- ── 대상자 ─────────────────────────────────────────────
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  employee_no text not null,
  name text not null,
  email text,
  phone text,
  department text,
  cohort text, -- 입사 기수 (예: 2026-하반기)
  joined_at date,
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exam_id, employee_no)
);
create index candidates_exam_idx on public.candidates (exam_id);

-- ── 응시 ───────────────────────────────────────────────
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates (id) on delete cascade, -- 1인 1회 응시
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  duration_sec integer,
  reliability jsonb, -- { level, signals[] }
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'grading', 'complete'))
);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  item_id text not null,
  answer jsonb not null, -- 객관식/자기평가: {"value": 2}, 서술형: {"text": "..."}
  response_ms integer,
  pasted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (attempt_id, item_id)
);

-- ── 서술형 채점: AI 1차 의견과 담당자 확정을 분리 ──────────
create table public.ai_gradings (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  model text not null,
  prompt_version text not null,
  criterion_scores jsonb not null, -- {"elements": 3, ...}
  score numeric(5, 1) not null check (score between 0 and 100),
  rationale text not null,
  evidence jsonb not null default '[]', -- 응답 원문 인용 [{criterion, quote}]
  raw jsonb, -- 모델 원문 출력
  created_at timestamptz not null default now()
);
create index ai_gradings_response_idx on public.ai_gradings (response_id, created_at desc);

create table public.final_gradings (
  response_id uuid primary key references public.responses (id) on delete cascade,
  ai_grading_id uuid references public.ai_gradings (id),
  grader_id uuid not null references auth.users (id),
  criterion_scores jsonb not null,
  score numeric(5, 1) not null check (score between 0 and 100),
  override_reason text, -- AI 점수와 다르게 확정하면 필수 (앱에서 검증)
  confirmed_at timestamptz not null default now()
);

-- ── 결과 (계산 시점의 스냅숏) ──────────────────────────────
create table public.results (
  attempt_id uuid primary key references public.attempts (id) on delete cascade,
  knowledge_score numeric(5, 1) not null,
  practice_score numeric(5, 1) not null,
  total numeric(5, 1) not null,
  grade text not null,
  ai_type text not null,
  detail jsonb not null, -- scoreAttempt() 결과 전체
  computed_at timestamptz not null default now()
);

-- ── 안내문 ─────────────────────────────────────────────
create table public.notice_templates (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  subject text,
  body text not null,
  updated_at timestamptz not null default now(),
  unique (exam_id, channel)
);

-- ── 권한 ───────────────────────────────────────────────
-- anon: 권한 없음. authenticated: RLS 를 통과한 관리자만. service_role: 서버 전용(RLS 우회).
alter table public.admins enable row level security;
alter table public.exams enable row level security;
alter table public.candidates enable row level security;
alter table public.attempts enable row level security;
alter table public.responses enable row level security;
alter table public.ai_gradings enable row level security;
alter table public.final_gradings enable row level security;
alter table public.results enable row level security;
alter table public.notice_templates enable row level security;

revoke all on all tables in schema public from anon;

grant select on public.admins to authenticated;
grant select, insert, update, delete on public.exams, public.candidates, public.notice_templates to authenticated;
grant select on public.attempts, public.responses, public.ai_gradings, public.results to authenticated;
grant select, insert, update on public.final_gradings to authenticated;
grant all on all tables in schema public to service_role;

create policy "admins read self" on public.admins for select to authenticated using (user_id = auth.uid());

create policy "admin all exams" on public.exams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all candidates" on public.candidates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all notices" on public.notice_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admin read attempts" on public.attempts for select to authenticated using (public.is_admin());
create policy "admin read responses" on public.responses for select to authenticated using (public.is_admin());
create policy "admin read ai_gradings" on public.ai_gradings for select to authenticated using (public.is_admin());
create policy "admin read results" on public.results for select to authenticated using (public.is_admin());

create policy "admin read final" on public.final_gradings for select to authenticated using (public.is_admin());
create policy "admin confirm final" on public.final_gradings for insert to authenticated
  with check (public.is_admin() and grader_id = auth.uid());
create policy "admin update final" on public.final_gradings for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and grader_id = auth.uid());
