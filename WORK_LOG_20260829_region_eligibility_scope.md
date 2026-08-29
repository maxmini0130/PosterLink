# 2026-08-29 지역 자격 범위 오판 보강

## 확인한 공고

- `2026 기지개페이스 고립은둔청(소)년 부모교육 모집`
- 운영 poster id: `05821f97-ee32-4896-a5b6-f05773438dd2`

## 확인 결과

- 저장 마감일은 `2026-09-03`으로 맞다.
- 지역 연결은 `서울특별시 성북구`, `서울특별시 마포구` 2개로 되어 있었다.
- 원문/요약의 대상 조건은 `서울시 거주 부모님`이므로 서비스 지역은 장소 주소가 아니라 `서울특별시` 전체로 보는 것이 맞다.
- 기존 지역 추론은 교육 장소 주소의 구 이름을 먼저 잡아 `ambiguous-region`으로 보냈다.

## 변경

- `scripts/crawler/src/region-rules.js`
  - `서울시 거주`, `서울특별시 거주`, `서울 거주`, `서울시민` 등 대상 자격 범위 신호를 구 단위 장소 키워드보다 먼저 판정하도록 했다.
  - 해당 신호가 있으면 `REG_SEOUL` 단일 결과와 `eligibility_scope` 근거를 반환한다.
- `scripts/crawler/src/poster-rules.test.js`
  - `서울시 거주 부모님` 대상 조건과 성북구/마포구 교육 장소가 함께 있을 때 `REG_SEOUL`이 우선되는 회귀 테스트를 추가했다.

## 검증

- `node --test scripts/crawler/src/poster-rules.test.js`
- `pnpm --filter posterlink-crawler test`
- `git diff --check`

## 운영 DB 교정 필요

- 운영 DB 쓰기 전 명시 승인이 필요하다.
- 적용안:
  - poster `05821f97-ee32-4896-a5b6-f05773438dd2`의 `poster_regions`를 `REG_SEOUL` 1개로 교체
  - `field_verification.classification.regions`를 `REG_SEOUL / eligibility_scope / 서울시 거주 / 0.9`로 갱신
  - `field_verification.classificationIssues`에서 `ambiguous-region` 제거
  - `poster_field_evidence`에 region 근거 `서울시 거주` 추가
