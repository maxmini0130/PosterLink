# 2026-08-29 운영 품질 후속 처리

## 사용자 승인

사용자가 남은 작업 전체 진행 및 운영 반영을 승인했다.

```text
모두 진행하세요
모둣 승인하겠습니다.
```

## 지역 교정 적용

대상:

- `2026 기지개페이스 고립은둔청(소)년 부모교육 모집`
- poster id: `05821f97-ee32-4896-a5b6-f05773438dd2`

적용:

- 기존 지역: `REG_SEOUL_SEONGBUK`, `REG_SEOUL_MAPO`
- 변경 지역: `REG_SEOUL`
- 근거: `서울시 거주 부모님`
- `field_verification.classification.regions` 갱신
- `classificationIssues`에서 지역 관련 이슈 제거
- `poster_field_evidence.region`에 `region-eligibility-corrections-v1` 근거 upsert

비고:

- 남은 `ambiguous-category`는 지역 문제가 아니므로 유지했다.

## 알림 push backlog 정리

사전 감사:

- `new_match` pending: 19,204건
- `favorite_deadline` pending: 5건

정리 dry-run:

- 24시간 초과 후보: 18,960건
- `new_match`: 18,955건
- `favorite_deadline`: 5건
- 사유:
  - push token 없음: 17,715건
  - stale sendable: 1,245건

적용:

```bash
pnpm --filter posterlink-crawler cleanup:notification-push-backlog -- --apply --json
```

결과:

- `push_sent_at` 보정: 18,960건
- 삭제 없음

적용 후 감사:

- `new_match` pending: 484건
- `favorite_deadline` pending: 0건
- 남은 `new_match` 중 sendable: 29건
- 남은 `new_match` 중 push token 없음: 455건

## 날짜/기간 전수 감사 도구 추가

추가:

- `scripts/crawler/src/audit-date-period-mapping.js`
- `pnpm --filter posterlink-crawler audit:date-periods`

목적:

- 모집/신청/접수/공모기간과 행사/교육/체험/발표 기간 혼동 후보 추출
- 실제 날짜는 맞지만 과거 `field_verification` 경고만 남은 후보 분리

초기 감사 결과:

- 감사 대상: 541건 (`published,review`)
- 낡은 날짜 경고: 192건
- 실제 mismatch 후보: 14건
- 명확한 마감일 누락 후보: 27건
- 전체 조치 후보: 233건

## 날짜 품질 로직 보강

문제:

- `응모방법` 문장 안의 `우편 응모는 2026. 9. 5. 18:00 도착분까지`가 전체 공모기간보다 우선되어 서울꿈새김판 마감일을 `2026-09-05`로 다시 제안했다.
- `2026. 8. 28. ~ 9. 6.`처럼 앞 날짜에 연도가 있는 정상 축약 범위가 `date-without-year`로 과하게 잡혔다.

변경:

- 날짜 품질 로직에서 `신청방법/응모방법`은 기간 라벨로 보지 않게 했다.
- `공모기간/응모기간`을 신청·모집기간 라벨로 명시했다.
- 앞 날짜에 연도가 있는 정상 축약 범위는 `date-without-year` 경고에서 제외했다.
- 서울꿈새김판 회귀 테스트를 추가했다.

검증:

- `node --test scripts/crawler/src/poster-rules.test.js`
  - 80 pass / 0 fail

## 낡은 날짜 경고 정리

추가:

- `scripts/crawler/src/apply-stale-date-warning-cleanup.js`
- `pnpm --filter posterlink-crawler cleanup:stale-date-warnings`

dry-run:

- 스캔: 541건
- 정리 대상: 192건

적용:

```bash
pnpm --filter posterlink-crawler cleanup:stale-date-warnings -- --limit=5000 --apply
```

결과:

- `field_verification` 날짜 경고 정리: 192건
- 날짜 컬럼 변경 없음

적용 후 날짜/기간 감사:

- 낡은 날짜 경고: 0건
- 실제 mismatch 후보: 14건
- 명확한 마감일 누락 후보: 27건
- 남은 조치 후보: 41건

## 안전 마감일 누락 교정

미래 마감 후보 8건을 먼저 적용했다.

