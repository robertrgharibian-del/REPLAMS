-- FSS Review Platform — migration 006
-- Run in Supabase → SQL Editor (after migration_005.sql)

-- ---- Password reset requests (goes to master, master sets new password) ----
create table if not exists password_reset_requests (
  id           bigserial primary key,
  user_id      bigint not null references users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','resolved')),
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz
);
create index if not exists idx_pw_reset_status on password_reset_requests(status);

-- ---- Import undo support: snapshot of previous values before each import overwrote them ----
alter table import_log add column if not exists changes jsonb;
alter table import_log add column if not exists reverted boolean not null default false;

-- ---- Doctor conversion/potential: month-over-month history ----
-- previous_target: last month's target for this same doctor+product (locked, carried forward)
-- actual_result: this month's report of how many Rx/week were actually achieved against that previous target
alter table report_conversion add column if not exists previous_target_rx_per_week numeric(10,2);
alter table report_conversion add column if not exists actual_result_rx_per_week numeric(10,2);
alter table report_potential add column if not exists previous_target_rx_per_week numeric(10,2);
alter table report_potential add column if not exists actual_result_rx_per_week numeric(10,2);
