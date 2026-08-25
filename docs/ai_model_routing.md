# AI Model Routing

This is the Phase 6 foundation from `AI_VERIFICATION_SPEC.md`.

The goal is to prevent AI cost from scaling linearly with the number of
collection sources. Fields should be handled by the cheapest safe stage first,
then escalated only when current evidence is missing or below threshold.

## Stages

- Stage 0, `rule`: deterministic rules, regex, URL parsing, existing trusted evidence
- Stage 1, `cheap_text`: low-cost text model for category, region, content type, and short descriptive fields
- Stage 2, `high_text`: stronger text model only for low-confidence critical or hard fields
- Stage 3, `vlm`: image model only for ambiguous real-poster detection

## Commands

Dry-run current routing pressure:

```bash
pnpm ai:routing -- --limit=5000 "--statuses=published,review" --output=data/eval/reports/ai-model-routing-dryrun.json
```

The report includes:

- current poster/evidence counts
- planned action count by stage, including free Stage 0 rule work
- planned model call count, excluding Stage 0 rule work
- planned action count by field
- estimated internal cost units
- sample `ai_usage_log` rows for future writers

This command only reads the database and writes a local report.

Read actual usage already written by jobs:

```bash
pnpm ai:usage -- --days=14 --output=data/eval/reports/ai-usage-report.json
```

The usage report includes:

- total call count, token count, image count, and internal cost units
- usage grouped by stage, operation, model, and status
- a recent linkage sample showing rows linked to `posters.id`, rows linked
  through candidate/sighting metadata, and rows with no object link

This command only reads `ai_usage_log` and `ai_usage_daily_overview` and writes
a local report.

## Usage Log Schema

Migration `20260825010000_add_ai_usage_log.sql` prepares:

- `public.ai_usage_log`
- `public.ai_usage_daily_overview`

The table is admin-readable through RLS and intentionally has no browser write
policy. Production application requires explicit approval before `supabase db
push`.

`estimated_unit_cost` is an internal unit, not a hard-coded provider price.
Writers can configure real pricing or relative weights without changing the
database shape.

Current writers:

- crawler upload: `notice_facts_extraction`, `poster_relevance_route`,
  `deadline_parse_fallback`, `poster_embedding`
- crawler VLM handoff: `is_real_poster`, `poster_content_verification`,
  `poster_ocr`
- image classification backfill: `is_real_poster`
- field verification backfill: `field_verification`
- poster embedding backfill: `poster_embedding`
- Naver blog ingester: `poster_relevance_route`, `deadline_parse_fallback`
- Edge `process-ocr`: code writes `process_ocr` usage rows after deployment

## Field Feedback Escalation

Process repeated field reports in dry-run mode:

```bash
pnpm field-reports:process -- --threshold=2 --output=data/results/field-report-escalation-dryrun.json
```

Apply after explicit approval:

```bash
pnpm field-reports:process -- --threshold=2 --output=data/results/field-report-escalation-apply.json --apply
```

`--apply` only touches groups where the same `poster_id + field_key` has at
least the threshold number of `received` or `reviewing` reports. It:

- sets matching non-human `poster_field_evidence.confidence` to `0`
- moves published posters back to `review`
- marks the matched reports as `reviewing`
- writes an `admin_actions` audit row
