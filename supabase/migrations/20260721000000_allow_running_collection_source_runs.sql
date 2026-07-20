ALTER TABLE collection_source_runs
  DROP CONSTRAINT IF EXISTS collection_source_runs_run_status_check;

ALTER TABLE collection_source_runs
  ADD CONSTRAINT collection_source_runs_run_status_check
  CHECK (run_status IN ('running','success','partial','error','empty'));
