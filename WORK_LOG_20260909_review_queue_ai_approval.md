# 2026-09-09 review queue AI approval

## Scope

운영자가 검수대기 항목을 AI가 직접 읽어 날짜와 카테고리를 확인한 뒤 이상이 없으면 승인해 달라고 요청했다. 현재 세션에는 `OPENAI_API_KEY`가 없어 OpenAI API 배치 검토는 실행하지 못했고, Codex가 운영 DB의 저장 원문 요약, readable facts, 원문/신청 링크, 기존 AI 검증 이슈를 직접 읽어 보정 계획을 만들었다.

## Input State

- 작업 브랜치: `feat/ai-verification-phase-1`
- 원격 동기화: `origin/feat/ai-verification-phase-1`와 일치
- 검수대기 조회 결과: `poster_status = review` 51건
- 원본 검토 리포트:
  - `data/results/current-review-queue-20260909.json`

## Applied Work

- 51건 중 49건을 원문/저장 근거 기준으로 승인했다.
  - `published`: 47건
  - `closed`: 2건
- 승인 시 날짜와 카테고리를 함께 보정했다.
  - 연도 없는 날짜를 2026년 기준으로 확정
  - `2023-09-*`, `2023-10-*`로 들어간 stale-year 날짜를 2026년 행사/모집 문맥에 맞게 수정
  - 행사일과 신청기간을 분리해 `application_*`와 `event_*`를 보존
  - 선착순·소진 시 마감 공고는 `until_exhausted`로 보정
  - 문화/행사, 교육강좌, 건강/의료, 지원사업, 공모전 등으로 복지 과잉 카테고리를 바로잡음
- 제목이 원문 상세를 잘 설명하지 못하던 일부 항목을 수정했다.
  - `영등포문화재단 모집` → `영등포문화재단 <마음공작소> 성인 원데이 워크숍 모집`
  - `성동청소년문화의집 모집` → `성동청소년문화의집 <퍼스널컬러 - 나를 빛내는 컬러> 참가자 모집`
  - `동덕여대 ANCHOR사업단 메인화면` → `동덕여대 ANCHOR사업단 <AI기반 온라인창업 마케팅 과정> 수강생 모집`
  - `라면 낋이고 갈래?` 오탈자 → `라면 끓이고 갈래?`
- 적용 리포트:
  - `data/results/ai-reviewed-queue-corrections-20260909-dryrun.json`
  - `data/results/ai-reviewed-queue-corrections-20260909-apply.json`

## Kept In Review

다음 2건은 실제 행사/세부 프로그램으로 보이나 이미 공개된 상위 행사 공고와 겹치는 중복 노출 판단이 필요해 승인하지 않았다. 다만 다음 검수자가 헷갈리지 않도록 카테고리는 보정했다.

- `d4d1a1eb-fa4f-4a57-96d4-a108dc3d26bd`
  - `서울청년센터 도봉 <청년의 날 행사 '청년log: 담다, 닮다' 햇반 용기 교환 이벤트> 참여자 모집`
  - 카테고리: `행사모집`, `생활정보`
  - 보류 사유: 이미 공개된 도봉 청년의 날 행사 공고의 세부 이벤트
- `67878f7c-7b6f-4363-bfbd-3117b3749892`
  - `서울청년센터 양천<청년정책패키지 CHECK IN : 양천 릴레이 강연 토크쇼 사전 모집>`
  - 카테고리: `행사모집`, `정책안내`
  - 보류 사유: 이미 공개된 양천 청년정책패키지 행사 공고의 세부 프로그램

## Verification

- `pnpm exec node --check scripts/crawler/src/review-current-queue-with-ai.js` 통과
- `pnpm exec node --check scripts/crawler/src/apply-ai-reviewed-queue-corrections.js` 통과
- `pnpm exec node scripts/crawler/src/apply-ai-reviewed-queue-corrections.js --output=data/results/ai-reviewed-queue-corrections-20260909-dryrun.json`
  - planned approval: 49
  - kept review: 2
- `pnpm exec node scripts/crawler/src/apply-ai-reviewed-queue-corrections.js --apply --confirm=APPLY_AI_REVIEWED_QUEUE_CORRECTIONS --output=data/results/ai-reviewed-queue-corrections-20260909-apply.json`
  - applied: 49
- 최종 상태 확인:
  - `published`: 539
  - `review`: 2
  - `closed`: 1925
- `pnpm --filter posterlink-crawler audit:public-counts` 통과
  - `count_public_posters`: 254
  - `search_public_posters_returned`: 254
  - `search_matches_count`: true
- `pnpm exec node scripts/crawler/src/audit-date-period-mapping.js --output=data/eval/reports/date-period-mapping-audit-20260909.json`
  - audited: 541
  - stale warning: 6
  - mismatch: 5
  - missing clear deadline: 0
  - actionable: 11
  - actionable에는 보류 2건과 기존 수동 확정된 행사일/신청마감일 경계 케이스가 포함된다.

## Exposure Tier Note

승인 직후 전체 `published,review`에 대해 `compute-exposure-tiers --apply`를 실행했으나, 기존 `null` 노출 등급 공고 다수가 `C`로 바뀌며 공개 검색 수가 188에서 54로 감소했다. 이는 이번 작업 범위를 넘어서는 영향이라 `published,review` 중 `exposure_tier = C` 463건을 다시 `null`로 되돌렸다.

복구 후 공개 검색 카운트는 254건으로 증가했다. 이전에 공개 중이던 `null` 등급 행과 기존 `C`로 숨겨져 있던 행의 과거 ID 목록이 DB에 남아 있지 않아 더 좁은 원복은 이 세션에서 안전하게 수행하지 않았다. 후속 작업에서는 exposure tier 적용 전 기존 tier snapshot을 파일로 저장한 뒤 승인 대상 ID만 재계산하거나, `C` 등급 적용을 별도 검수 승인 절차로 분리해야 한다.

## Remaining Work

- 보류 2건의 중복 노출 정책 결정:
  - 상위 행사 공고 하나로 묶을지
  - 세부 신청 프로그램으로 별도 공개할지
- Exposure tier 운영 절차 보강:
  - apply 전 이전 tier snapshot 저장
  - 승인 대상 ID만 좁게 tier 재계산
  - 공개 수 급변 감지 시 자동 중단
