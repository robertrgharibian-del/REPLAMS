-- FSS Review Platform — migration 005
-- Run in Supabase → SQL Editor (after migration_004.sql)

create table if not exists ai_insights (
  id          bigserial primary key,
  scope       text not null check (scope in ('mp','rm','master')),
  scope_id    bigint,                 -- mp/rm user id; null for master (company-wide)
  content     jsonb not null,
  model       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ai_insights_scope on ai_insights(scope, scope_id, created_at desc);
