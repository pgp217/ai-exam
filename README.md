# ai-exam

신입사원 대상 AI 역량 시험 앱입니다. 응시 → 객관식 자동 채점 + 서술형 AI 1차 채점 → 담당자 확정 → 개인 리포트·관리자 결과 목록까지 다룹니다.

- 설계안: [docs/design.md](docs/design.md)
- 교재: [genai-book](https://zakedu.github.io/genai-book/) Ch 1~11
- 기술: Next.js 16 + TypeScript + Tailwind, Supabase(Postgres), Claude API, Vercel 배포

## 진행 현황

- [x] 1단계: 요인 체계, 문항 은행(객관식 24 · 자기평가 8 · 서술형 3), 채점 기준표, 채점 엔진, 응답 신뢰도, DB 스키마
- [x] 2단계: 응시 화면(안내·동의, 타이머, 문항 이동, 자동 임시 저장, 마감 자동 제출) + 객관식 자동 채점 + 응답 신뢰도 저장
- [x] 3단계: 서술형 AI 1차 채점(Claude API, 근거 인용 검증) + 관리자 로그인 + 담당자 리뷰·확정 + 결과 계산 + AI-담당자 일치율
- [x] 4단계: 개인 리포트(동기 분포·상위 %, 유형, 자기평가 비교, AI 성장 피드백 + 담당자 승인) + 관리자 결과 목록(필터)
- [ ] 5단계: 시험 생성 마법사 + 엑셀 업로드 + 안내문 작성
- [ ] 6단계: 정합성 점검, 배포, 데모 링크

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
| `scripts/seed-cohort.mts` | 시험에 가상 동기 응시자를 넣거나(`--count`) 지우는(`--remove`) 스크립트 |
| `supabase/migrations/0001_init.sql` | 테이블, 권한, RLS 정책 |
| `supabase/migrations/0002_attempt_flow.sql` | 임시 저장·제출 함수(`save_responses`, `submit_attempt`), `results` 를 객관식만 채점된 상태로도 저장 |
| `supabase/migrations/0003_report_feedback.sql` | `results.feedback` (성장 피드백 저장) |
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

개인 리포트와 결과 목록
- 세 문항이 모두 확정되면 결과 공개 시험(`show_result`)의 응시자는 같은 응시 링크에서 리포트를 봅니다: 종합 등급·점수, 3×3 유형, 강점·보완할 점, 역량별 점수와 동기 분포, 자기평가 vs 실제, 성장 피드백, 복습할 장.
- 동기 비교(상위 %, 분포)는 같은 시험에서 결과가 확정된 인원이 5명 이상일 때만 보여 줍니다.
- 결과가 확정되면 Claude 가 성장 피드백 초안(요약 + 실천 제안 3개)을 만듭니다. 이름·사번은 보내지 않습니다. 담당자가 관리자 리포트 화면에서 고치고 **승인하고 공개**를 눌러야 응시자에게 보입니다. 승인 뒤 확정 점수가 바뀌면 "다시 생성 권장"으로 표시합니다.
- 관리자 결과 목록(`/admin/results`)은 미응시자까지 포함하고 시험·이름/사번·소속·기수·상태·응답 신뢰도·등급으로 거를 수 있습니다.
- 동기 분포를 데모로 보려면 `npx tsx scripts/seed-cohort.mts --exam <exam_id> --count 30` 으로 가상 응시자(사번 `SIM-`)를 넣고, `--remove` 로 지웁니다. 메모리 저장소 모드에는 가상 응시자 30명이 들어 있습니다.

## Supabase 설정

1. SQL Editor 에서 `supabase/migrations/0001_init.sql`, `0002_attempt_flow.sql`, `0003_report_feedback.sql` 을 차례로 실행 (데모가 필요하면 `supabase/seed/demo.sql` 도)
2. Authentication 에서 관리자 계정을 만든 뒤(Auto Confirm User 체크) `admins` 테이블에 등록
   ```sql
   insert into public.admins (user_id, name) values ('<auth.users 의 id>', '관리자 이름');
   ```
3. Vercel 프로젝트 환경 변수에 `.env.example` 의 값 등록 (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` 는 서버 전용). 서버 키는 레거시 `service_role` 키(JWT)나 새 Secret key(`sb_secret_...`) 모두 됩니다. Publishable/anon 키로는 응시 API 가 동작하지 않습니다.

접근 모델: 응시자는 로그인 없이 개인별 링크(`access_token`)로 서버를 거쳐서만 DB에 접근하고, `anon` 역할에는 권한이 없습니다. 관리자는 Supabase Auth 로그인 + `admins` 등록이 필요합니다.
