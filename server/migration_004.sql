-- FSS Review Platform — migration 004
-- Run in Supabase → SQL Editor (after migration_003.sql)

alter table report_conversion add column if not exists doctor_specialty text;
alter table report_conversion add column if not exists lpu_name text;

alter table report_potential add column if not exists doctor_specialty text;
alter table report_potential add column if not exists lpu_name text;

-- "why this brand underperformed" note, filled by MP when a brand is in the red
alter table reports add column if not exists underperformance_note text;
