# 2026-09-12 Taste4Seasons case analysis

## Case

- Poster ID: `051da197-6860-44da-8d48-5e3d287995fd`
- Title: `[모집] [2026 마포구 동네배움터] 맛4시즌즈: 가을 다실 참가자 모집`
- Source: 구립마포청소년문화의집
- Official notice: `https://www.mycc.or.kr/p_community/sub01.php?ptype=view&idx=22748&page=&code=notice2025`
- Apply link: `https://forms.gle/2u2vaVoFRH9wV4Lt6`

## Correct Data

The user's saved correction is correct.

- Application period:
  - Start: 2026-09-11
  - End: 2026-09-21
  - Source evidence: `모집 기간 2026. 9. 11.(금) 오후 4시 ~ 9. 21.(월) 오후 6시`
- Event/course period:
  - Start: 2026-10-06
  - End: 2026-10-27
  - Source evidence: `운영 일시 2026. 10. 6.(화) / 10. 13.(화) / 10. 20.(화) / 10. 24.(토) / 10. 27.(화)`
- Deadline type:
  - `fixed`
- Category:
  - `CAT_COURSE` / `교육강좌`
  - Source evidence: `차를 배우고 블렌딩하며 즐기는 가을 티 블렌딩 클래스`, `총 5회기`

## Why This Is The Right Classification

This is not primarily a welfare/family notice. The audience is `마포구 지역주민 8명`, not children, parents, or family units.
The host site is a youth center, but the program content is a learning course:

- tea learning
- tea blending
- class format
- five-session operation
- material fee
- fixed course venue

Therefore `교육강좌` is the correct primary category.

## Why The Automated Data Was Wrong

The rule classifier over-weighted the source/site/category word `청소년`.

Before the fix, the same source text classified as:

- `CAT_FAMILY`
- confidence `0.95`
- evidence: `source category: 청소년, category: 청소년, content: 청소년, site: 청소년`

That means the classifier was treating the collection source and host institution as stronger than the actual program content.
For this record, that is wrong because `청소년문화의집` is only the operating institution/site context. It should not force a family/youth category when the body clearly says it is a course.

The date extraction was mostly safer because it identified the true application deadline as 2026-09-21, but it still left `date-without-year` review metadata due to abbreviated later dates in the operation schedule.
The important separation is:

- `모집 기간` -> application fields
- `운영 일시` -> event/course fields

## Fix Applied

- Updated `scripts/crawler/src/poster-classifier.js`
  - If source/category maps to `CAT_FAMILY` because of youth/family wording, but the body clearly has educational-course evidence, `CAT_COURSE` now overrides it.
- Added regression test in `scripts/crawler/src/poster-rules.test.js`
  - `youth-center tea blending class stays education instead of family`

## Verification

- Reproduced pre-fix behavior:
  - `CAT_FAMILY` was incorrectly selected from `청소년` source evidence.
- Confirmed post-fix behavior:
  - `CAT_COURSE` is now selected with evidence from class/course content.
- `pnpm --filter posterlink-crawler test`
  - 312 passed
