# ai-exam

신입사원 대상 AI 역량 시험 앱입니다. 응시 → 객관식 자동 채점 + 서술형 AI 1차 채점 → 담당자 확정 → 개인 리포트·관리자 결과 목록까지 다룹니다.

- 설계안: [docs/design.md](docs/design.md)
- 교재: genai-book Ch 1~11 (GenAI Education Project, https://github.com/Zakedu/genai-book, MIT License). 교재 내용을 바탕으로 문항을 새로 썼고, 장 제목과 요인 체계를 참고했습니다. 저작권 고지: [NOTICE.md](NOTICE.md)
- 기술: Next.js 16 + TypeScript + Tailwind, Supabase(Postgres), Claude API, Vercel 배포

## 진행 현황

- [x] 1단계: 요인 체계, 문항 은행(객관식 24 · 자기평가 8 · 서술형 3), 채점 기준표, 채점 엔진, 응답 신뢰도, DB 스키마
- [x] 2단계: 응시 화면(안내·동의, 타이머, 문항 이동, 자동 임시 저장, 마감 자동 제출) + 객관식 자동 채점 + 응답 신뢰도 저장
- [x] 3단계: 서술형 AI 1차 채점(Claude API, 근거 인용 검증) + 관리자 로그인 + 담당자 리뷰·확정 + 결과 계산 + AI-담당자 일치율
- [x] 4단계: 개인 리포트(동기 분포·상위 %, 유형, 자기평가 비교, AI 성장 피드백 + 담당자 승인) + 관리자 결과 목록(필터)
- [x] 5단계: 시험 생성 마법사(기본 설정 → 응시 사이트 → 대상자 → 안내문 → 시험 열기) + 대상자 엑셀 업로드 + 안내문 작성·내보내기
- [x] 6단계: 정합성 점검(전체 결과 독립 재계산), 권한·보안 점검, 운영 정리, 데모 준비

## 구조

| 경로 | 내용 |
|---|---|
| `src/lib/exam/factors.ts` | 상위 3 · 중위 8 · 하위 16 요인과 교재 장 |
| `src/lib/exam/items.ts` | 공개 문항 (정답 없음, 응시 화면에서도 사용) |
| `src/lib/exam/answer-key.ts` | 정답 키·채점 기준표 (`server-only`, 클라이언트에서 import 하면 빌드 실패) |
| `src/lib/exam/scoring.ts` | 8단계 등급, 3×3 유형, 요인 점수, 자기평가 차이, 강점·약점, 복습할 장, 동기 내 상위 % |
| `src/lib/exam/reliability.ts` | 응답 신뢰도 (응답 시간, 일렬 응답, 자기평가 무변별, 붙여넣기, 분량) |
| `src/lib/attempt/responses.ts` | 응답 검증·병합, 제출 시 객관식 채점과 응답 신뢰도 판정 |
| `src/lib/attempt/timing.ts` | 응시 기간, 제한 시간 마감(+60초 여유), 응시 시간 계산 |
| `src/lib/attempt/service.ts` | 응시 흐름(서버 전용): 링크 확인 → 시작 → 임시 저장 → 제출, 저장소 선택 |
| `src/lib/attempt/supabase-store.ts` · `memory-store.ts` | Supabase(PostgREST) 저장소 · 개발용 메모리 저장소 |
| `src/app/t/[token]` | 응시 화면 (안내·동의 → 응시 → 제출 완료) |
| `src/app/api/t/[token]/{start,responses,submit}` | 응시 시작 · 임시 저장(PUT) · 제출 API |
| `src/lib/grading/grade.ts` | 채점 프롬프트, 모델 출력 검증(인용이 응답 원문에 있는지 확인), 개발용 가짜 채점, 일치율 |
| `src/lib/grading/claude.ts` | Claude API 호출 (`claude-opus-5-5`, 구조화 출력, 거절 시 서버 측 fallback) |
| `src/lib/grading/service.ts` | AI 1차 채점 실행(제출 직후 `after()`), 담당자 확정, 결과 재계산 |
| `src/lib/admin/` | 관리자 로그인(Supabase Auth), 토큰 서명 검증(JWKS), 세션 쿠키 |
| `src/proxy.ts` | 관리자 화면 요청 전 만료가 가까운 로그인 토큰 갱신 |
| `src/app/admin` | 관리자 로그인, 서술형 채점 목록, 응시자별 채점 리뷰 |
| `src/lib/report/` | 리포트 계산(동기 분포·상위 %, 비교 인원 5명 미만이면 숨김), 결과 목록 필터 |
| `src/lib/feedback/` | 성장 피드백: 프롬프트, Claude 호출, 결과 확정 시 초안 생성, 담당자 승인 |
| `src/lib/exam/simulate.ts` | 가상 응시자 생성 (결정적 난수) |
| `src/components/report/report.tsx` | 개인 리포트 화면 (응시자·관리자 공용) |
| `src/app/admin/(console)/results` | 결과 목록(필터), 개인 리포트 + 피드백 확인·승인 |
| `src/lib/exams/` | 시험 설정 검증(KST 입력, D-day), 대상자 엑셀 검증·읽기(`exceljs`), 안내문 치환·문자 바이트 계산, 시험 관리 서비스 |
| `src/app/admin/(console)/exams` | 시험 목록, 새 시험, 단계별 설정(기본·응시 사이트·대상자·안내문), 양식 내려받기, 안내문 CSV |
| `scripts/crosscheck.py` · `export-scoring-config.mts` | 정합성 점검: 채점 규칙을 앱과 별개로 구현해 DB 결과와 대조 |
| `scripts/seed-cohort.mts` | 시험에 가상 동기 응시자를 넣거나(`--count`) 지우는(`--remove`) 스크립트 |
| `supabase/migrations/0001_init.sql` | 테이블, 권한, RLS 정책 |
| `supabase/migrations/0002_attempt_flow.sql` | 임시 저장·제출 함수(`save_responses`, `submit_attempt`), `results` 를 객관식만 채점된 상태로도 저장 |
| `supabase/migrations/0003_report_feedback.sql` | `results.feedback` (성장 피드백 저장) |
| `supabase/migrations/0004_retake.sql` | 재응시: 이전 응시 보관(`attempt_archives`), 대상자별 재응시 마감(`candidates.retake_until`), `reset_attempt` · `clear_archive_scores` 함수 |
| `supabase/seed/demo.sql` | 데모 시험 1개 + 응시자 3명 (응시 링크용 `access_token` 출력) |

## 개발

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
npm test                     # 단위 테스트 (Supabase 통합 테스트는 STORE_IT_* 환경 변수가 있을 때만)
```

Supabase 서버 키(`SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_SECRET_KEY`)가 없으면 `npm run dev` 는 **메모리 저장소**로 동작합니다. 첫 화면에 데모 응시 링크(`/t/demo`, `/t/demo2`, `/t/demo3`)가 나오고, 서버를 다시 켜면 초기화됩니다. `EXAM_STORE=memory|supabase` 로 강제할 수 있고, 프로덕션에서는 키가 없으면 메모리로 넘어가지 않고 오류를 냅니다.

메모리 저장소 모드의 관리자 화면(`/admin`)은 데모 계정 `admin@demo.local` / `demo1234` 로 들어갑니다. Claude API 키가 없으면 개발 환경에서는 **가짜 채점**(키워드 기반, 모델명 `fake-grader`)으로 흐름을 시험할 수 있고, 화면에 "개발용 가짜 채점"으로 표시됩니다. `AI_GRADER=claude|fake` 로 강제할 수 있고, 프로덕션에서는 키가 없으면 가짜 채점으로 넘어가지 않습니다(담당자가 직접 채점해 확정할 수는 있습니다).

응시 흐름
- 안내·동의 → 시작하면 `attempts` 생성(1인 1회). 제한 시간은 `시작 + time_limit_min` 과 응시 기간 종료 중 이른 시각입니다.
- 순서는 자기평가 → 객관식 → 서술형입니다. 자기평가가 객관식을 풀고 난 인상에 끌리지 않도록 먼저 받습니다.
- 답을 바꾸면 1초 뒤, 문항을 옮길 때, 15초마다, 탭을 떠날 때 바뀐 응답만 저장합니다. 문항별 응답 시간은 화면에 떠 있던 누적 시간이고(다른 탭을 보는 동안은 제외), 서술형 붙여넣기는 한 번이라도 있으면 기록이 남습니다.
- 제출하거나 시간이 끝나면 객관식 지식 점수와 응답 신뢰도를 계산해 `attempts.reliability`, `results`(status `grading`)에 저장합니다. 마감 + 60초가 지난 요청의 응답은 받지 않고, 마감 뒤 링크를 다시 열면 저장된 응답으로 자동 제출합니다.

서술형 채점 흐름
- 제출 응답을 보낸 뒤(`after()`) 서술형 3문항을 병렬로 AI 1차 채점해 `ai_gradings` 에 저장합니다. 이름·사번은 보내지 않고 문항·기준표·답안만 보냅니다. 답안 안의 지시는 따르지 않도록 프롬프트에 명시했습니다.
- 모델은 기준별 1~4점, 판단 이유, 근거 인용을 구조화 출력으로 돌려줍니다. 문항 점수는 모델이 아니라 기준별 점수로 서버가 계산하고, 인용이 답안 원문에 실제로 있는지 확인해 없으면 화면에 경고로 표시합니다. 빈 답안은 모델을 부르지 않고 모든 기준 1점입니다.
- 세 문항의 AI 채점이 끝나면 상태가 "검토 대기"가 됩니다. 실패한 문항은 리뷰 화면의 "AI 채점 실행/다시 채점"으로 다시 돌릴 수 있습니다.
- 담당자는 리뷰 화면에서 기준별 점수를 확정합니다. AI 점수와 다르게 확정하면 사유가 필수입니다. 세 문항이 모두 확정되면 실전·종합 점수, 등급, 유형을 계산해 `results`(status `complete`)에 저장합니다. 확정 점수를 고치면 결과도 다시 계산합니다.
- 채점 목록 상단에 AI-담당자 일치율(확정된 기준 중 AI 점수와 같은 비율)을 보여 줍니다.

시험 생성과 대상자·안내문
- `/admin/exams` 에서 새 시험을 만들면 초안으로 저장되고, ① 기본 설정(시험명, 응시 기간 · 한국 시간) → ② 응시 사이트(제한 시간, 안내 문구, 결과 공개) → ③ 대상자 → ④ 안내문 순서로 채웁니다. 대상자 1명 이상, 안내문 1개 이상, 마감 전이어야 **시험 열기**가 됩니다.
- 대상자는 엑셀 양식(.xlsx)을 내려받아 올립니다. 올리면 먼저 미리보기로 행별 오류(필수값, 사번 중복, 이메일·휴대폰·입사일 형식)를 보여 주고, 확인을 눌러야 저장합니다. 이미 있는 사번은 정보만 바뀌고 응시 링크는 그대로입니다. 응시 기록이 있는 대상자는 지울 수 없고, 응시가 시작된 시험은 제한 시간을 바꿀 수 없습니다.
- 안내문은 메일(제목+본문)·문자 두 가지이며 `$이름$ $시험명$ $응시 시작$ $응시 기한$ $제한 시간$ $응시 URL$` 을 대상자별로 바꿉니다. 문자는 한글 2바이트·영문 1바이트 기준으로 SMS(90바이트)·LMS(2,000바이트)를 표시합니다. 실제 발송은 하지 않고, 대상자별로 치환한 내용을 CSV(엑셀용 BOM 포함)로 내려받아 사내 발송 도구에 넣습니다.
- 응시 링크 주소는 `APP_URL` 환경 변수가 있으면 그 값을, 없으면 접속한 주소를 씁니다.

개인 리포트와 결과 목록
- 세 문항이 모두 확정되면 결과 공개 시험(`show_result`)의 응시자는 같은 응시 링크에서 리포트를 봅니다: 종합 등급·점수, 3×3 유형, 강점·보완할 점, 역량별 점수와 동기 분포, 자기평가 vs 실제, 성장 피드백, 복습할 장.
- 동기 비교(상위 %, 분포)는 같은 시험에서 결과가 확정된 인원이 5명 이상일 때만 보여 줍니다.
- 결과가 확정되면 Claude 가 성장 피드백 초안(요약 + 실천 제안 3개)을 만듭니다. 이름·사번은 보내지 않습니다. 담당자가 관리자 리포트 화면에서 고치고 **승인하고 공개**를 눌러야 응시자에게 보입니다. 승인 뒤 확정 점수가 바뀌면 "다시 생성 권장"으로 표시합니다.
- 관리자 결과 목록(`/admin/results`)은 미응시자까지 포함하고 시험·이름/사번·소속·기수·상태·응답 신뢰도·등급으로 거를 수 있습니다.
- 동기 분포를 데모로 보려면 `npx tsx scripts/seed-cohort.mts --exam <exam_id> --count 30` 으로 가상 응시자(사번 `SIM-`)를 넣고, `--remove` 로 지웁니다. 메모리 저장소 모드에는 가상 응시자 30명이 들어 있습니다.

## Supabase 설정

1. SQL Editor 에서 `supabase/migrations/0001_init.sql`, `0002_attempt_flow.sql`, `0003_report_feedback.sql`, `0004_retake.sql` 을 차례로 실행 (데모가 필요하면 `supabase/seed/demo.sql` 도)
2. Authentication 에서 관리자 계정을 만든 뒤(Auto Confirm User 체크) `admins` 테이블에 등록
   ```sql
   insert into public.admins (user_id, name) values ('<auth.users 의 id>', '관리자 이름');
   ```
3. Vercel 프로젝트 환경 변수에 `.env.example` 의 값 등록 (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` 는 서버 전용). 서버 키는 레거시 `service_role` 키(JWT)나 새 Secret key(`sb_secret_...`) 모두 됩니다. Publishable/anon 키로는 응시 API 가 동작하지 않습니다.

