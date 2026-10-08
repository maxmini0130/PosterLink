# 2026-10-08 검수대기 날짜·카테고리 검증

## 작업 개요

- 검수대기 64건의 대표 이미지를 캐시 없이 다시 판독했다.
- 저장된 원문 전문, 공식 상세 URL, 포스터 문구를 기준으로 모집일·행사일·마감 유형·카테고리를 항목별로 확인했다.
- 날짜는 `Asia/Seoul`, 기준일은 2026-10-08로 판정했다.
- 운영 DB 반영은 사용자의 명시적 승인 범위에서 수행했다.

## 처리 결과

- 최초 검수대기: 64건
- 대표 이미지 판독: 포스터 64건, 비포스터 0건, 실패 0건
- 최종 상태
  - `published`: 59건
  - `closed`: 2건
  - `rejected`: 3건
- 최종 검수대기: 0건
- 카테고리 누락: 0건

## 날짜·카테고리 검증

- 2020년 또는 2023년으로 잘못 추정된 연도 미표기 일정은 원문 요일을 2026년 달력과 대조해 교정했다.
  - 10월 19일 월요일, 10월 21일 수요일, 10월 22일 목요일
  - 10월 11일 일요일, 10월 15일 목요일
  - 11월 10일 화요일, 11월 13일 금요일, 11월 17일 화요일, 11월 20일 금요일
- `그린코디네이터 자격 취득 프로그램`의 원문 종료연도 `2025`는 시작일·게시 맥락·요일과 상충하는 오기로 판단해 2026-10-18로 교정했다.
- 도서관 선착순 접수와 청년 커피 창업 교육은 임의 마감일을 만들지 않고 `until_exhausted`로 기록했다.
- 행사 개최일을 신청 마감일로 저장한 항목은 신청일을 비우고 행사일로 분리했다.
- `가족돌봄청소년·청년 자기돌봄비` 포스터는 직접 판독해 2026-10-01부터 연중 상시 모집, 연 200만 원 지원을 확인했다.
- 교육·상담·공모·행사·지원사업의 실제 내용에 맞춰 64건의 카테고리를 재검토했다.

## 제외 및 제목 보정

- `불량 LPG 용기 회수 안내`: 2015년 행정 안내로 서비스 대상 제외
- `2026년 계량기(저울) 정기검사 실시 안내`: 신청·모집 기회가 아닌 행정 안내로 제외
- 마포구 재게시 `가족돌봄청소년·청년 자기돌봄비 지원사업 모집 안내`: 기존 서울시복지재단 항목과 포스터·사업명·신청기간·지원내용이 같은 중복으로 제외
- 기관명만 있거나 오타가 있던 제목 5건을 원문 프로그램명으로 보정했다.

## 검증 명령

```powershell
pnpm --filter posterlink-crawler image:backfill -- --limit=500 --concurrency=5 --statuses=review --force --apply --output=../../data/results/image-classification-review-force-20261008.json
pnpm --filter posterlink-crawler review:current-queue-ai -- --limit=500 --output=../../data/results/review-queue-ai-review-20261008.json
$env:OPENAI_REVIEW_QUEUE_MODEL='gpt-5'; pnpm --filter posterlink-crawler review:current-queue-ai -- --limit=500 --batch-size=5 --output=../../data/results/review-queue-ai-review-gpt5-20261008.json
pnpm --filter posterlink-crawler review:current-queue-ai -- --limit=500 --input=../../data/results/review-queue-manual-verified-20261008.json --output=../../data/results/review-queue-manual-verified-dry-run-20261008.json
pnpm --filter posterlink-crawler review:current-queue-ai:apply -- --limit=500 --input=../../data/results/review-queue-manual-verified-20261008.json --output=../../data/results/review-queue-manual-verified-applied-20261008.json --confirm=AI_REVIEW_APPROVE_QUEUE
pnpm --filter posterlink-crawler review:current-queue-ai -- --limit=500 --evidence-only --output=../../data/results/review-queue-evidence-after-20261008.json
pnpm --filter posterlink-crawler audit:public-counts
```

## 최종 감사

- evidence-only 재조회: `review_count: 0`
- 공개 포스터 수: 292건
- 공개 검색 반환 수: 292건
- 공개 수와 검색 반환 수 일치: `true`
- 전체 상태: `published` 598건, `review` 0건, `rejected` 65건, `closed` 2333건
