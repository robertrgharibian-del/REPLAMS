-- FSS Review Platform — migration 003
-- Run in Supabase → SQL Editor (after migration_002.sql)

-- ---- Doctor CONVERSION tracker (per product, per report/month) ----
create table if not exists report_conversion (
  id                      bigserial primary key,
  report_id               bigint not null references reports(id) on delete cascade,
  product_id              bigint not null references products(id),
  doctor_name             text not null,
  current_rx_per_week     numeric(10,2) not null default 0,
  competitor_rx_per_week  numeric(10,2) not null default 0,
  competitor_reason       text,
  mp_action_plan          text,
  target_rx_per_week      numeric(10,2) not null default 0,
  start_date              date,
  control_date            date,
  created_at              timestamptz not null default now()
);

-- ---- Doctor POTENTIAL-INCREASE tracker (per product, per report/month) ----
create table if not exists report_potential (
  id                        bigserial primary key,
  report_id                 bigint not null references reports(id) on delete cascade,
  product_id                bigint not null references products(id),
  doctor_name               text not null,
  current_potential_per_week numeric(10,2) not null default 0,
  reason_not_treating       text,
  mp_action_plan            text,
  target_rx_per_week        numeric(10,2) not null default 0,
  start_date                date,
  control_date              date,
  created_at                timestamptz not null default now()
);

-- ---- Weekly reminder tracking (so the cron job doesn't re-send every day) ----
create table if not exists reminder_log (
  id           bigserial primary key,
  entity_type  text not null check (entity_type in ('conversion','potential')),
  entity_id    bigint not null,
  sent_at      timestamptz not null default now()
);
create index if not exists idx_reminder_entity on reminder_log(entity_type, entity_id, sent_at desc);

create index if not exists idx_conversion_report on report_conversion(report_id);
create index if not exists idx_potential_report on report_potential(report_id);

-- ---- Import audit log (who uploaded what, when) ----
create table if not exists import_log (
  id           bigserial primary key,
  import_type  text not null check (import_type in ('fss','targets')),
  period_year  int not null,
  period_month int, -- null for target imports (whole FY at once)
  uploaded_by  bigint not null references users(id),
  summary      jsonb,
  created_at   timestamptz not null default now()
);
