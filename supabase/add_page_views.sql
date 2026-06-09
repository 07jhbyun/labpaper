create table page_views (
  id         uuid        default gen_random_uuid() primary key,
  page       text        not null,
  session_id text        not null,
  visited_at timestamptz default now()
);

create index page_views_visited_at_idx on page_views (visited_at desc);
create index page_views_page_idx       on page_views (page);

alter table page_views enable row level security;

create policy "방문자 기록 허용" on page_views
  for insert with check (true);