접근 모델: 응시자는 로그인 없이 개인별 링크(`access_token`)로 서버를 거쳐서만 DB에 접근하고, `anon` 역할에는 권한이 없습니다. 관리자는 Supabase Auth 로그인 + `admins` 등록이 필요합니다.

## 운영 가이드

배포 주소: https://ai-exam-lime.vercel.app (관리자: `/admin`)

### 시험 진행 순서
1. **관리자 추가**: Supabase Authentication → Add user(Auto Confirm User 체크) → SQL Editor 에서
   ```sql
   insert into public.admins (user_id, name) select id, '이름' from auth.users where email = '이메일';
   ```
   관리자를 빼려면 `delete from public.admins where user_id = (select id from auth.users where email = '이메일');`
2. **시험 만들기** (`/admin/exams`): 기본 설정 → 응시 사이트 → 대상자(엑셀) → 안내문 → **시험 열기**
3. **안내**: 안내문 CSV 를 내려받아 사내 메일·문자 도구로 보낸다 (앱은 직접 보내지 않음)
4. **채점** (`/admin/grading`): 제출 후 1분 안에 AI 1차 채점이 끝나면 "검토 대기". 담당자가 문항별로 확정한다
5. **리포트** (`/admin/results`): 세 문항이 확정되면 리포트가 생기고 AI 성장 피드백 초안이 만들어진다. 확인 후 **승인하고 공개**하면 결과 공개 시험의 응시자가 자기 응시 링크에서 본다
6. **재응시** (필요할 때): 아래 "재응시" 참고
7. **마감**: 응시 기간이 끝나면 자동으로 응시를 받지 않는다. 시험 화면의 **마감하기**로 일찍 닫을 수도 있다

