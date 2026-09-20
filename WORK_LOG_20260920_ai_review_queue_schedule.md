# 2026-09-20 AI Review Queue Schedule

## Summary

- Added `.github/workflows/ai-review-queue.yml` to inspect the review queue automatically after the daily crawler.
- Added a 15:00 KST fallback schedule and a report-only manual dispatch mode.
- Scheduled and post-crawler runs apply only decisions that pass the strict automatic approval gate.

## Automatic Approval Gate

- AI confidence is at least `0.85`.
- The AI reports no unresolved concerns.
- At least one valid category is selected.
- No duplicate issue is present.
- No high-risk date issue is present: missing year, weekday mismatch, conflicting dates, open-ended period, deadline mismatch, or end-before-start.
- Rows that fail any gate remain in `review` and appear in the uploaded report artifact.

## Operations

- Required repository secrets: `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY`.
- Optional repository variable: `OPENAI_REVIEW_QUEUE_MODEL` (defaults to `gpt-5-mini`).
- Workflow reports are retained for 30 days.
