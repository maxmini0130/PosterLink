# 2026-08-29 날짜/검색/공개 품질 후속 정리

## 승인

사용자가 남은 작업 전체 진행 및 운영 DB 반영을 승인했다.

## 날짜/기간 수동 후보 16건 정리

추가:

- `scripts/crawler/src/apply-date-period-manual-corrections.js`
- `pnpm --filter posterlink-crawler apply:date-period-manual-corrections`

적용 전 dry-run:

- 날짜 교정: 8건
- 저장값 유지 및 경고 정리: 8건
- DB 쓰기 없음

운영 적용:

```bash
pnpm --filter posterlink-crawler apply:date-period-manual-corrections -- --apply
```

결과:

- `posters` 갱신: 16건
- `poster_field_evidence.deadline_date` 근거 upsert: 16건
- 과거 마감으로 교정된 공개 건 만료 처리: 5건

대표 케이스:

- 은평구청 1인가구 안전돌봄서비스: 수시모집이지만 사업기간 종료 `2026-06-30` 기준으로 마감일 채움.
- MSL 3ON3 농구대회: 변경 모집마감 `2026-08-26`으로 교정.
- 금천구립 도서관 강좌 3건: 강좌 종료일이 아닌 모집 종료일로 교정.
- 강북구 다산사상 수강생: 행사/교육 종료일이 아닌 접수기간 종료 `2026-09-04`로 교정.
- 영월 서울농장, 패션뷰티유통직무, 소셜 WE 아트브릿지+, 강동 멘토링 등은 사용자/본문 근거상 저장 마감일이 맞아 경고만 정리.

검증:

```bash
pnpm --filter posterlink-crawler audit:date-periods -- --limit=5000
pnpm --filter posterlink-crawler maintenance:close-expired -- --limit=5000
```

결과:

- 날짜 stale warning: 0건
- deadline mismatch: 0건
- missing clear deadline: 0건
- actionable: 0건
- 만료 후보: 0건

감사 로직 보강:

- `date-period-manual-corrections-v1` 등 수동 확정 근거가 있고 현재 저장 마감일과 일치하면 false-positive mismatch 후보로 다시 올리지 않게 했다.

## 검색 로그 한글 깨짐 정리

원인:

- 검색 로그 API는 정상적으로 JSON 문자열을 저장한다.
- 과거 빠른 검색어/클라이언트 경로에서 `ì±ì©` 같은 UTF-8 mojibake 값이 들어간 로그 3건이 있었다.

변경:

- `apps/web/app/api/search-logs/route.ts`
  - 한글이 없고 mojibake 패턴이 있는 검색어는 UTF-8로 복원 가능한 경우 복원 후 저장한다.
- `scripts/crawler/src/repair-search-log-mojibake.js`
  - 기존 `search_logs`의 깨진 검색어를 dry-run/apply로 복원한다.

운영 적용:

```bash
pnpm --filter posterlink-crawler repair:search-log-mojibake -- --apply
```

결과:

- `ì±ì©` -> `채용`
- `íì¬` -> `행사`
- `ììê³µì¸` -> `소상공인`
- 총 3건 갱신

검증:

- `get_popular_keywords` 결과가 정상 한글 검색어로 반환됨.

## 공개/알림 지표 재점검

공개 카운트:

```bash
pnpm --filter posterlink-crawler audit:public-counts
```

결과:

- `count_public_posters`: 195
- `search_public_posters_returned`: 195
- 검색 RPC 카운트 일치: true
- `public_search_by_exposure_tier`: A 188, B 7
- 공개 검색 대상 중 `exposure_tier IS NULL`: 0건

추가 처리:

- 공개 검색에 남아 있던 `exposure_tier` 미지정 1건은 evidence가 없어 `C`로 단건 보정했다.

알림:

```bash
pnpm --filter posterlink-crawler cleanup:notification-push-backlog -- --apply --json
pnpm --filter posterlink-crawler audit:notifications
```

결과:

- 24시간 초과 push 대기 243건 정리
- 남은 `new_match` pending: 241건
- 실제 sendable: 10건
- push token 없음: 231건
- `favorite_deadline` pending: 0건

## 남은 확인

- 새로 들어오는 공고의 날짜/기간 매핑이 같은 오류를 반복하지 않는지 다음 크롤 이후 재감사한다.
- `new_match` pending 중 24시간 이내 sendable 10건은 실제 승인/알림 함수 흐름에서 처리되는지 다음 운영 사이클에서 확인한다.
