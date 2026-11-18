# 2026-11-19 healthcheck 필드 수정 후보 오탐 수정

## 문제

11/18 저녁 검수 반영 후 `ai:healthcheck` 품질 게이트가 fail이었다(필드 수정 후보 1건). 후보는 e6ea2dba(송파 리프레시 데이 와인&러닝)의 마감을 11/20 → 11/24로 바꾸자는 제안이었다.

- 송파구 접수 원문의 신청기간은 11.13~11.20이다. 11/24·11/25는 와인·러닝 클래스 행사일이다.
- 크롤러 AI 판정(11/18 09:08, 신뢰도 0.45)이 행사일을 마감으로 읽었다.
- 원문 검수(`sourceReview20261118b`, 11/18 22:15)가 그 뒤에 11/20으로 확정했다.
- 그런데 `getCorrection`은 '현재 마감보다 늦은 날짜'면 신뢰도가 낮아도 후보로 올렸다.

## 변경

- `scripts/crawler/src/person-review.js`(신규)
  - `quality-gate-hold.js`에 있던 `lastPersonReviewAt`과 `personReviewedSince`를 옮겨 공용으로 만들었다.
  - 사람 검수 키에 후속 수정 스크립트가 쓰는 `reviewFollowup…`을 추가했다.
- `apply-field-verification-corrections.js`의 `isStaleDeadlineCorrection`에 제외 규칙 2개를 추가했다.
  - `person_reviewed_after_ai_check`: AI 판정(`field_verification.checkedAt`) 뒤에 사람 검수가 있으면 옛 마감 제안을 후보에서 뺀다.
  - `corrected_deadline_is_event_date`: 현재 마감이 행사 시작 전이고 제안 날짜가 행사 기간(시작~종료일) 안이면 행사일 오독으로 보고 뺀다.
  - 행 조회에 `event_start_at`, `event_end_at`을 추가했다(`hold-quality-gate-posters.js`도 같음).
- `quality-gate-hold.js`: 공용 모듈을 불러오도록 바꿨다. 동작은 같고, `lastPersonReviewAt`은 다시 내보낸다.

## 검증

- 새 테스트 5개(사람 검수 후/전, 모델 검수자, 행사일 제안, 행사 밖 날짜)를 추가했다. 송파형 테스트 2개는 수정 전 코드에서 실패하는 것을 확인했다.
- `node --test` corrections·quality-gate-hold: 18/18 통과
- `pnpm --filter posterlink-crawler test`: 435/435 통과
- 운영 데이터로 healthcheck를 실행했다(읽기 전용, 패치 코드).
  - 필드 수정 후보 0건, 품질 게이트 **pass**
  - 새 규칙으로 제외된 건은 e6ea2dba 1건뿐이다. 나머지 제외 사유는 기존 규칙(수집 출처명 82건, 과거 연도 2건)이다.
- 루트 `pnpm test`에서 `scripts/security/profile-role-release.test.ts` 2건이 실패한다. 이번 변경을 빼도 origin/main에서 똑같이 실패하는 기존 문제다.

## 남은 작업

- `profile-role-release.test.ts` 기존 실패 원인 확인(허용 목록에 없는 파일 변경으로 보임)