```bash
pnpm --filter posterlink-crawler apply:safe-missing-deadlines -- --apply
```

결과:

- `application_end_at` 채움: 8건
- `poster_field_evidence.deadline_date` upsert: 8건

이후 과거 마감 후보는 `상시/수시` 충돌이 있는 1건을 제외하고 18건을 적용했다.

```bash
pnpm --filter posterlink-crawler apply:safe-missing-deadlines -- --include-past --apply
```

결과:

- `application_end_at` 채움: 18건
- `poster_field_evidence.deadline_date` upsert: 18건

과거 마감이 채워진 published 공고는 KST 기준 만료 처리했다.

```bash
pnpm --filter posterlink-crawler maintenance:close-expired -- --limit=5000 --apply
```

결과:

- `closed` 전환: 18건

최종 감사:

- `pnpm --filter posterlink-crawler audit:date-periods -- --limit=5000`
  - 감사 대상: 523건
  - 낡은 날짜 경고: 0건
  - 실제 mismatch 후보: 14건
  - 명확한 마감일 누락 후보: 1건
  - 남은 조치 후보: 15건
- `pnpm --filter posterlink-crawler maintenance:close-expired -- --limit=5000`
  - 만료 후보: 0건

남은 15건은 자동 적용 보류:

- 기존에 수동 교정한 `영월 서울농장`, `미래내일 패션뷰티`, `소셜 WE 아트브릿지+`가 감사 로직상 mismatch로 다시 잡힌다.
- 이는 행사/교육/체험/발표일을 모집마감으로 오해하는 false positive 가능성이 있으므로 원문 기반 수동 검수 후보로 남긴다.

## 서울꿈새김판 날짜 로직 추가 보강

운영 데이터 감사에서 서울꿈새김판이 다시 후보로 잡히는 원인을 확인했다.

- 실제 원문은 범위 기호로 ASCII `~`가 아니라 전각 `～`를 사용한다.
- `응모방법` 문장 안의 우편 도착 조건도 기간 후보로 읽힐 수 있다.

보강:

- `공모기간/응모기간`을 신청·모집기간 신호로 명시했다.
- 전각 `～`도 날짜 범위 연결자로 인식하도록 추가했다.
- 앞 날짜에 연도가 있는 축약 범위(`2026. 8. 28. ～ 9. 6.`)는 `date-without-year`로 보지 않게 했다.
- 서울꿈새김판 회귀 테스트를 실제 전각 `～` 형식으로 추가했다.

최종 날짜/기간 감사:

- 감사 대상: 523건
- 낡은 날짜 경고: 0건
- 실제 mismatch 후보: 15건
- 명확한 마감일 누락 후보: 1건
- 남은 조치 후보: 16건
- 서울꿈새김판은 남은 후보에서 제외됨

최종 검증:

- `pnpm --filter posterlink-crawler test`
  - 260 pass / 0 fail
- `git diff --check`

## 공개 카운트와 검색 로그 확인

공개 카운트:

```bash
pnpm --filter posterlink-crawler audit:public-counts
```

결과:

- `count_public_posters`: 201
- `search_public_posters_returned`: 201
- 검색 RPC 카운트 일치: true
- sitemap feed rows: 201
- poster URL 후보: 203
- active archive rows: 2

검색 로그:

- 최근 7일 `search_logs`: 6건
- 검색 로그가 완전히 비어 있는 문제는 해소된 상태다.
- 일부 한글 검색어가 깨져 저장된 흔적이 있어 인코딩/클라이언트 전달 경로는 후속 점검이 필요하다.

## 다음 처리 대상

남은 41건은 자동 일괄 적용 전에 안전 분리가 필요하다.

- 안전 후보:
  - 저장 마감일이 비어 있고, 본문에 명확한 `신청/접수/모집/공모기간` 종료일이 있는 건
  - 저장 마감일과 제안 마감일이 같고, 남은 이슈가 낮은 위험인 건
- 수동 검수 후보:
  - 저장 마감일이 있는데 감사 제안이 더 이른 날짜인 건
  - 행사/교육/체험/발표 일정을 모집종료일로 오해했을 가능성이 있는 건
  - 과거 날짜를 새로 넣으면 공개 상태가 곧바로 만료/closed로 바뀔 수 있는 건
