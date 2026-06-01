-- 이메일 중복 발송 방지 로그 테이블
-- Supabase 대시보드 SQL Editor에서 실행하세요

create table email_logs (
  id          uuid        default gen_random_uuid() primary key,
  issue_number integer    not null unique,   -- unique → 같은 호 중복 insert 시 에러
  recipients  integer     not null default 0,
  sent_at     timestamptz default now()
);

-- 서비스 롤(백엔드)만 접근
alter table email_logs enable row level security;
