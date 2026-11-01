-- A window without observations is unknown, never a measured zero burn rate.
ALTER TABLE slo_error_budget_history ALTER COLUMN burn_rate DROP NOT NULL;
