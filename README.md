# ai-exam

신입사원 대상 AI 역량 시험 앱입니다. 응시 → 객관식 자동 채점 + 서술형 AI 1차 채점 → 담당자 확정 → 개인 리포트·관리자 결과 목록까지 다룹니다.

- 설계안: [docs/design.md](docs/design.md)
- 교재: [genai-book](https://zakedu.github.io/genai-book/) Ch 1~11
- 기술: Next.js 16 + TypeScript + Tailwind, Supabase(Postgres), Claude API, Vercel 배포

## 진행 현황

- [x] 1단계: 요인 체계, 문항 은행(객관식 24 · 자기평가 8 · 서술형 3), 채점 기준표, 채점 엔진, 응답 신뢰도, DB 스키마
- [ ] 2단계: 응시 화면 + 객관식 자동 채점 + 응답 신뢰도 저장
- [ ] 3단계: 서술형 AI 1차 채점 + 담당자 리뷰·확정
- [ ] 4단계: 개인 리포트 + 관리자 결과 목록
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
| `supabase/migrations/0001_init.sql` | 테이블, 권한, RLS 정책 |

## 개발

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev
npm test                     # 채점 로직 단위 테스트
```

## Supabase 설정

1. SQL Editor 에서 `supabase/migrations/0001_init.sql` 실행
2. Authentication 에서 관리자 계정을 만든 뒤 `admins` 테이블에 등록
   ```sql
   insert into public.admins (user_id, name) values ('<auth.users 의 id>', '관리자 이름');
   ```
3. Vercel 프로젝트 환경 변수에 `.env.example` 의 4개 값 등록 (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` 는 서버 전용)

접근 모델: 응시자는 로그인 없이 개인별 링크(`access_token`)로 서버를 거쳐서만 DB에 접근하고, `anon` 역할에는 권한이 없습니다. 관리자는 Supabase Auth 로그인 + `admins` 등록이 필요합니다.
