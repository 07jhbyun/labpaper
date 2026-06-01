-- 방문자 통계 테이블
-- Supabase 대시보드 SQL Editor에서 실행하세요

create table page_views (
  id         uuid        default gen_random_uuid() primary key,
  page       text        not null,        -- 'home' | 'all' | 'bookmarks' | 'best'
  session_id text        not null,
  visited_at timestamptz default now()
);

-- 인덱스 (통계 쿼리 성능)
create index page_views_visited_at_idx on page_views (visited_at desc);
create index page_views_page_idx       on page_views (page);

alter table page_views enable row level security;

-- 방문자는 insert만 가능, 읽기는 서비스 롤만
create policy "방문자 기록 허용" on page_views
  for insert with check (true);