### 재응시
응시 중 오류 등으로 다시 봐야 하는 대상자는 시험의 **대상자** 화면에서 그 사람 줄의 **재응시**를 누른다.
- **재응시 사유는 필수**다. 나중에 오류 원인을 찾을 때 쓴다.
- 이전 응시(응답 원문, AI 채점, 확정 점수, 결과)는 지우지 않고 `attempt_archives` 에 보관한다. 대상자는 **같은 응시 링크**로 처음부터 다시 응시한다. 응시 중이던 화면은 다음 자동 저장 때 첫 화면으로 돌아간다.
- 시험이 **열려 있을 때만** 허용할 수 있다. 응시 기간이 끝났거나 남은 기간이 제한 시간보다 짧으면 **재응시 마감**(한국 시간)을 정해야 하고, 그 대상자만 그때까지 응시할 수 있다.
- 이전 응시는 동기 비교(상위 %, 분포)와 결과 목록에서 빠진다. 대상자 목록에는 "재응시 n회"로 표시되고, **재응시 기록**에서 보관 시각·당시 상태·등급·사유를 볼 수 있다.
- 재응시 점수가 **확정된 뒤** **이전 채점 기록 삭제**를 누르면 보관본의 AI 채점·확정 점수·결과만 지운다. 응답 원문과 사유는 남는다. 되돌릴 수 없다.
- 이전 응시 기록이 있는 대상자는 삭제할 수 없다.
- 보관본 전체(JSON)는 SQL Editor 에서 `select reason, archived_at, snapshot from public.attempt_archives order by archived_at desc;` 로 본다.

