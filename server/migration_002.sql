-- FSS Review Platform — migration 002
-- Run this in Supabase → SQL Editor (after schema.sql was already run once)

-- MP/RM self-declares (checkbox) that >=50% of the plan achievement came from
-- non-reimbursement products, per Incentive Policy FY'27. Defaults to true so
-- existing reports aren't blocked; master or RM can uncheck it during review.
alter table reports add column if not exists non_reimbursement_ok boolean not null default true;

-- quick lookup index for the RM bonus aggregation query (by MP's rm_id + period)
create index if not exists idx_reports_period on reports(period_year, period_month);
