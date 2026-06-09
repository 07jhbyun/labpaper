create table email_logs (
  id           uuid        default gen_random_uuid() primary key,
  issue_number integer     not null unique,
  recipients   integer     not null default 0,
  sent_at      timestamptz default now()
);

alter table email_logs enable row level security;