### 환경 변수 (Vercel)
| 이름 | 용도 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 주소 |
| `SUPABASE_ANON_KEY` | 관리자 로그인용 공개 키 (Publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 Secret key. 절대 `NEXT_PUBLIC_` 을 붙이지 않는다 |
| `ANTHROPIC_API_KEY` | 서술형 AI 채점·성장 피드백 |
| `APP_URL` | 응시 링크·안내문에 쓸 주소 |

### 비용 (Claude API, 실측)
- 서술형 1차 채점: 응시자 1명(3문항)당 약 $0.13 (`claude-opus-5-5`, 문항당 입력 약 2,000 · 출력 약 1,400~2,100 토큰 기준)
- 성장 피드백: 결과 확정 시 1회 + 다시 생성할 때마다 1회
- Anthropic Console 에서 월 사용 한도를 정해 두는 것을 권장한다

### 정합성 점검
```bash
npx tsx scripts/export-scoring-config.mts > /tmp/scoring-config.json
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python3 scripts/crosscheck.py /tmp/scoring-config.json
```
저장된 모든 결과(지식·실전·상위요인·종합 점수, 등급, 유형, 서술형 기준 환산, 상태)를 독립 계산과 대조하고, 불일치가 있으면 종료 코드 1로 끝난다. 재응시한 대상자는 점검에서 빼고, 뺀 인원을 따로 출력한다.

### 보안 점검 요약
- DB: `anon` 은 모든 테이블·함수 접근 거부. 로그인했지만 관리자가 아닌 사용자는 행 단위 보안으로 0건 조회, 쓰기 거부. 응시 저장·제출 함수는 서버(service_role)만 호출
- 앱: 관리자 화면·Server Action·내려받기는 모두 관리자 확인(로그인 토큰 서명 검증 + `admins` 등록). 응시 링크 토큰은 192비트 난수
- 응답 헤더: 클릭재킹 방지, `nosniff`, 응시 링크·관리자 화면은 `no-referrer`·검색 제외
- 안내문 CSV 는 수식으로 실행될 수 있는 칸(`=`, `+`, `-`, `@` 시작)을 글자로 바꾼다

### 데모 데이터 정리 (실제 운영 전에)
- 가상 동기 30명: `npx tsx scripts/seed-cohort.mts --exam <데모 시험 ID> --remove`
- 데모 응시자(사번 `DEMO-`)·데모 시험: 응시 기록이 없으면 대상자 화면에서 삭제. 데모 시험 자체는 SQL Editor 에서 `delete from public.exams where id = '<ID>';` (대상자·응시·결과가 함께 지워진다)
- 데모 관리자 계정: `admins` 에서 지우고 Supabase Authentication 에서 사용자 삭제
