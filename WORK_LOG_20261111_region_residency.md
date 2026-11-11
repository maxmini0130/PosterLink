# 2026-11-11 구 주민 한정 문구 정정과 카드 조건 문구

## 문제

- 운영 확인(508e88d)에서 d9badcf3의 원문 대상은 '성동구 거주 또는 성동구 학교·직장 생활권'인데, 화면에는 '성동구 주민만 신청 가능'으로 나왔다. 구 연결 근거가 `eligibility`이기만 하면 모두 '주민만'으로 표시했기 때문이다.
- 모바일 2열 카드에서 '우대 마포구·서대문구 …'처럼 조건 문구가 말줄임으로 잘렸다.

## 결정 (대표, 2026-11-11)

- 구 주민 한정 31건 전체를 원문 대상 문장으로 다시 판정한다: 거주만 / 거주·생활권(학교·직장 포함) / 애매함(검수).
- 크롤러 판정에도 같은 구분을 넣는다.
- 카드에서는 짧은 형태('마포·서대문 생활권 우대', '성동구 주민만')를 쓰고, 말줄임 없이 두 줄까지 허용한다. 상세 화면은 전체 문구를 유지한다.

## 변경

- `scripts/crawler/src/region-eligibility.js`
  - `classifyResidency`: `gu_restricted` 판정에 `residency`(`resident` / `life_area` / `unclear`)와 `residencyEvidence`(판정에 쓴 구절)를 더한다.
  - 규칙 버전은 `region-eligibility-20261111`이다.
  - 크롤러는 `buildCardFacts`를 거쳐 같은 판정을 `field_verification.cardFacts.regionEligibility`에 기록한다.
- `scripts/crawler/src/region-basis-backfill.js --residency`
  - 구 연결이 `eligibility`인 공고에 판정을 기록한다. 연결은 바꾸지 않는다.
  - 이미 `residency`가 기록된 공고는 건너뛴다.
  - 규칙이 더 이상 구 한정으로 읽지 않는 공고는 `needs_person`으로 남기고 쓰지 않는다.
  - 백업과 `--rollback`은 기존 경로를 그대로 쓴다.
- 웹 `posterRegionCondition`이 `text`(상세)와 `short`(카드)를 돌려준다.
  - 기록이 없거나 `unclear`면 '○○구 한정 · 세부 자격은 원문 확인'(카드 '○○구 한정')으로 표시하고, '주민만'이라고 단정하지 않는다.
- `PlPosterCard`의 `RegionConditionLine`
  - 말줄임을 없애고 `break-keep`으로 줄바꿈한다.
  - 화면 읽기 프로그램에는 전체 문구를 읽어 준다.
  - 카드의 우대 꼬리표는 짧은 문구 끝의 '우대'로 대신한다.
- 검수 목록 `docs/REGION_BASIS_REVIEW_20261110.md`에 D(애매함 6건)를 추가했다.

## 재판정 dry-run (운영 스냅숏, 읽기 전용)

- 31건: 거주만 18, 거주·생활권 7, 애매함 6.
- 판정 기록 31건을 쓰고, 연결은 하나도 바꾸지 않는다.

## 검증

- 크롤러 테스트 421/421 통과.
- `browseRegion.test.ts` 10/10 통과.
- `pnpm --filter web lint`와 `pnpm --filter web build` 통과.
- 루트 `pnpm test`는 400/402. 실패 2건은 main에서도 실패하는 profile-role-release 테스트다.
- 390폭 픽스처 캡처
  - 네 문구 모두 한 줄에 들어가고 넘치지 않았다: '마포·서대문 생활권 우대', '동대문구 거주·생활권만', '서대문·동대문 거주·생활권만', '강서구 주민만'.
  - PC 폭도 같다.

## 남은 작업

- 대표가 운영에 `--residency --apply`를 실행해야 한다. 실행 전까지 운영 화면은 구 주민 한정 공고를 '○○구 한정'으로 표시한다(병합 후).
- 애매함 6건(검수 목록 D)을 사람이 판정해야 한다.
