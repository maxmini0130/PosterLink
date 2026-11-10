# 날짜만 있는 마감이 마감일 오전에 닫히는 문제 (2026-11-10)

상태: 검토 대기 · Claude Code · 기준 `1d1bb6d`(main)

## 문제

- 날짜만 있는 마감이 UTC 자정(서울 09:00)이나 서울 00:00으로 저장돼, 화면과 공개 검색(`application_end_at >= now()`)이 마감일 아침에 공고를 닫았다. 운영에서 `cde477b0`(본문 "11월 10일까지")이 11-10 0시부터 '마감됨'으로 보였다.
- 원인: 수집 경로는 `new Date('YYYY-MM-DD')`로 저장했고, 10-30 원문 검수 계획 파일이 포털 머리글의 "00 : 00"을 시각으로 옮겨 적었다. 같은 검수에서 "신청 종료는 포털 기준 11월 12일 00시입니다" 같은 요약 문장도 만들어졌다.

## 결정

- 날짜만 있는 마감은 서울 23:59:59로 저장한다. 시작일·행사일은 그대로 둔다.
- 운영 데이터는 원문(공고문·포털·포스터)과 대조한 공고만 고친다. 시각이 적힌 공고는 그대로 둔다. 대조 결과는 `scripts/crawler/src/date-only-deadline-manifest-20261110.js`.
- 청년몽땅 포털 머리글의 "00 : 00"은 시각이 없다는 기본 표기로 본다. 어댑터가 근거 문장에서 떼어낸다.
- 웹 배포를 바꾸지 않도록 Vercel Ignored Build Step(`scripts/vercel-ignore-build.sh`)을 둔다. scripts/·docs/·루트 *.md만 바뀌고 웹 빌드가 쓰는 두 파일(`build-crawler-bundles.mjs`, `notice-fact-normalizer.js`)이 그대로일 때만 건너뛴다.

## 변경

- `poster-structured-fields.js`, `upload-to-supabase.js`: `toApplicationEndIso`로 날짜만 있는 마감을 23:59:59 KST로 저장.
- `adapters/youth-seoul.js`: `stripPortalMidnight`.
- `repair-date-only-deadlines.js`(--manifest, --daily, --rollback), `repair-summary-sentences.js`: dry-run 기본, 백업, compare-and-set.
- `scripts/vercel-ignore-build.sh`.

## 검증

- 크롤러 테스트 345건 통과. 읽기 전용 운영 스냅샷으로 계획: 마감 24건, 요약 문장 3건.
- Ignored Build Step 스크립트를 실제 커밋 7개와 이번 변경으로 시험(크롤러 전용·문서 전용은 건너뜀, 웹 변경·웹이 쓰는 파일 변경·재배포는 빌드).

## 운영 보정 실행 (2026-11-10 12:50 KST, 사용자 직접 실행)

- 마감 24건: 24/24 반영. 백업 `data/results/repair-date-only-deadlines-manifest-2026-11-10T03-50-26-032Z.json`.
- 요약 문장 3건: 3/3 반영. 백업 `data/results/repair-summary-sentences-2026-11-10T03-51-12-722Z.json`.
- 값 정정 2건(v6.1 작업 폴더, `deadline-verification-backfill.js --step=2 --existing-columns-only`): 강사단 `daae5af9` 마감 11-20 18:00, 교육 12-03 13:30~12-17 17:00. 취업 코칭 `2e812cc9` 마감 11-10 09:00(포스터 "11월 10일(화) 오전 9시까지" 확인). 백업은 v6.1 작업 폴더 `data/results/deadline-verification-step2-2026-11-10T03-51-21-022Z.json`.
- 410b3a05: Supabase SQL 편집기로 `poster_status = closed`(1행).
- 읽기 전용 확인: 24건 모두 23:59:59(24312656은 19:00), `cde477b0`은 11-10 23:59:59이고 운영 상세 화면에 "오늘 마감 D-Day"로 보임.
- 남은 것: `980c16a1`, `f0065caf`의 `field_verification.readableNotice.summaryShort`에 예전 문장 사본이 남음. 웹 화면은 이 값을 읽지 않는다(`summary_short` 컬럼은 고쳐짐). 보정 대상에 넣을지는 별도 승인.

## 남은 작업

- 병합 뒤 Vercel 배포가 Ignored인지, Production이 그대로인지 확인.
- 수집 수정이 배포될 때까지 `--daily` 보정.
- 웹의 관리자 '크롤러 실행'은 건너뛴 배포 동안 예전 수집 코드를 쓴다.
