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
- recent crawler run duration, throughput, and per-item processing time
- optional semantic-search API latency

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
