# AI KPI Measurement

Use this workflow to capture automatic baseline numbers for planning material.
Accuracy still requires the golden-set workflow in `docs/ai_baseline_evaluation.md`.

## Run the KPI Report

```bash
pnpm --filter posterlink-crawler kpi:measure -- --days=30 --output=data/baseline/ai_kpi_report.json
```

The report includes:

- published-poster embedding coverage
- field verification guard coverage
- review-queue quality-gate reject candidates
- recent crawler run duration, throughput, and per-item processing time
- optional semantic-search API latency

## Run The Phase 6 AI Usage Report

Measure the actual `ai_usage_log` ledger without modifying the database:

```bash
pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-report.json
```

The report includes stage/model/operation/status totals plus derived routing
health metrics:

- `rule_call_share`
- `cheap_text_call_share`
- `high_text_call_share`
- `vlm_call_share`
- `high_cost_call_share`
- `high_cost_unit_share`
- `failure_rate`
- `skipped_rate`
- `unlinked_recent_row_share`

If `call_count` is 0, the usage ledger is present but no recent writer has
inserted rows. In that case, run the dry-run router below to estimate the next
cost-reduction target before enabling more model calls.

## Run The Phase 6 Model Routing Dry-Run

Estimate which incomplete fields would use rule, cheap text, high text, or VLM
stages:

```bash
pnpm ai:routing -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/ai-model-routing-dryrun.json
```

This report is read-only. It is used to find fields that should be solved by
rules or cheaper models before any high-cost model expansion.

## Measure Semantic API Latency

Start the web app, then pass its base URL:

```bash
pnpm --filter posterlink-crawler kpi:measure -- --base-url=http://localhost:4000
```

Custom search probes can be separated by `|`:

```bash
pnpm --filter posterlink-crawler kpi:measure -- --queries="startup grant|small business fund"
```

Generated reports are written under `data/`, which is ignored by git.

## Run The Automated Quality Gate

Run the same read-only gate used after the daily crawler upload:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --enforce --output=data/results/ai-healthcheck.json
```

The default coverage floors are 99% for embeddings, 45% for field
verification, and 20% for image AI. Application-form source keys, review reject
candidates, image non-poster or low-confidence candidates, field correction
candidates, and published/review non-poster candidates must all remain at zero.

The command writes its full report before returning exit code 2 on a gate
failure. Override coverage floors with `--min-embedding-coverage`,
`--min-field-coverage`, and `--min-image-coverage` when deliberately raising
the operating baseline.

## Backfill Field Verification

Use dry-run first:

```bash
pnpm --filter posterlink-crawler verify:backfill -- --limit=25
```

Apply in small batches because this may call the OpenAI field verifier:

```bash
pnpm --filter posterlink-crawler verify:backfill -- --limit=10 --apply
```
