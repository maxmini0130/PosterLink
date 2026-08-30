# 2026-08-30 Category Data Corrections

## Summary

- Audited production poster category links for current `published` and `closed` posters.
- Confirmed 2,297 public/archive rows had no missing `poster_categories` links.
- Found and corrected 10 rows that had only `CAT_OTHER`.
- Found and corrected 6 rows where `CAT_OTHER` remained alongside a more specific category.
- Applied 16 source-reviewed category corrections with `poster_categories`, `posters.field_verification.classification`, and `poster_field_evidence.category`.
- Removed `CAT_OTHER` from corrected public/archive rows when a specific category was assigned.
- Recomputed exposure tiers for 521 published posters after category evidence updates.

## Corrected Rows

- `02a333be-28dc-4f10-8151-f34b3cfe9f12`: `CAT_EVENT_RECRUIT`, `CAT_CULTURE`
- `5120f542-bc57-4e78-b437-2c21df38f337`: `CAT_EVENT_RECRUIT`
- `476b1201-ab94-4324-9bf7-d0ab6e8fc01a`: `CAT_COURSE`, `CAT_EDUCATION`
- `24d2a373-982e-42ca-840a-dacdcad2ffc7`: `CAT_EVENT_RECRUIT`, `CAT_LIFE_INFO`
- `5a2d1c75-292f-4629-8474-3d78149ab2d9`: `CAT_SUPPORT_PROGRAM`, `CAT_WELFARE`
- `90773707-2250-4be3-84f9-0dd257b006b0`: `CAT_EVENT_RECRUIT`
- `3b6bda3a-d1f2-4016-b48c-48163908d542`: `CAT_EVENT_RECRUIT`, `CAT_HEALTH`
- `5fe52b3e-3433-46ef-9d35-a09056e92250`: `CAT_COURSE`, `CAT_EDUCATION`
- `7680f434-ccb0-44c9-b281-586ea6cce972`: `CAT_COURSE`, `CAT_CULTURE`
- `bcdf6bb8-f3d6-4e2d-847e-2dd87f3ef62a`: `CAT_CULTURE`, `CAT_LIFE_INFO`
- `1f286106-eb20-4d98-99b3-2e4f1928f08d`: `CAT_POLICY_INFO`
- `38bee2f8-ec92-4e89-aa03-cf702f88e6d3`: `CAT_SUPPORT_PROGRAM`, `CAT_EDUCATION`, `CAT_WELFARE`
- `4d56cc01-a53d-4a95-aef6-f4cac28f70ee`: `CAT_FAMILY`, `CAT_HEALTH`, `CAT_EVENT_RECRUIT`
- `4f2b6e37-3492-454e-8fec-eea8aec60d41`: `CAT_HEALTH`, `CAT_FAMILY`
- `94e2dfec-f886-4394-8820-62bdbf64cfed`: `CAT_SUPPORT_PROGRAM`, `CAT_EDUCATION`
- `f324f854-32e3-4ef6-bb62-2173d3be141b`: `CAT_CONTEST`

## Final Checks

- Public/archive category audit: checked 2,297, missing 0, `CAT_OTHER` only 0, `CAT_OTHER` links 0, correction evidence 16.
- `pnpm --filter posterlink-crawler apply:other-category-corrections`
- `pnpm --filter posterlink-crawler apply:other-category-corrections -- --apply`
- `pnpm --filter posterlink-crawler tier:compute -- "--statuses=published" --apply "--output=data/eval/reports/exposure-tier-category-corrections-apply.json"`
- `pnpm --filter posterlink-crawler audit:public-counts`
- `pnpm --filter posterlink-crawler ai:healthcheck`
- `pnpm --filter posterlink-crawler test`
