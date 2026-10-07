-- 데모용 시험 1개와 응시자 3명. 0001, 0002 마이그레이션 다음에 SQL Editor 에서 실행한다.
-- 마지막 select 결과의 access_token 으로 응시 링크(https://<배포 주소>/t/<access_token>)를 만든다.
with exam as (
  insert into public.exams (title, starts_at, ends_at, time_limit_min, intro_text, show_result, item_set_version, status)
  values (
    '2026 하반기 신입사원 AI 역량 시험 (데모)',
    now() - interval '1 day',
    now() + interval '30 days',
    40,
    '생성형 AI 활용 교재 Ch 1~11 내용을 바탕으로 생성형 AI 활용 역량을 확인합니다.',
    true,
    'NEWHIRE-AI-v1',
    'open'
  )
  returning id
)
insert into public.candidates (exam_id, employee_no, name, department, cohort)
select exam.id, c.employee_no, c.name, c.department, '2026-하반기'
from exam,
  (values ('D-001', '김하늘', '경영지원팀'), ('D-002', '이도윤', '영업1팀'), ('D-003', '박서연', '마케팅팀')) as c (employee_no, name, department);

select c.name, c.employee_no, c.access_token
from public.candidates c join public.exams e on e.id = c.exam_id
where e.title = '2026 하반기 신입사원 AI 역량 시험 (데모)'
order by c.employee_no;
