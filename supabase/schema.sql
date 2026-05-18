-- LabPaper Supabase Schema
-- Supabase 대시보드 SQL Editor에서 실행하세요

-- 논문 테이블
create table papers (
  id uuid default gen_random_uuid() primary key,
  issue_number integer not null,
  title text not null,
  authors text not null,
  journal text not null,
  journal_tier text not null check (journal_tier in ('crown', 'top', 'high', 'mid', 'applied')),
  year integer not null,
  doi text,
  abstract text,
  summary_bullets text[] not null default '{}',
  image_url text,
  related_papers jsonb default '[]',
  source text not null check (source in ('auto', 'manual')),
  created_at timestamptz default now()
);

-- 주간 이슈 테이블
create table issues (
  id uuid default gen_random_uuid() primary key,
  issue_number integer not null unique,
  published_at date not null,
  horoscope jsonb not null default '{}',
  created_at timestamptz default now()
);

-- 반응 테이블 (완전 익명 — session_id만 저장)
create table reactions (
  id uuid default gen_random_uuid() primary key,
  paper_id uuid references papers(id) on delete cascade,
  session_id text not null,
  reaction_type text not null check (reaction_type in ('why_here', 'life_paper', 'must_cite', 'gpt_wrote', 'star')),
  star_value integer check (star_value between 1 and 5),
  created_at timestamptz default now(),
  unique(paper_id, session_id, reaction_type)
);

-- 팔로우 저자 테이블
create table followed_authors (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  scholar_id text,
  affiliation text,
  research_area text,
  status text not null default 'active' check (status in ('active', 'pending', 'rejected')),
  suggested_by text default 'admin',
  created_at timestamptz default now()
);

-- 저자 제안 테이블 (학생 익명 제안)
create table author_suggestions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  scholar_url text,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz default now()
);

-- 타겟 저널 테이블
create table target_journals (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  issn text,
  tier text not null check (tier in ('top', 'field', 'applied')),
  active boolean default true
);

-- 기본 팔로우 저자 데이터
insert into followed_authors (name, affiliation, research_area, status) values
  ('Kai A.I. Zhang', 'Fudan University', 'conjugated polymer photocatalysis', 'active'),
  ('Markus Antonietti', 'Max Planck Institute', 'photocatalysis, carbon nitride', 'active'),
  ('Andrew I. Cooper', 'University of Liverpool', 'porous organic polymers', 'active'),
  ('Arne Thomas', 'TU Berlin', 'porous polymers, CTF', 'active'),
  ('Donglin Jiang', 'NUS', 'COF, porous materials', 'active'),
  ('Menachem Elimelech', 'Yale', 'membrane, water treatment', 'active'),
  ('Haotian Wang', 'Rice University', 'electrocatalysis, H2O2', 'active'),
  ('Rahul Banerjee', 'IIT Bombay', 'COF, water treatment', 'active'),
  ('Oleksandr Savateev', 'Max Planck Institute', 'photocatalysis', 'active'),
  ('Bettina Lotsch', 'Max Planck Institute', 'COF, photocatalysis', 'active'),
  ('Wonyong Choi', 'POSTECH', 'photocatalysis, water treatment', 'active'),
  ('Bien Tan', 'HUST', 'porous polymers', 'active'),
  ('Hangxun Xu', 'USTC', 'conjugated polymers', 'active'),
  ('Edward Sargent', 'Northwestern', 'electrocatalysis', 'active'),
  ('Hai-Long Jiang', 'USTC', 'MOF, catalysis', 'active'),
  ('Cafer T. Yavuz', 'KAIST', 'porous polymers', 'active'),
  ('Iain McCulloch', 'Oxford', 'conjugated polymers', 'active'),
  ('Chanhee Boo', 'Columbia', 'membrane', 'active');

-- 기본 타겟 저널 데이터
insert into target_journals (name, tier) values
  ('Nature', 'top'),
  ('Science', 'top'),
  ('Journal of the American Chemical Society', 'top'),
  ('Angewandte Chemie International Edition', 'top'),
  ('Advanced Materials', 'top'),
  ('Advanced Functional Materials', 'field'),
  ('ACS Nano', 'field'),
  ('Energy & Environmental Science', 'field'),
  ('ACS Catalysis', 'field'),
  ('Chemical Engineering Journal', 'field'),
  ('Journal of Membrane Science', 'applied'),
  ('Water Research', 'applied'),
  ('Applied Catalysis B: Environmental', 'applied'),
  ('Journal of Hazardous Materials', 'applied'),
  ('Desalination', 'applied'),
  ('Small', 'field'),
  ('Chemistry of Materials', 'field'),
  ('ChemCatChem', 'applied');

-- reactions 집계 뷰
create view paper_reaction_counts as
select
  paper_id,
  count(*) filter (where reaction_type = 'why_here') as why_here_count,
  count(*) filter (where reaction_type = 'life_paper') as life_paper_count,
  count(*) filter (where reaction_type = 'must_cite') as must_cite_count,
  count(*) filter (where reaction_type = 'gpt_wrote') as gpt_wrote_count,
  round(avg(star_value) filter (where reaction_type = 'star'), 1) as avg_stars,
  count(*) filter (where reaction_type = 'star') as star_count
from reactions
group by paper_id;

-- 이메일 구독자 테이블
create table subscribers (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text not null default '',
  active boolean not null default true,
  created_at timestamptz default now()
);

-- RLS (Row Level Security) — 읽기는 모두, 쓰기는 익명도 가능
alter table papers enable row level security;
alter table issues enable row level security;
alter table reactions enable row level security;
alter table followed_authors enable row level security;
alter table author_suggestions enable row level security;
alter table target_journals enable row level security;

create policy "누구나 읽기 가능" on papers for select using (true);
create policy "누구나 읽기 가능" on issues for select using (true);
create policy "누구나 반응 가능" on reactions for all using (true);
create policy "누구나 저자 읽기" on followed_authors for select using (true);
create policy "누구나 제안 가능" on author_suggestions for insert with check (true);
create policy "누구나 저널 읽기" on target_journals for select using (true);

-- subscribers는 서비스 롤(관리자)만 접근
alter table subscribers enable row level security;
