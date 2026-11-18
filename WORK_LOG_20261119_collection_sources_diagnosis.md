# 2026-11-19 수집 기관 관리 자동 진단 오표시·기업마당 수집 중단 수정

## 문제

`/admin/collection-sources`의 자동 진단이 5곳을 '즉시 점검 · 최근 실행 없음 · 아직 실행 이력이 없습니다'로 표시했다. 대상은 기업마당, JOB-ALIO, 마포구고용복지지원센터, 마포구노동자종합지원센터, 마포구시설관리공단이다.

운영 DB를 읽기 전용으로 확인한 결과:

- JOB-ALIO, 마포구고용복지지원센터, 마포구노동자종합지원센터, 마포구시설관리공단은 11/18에도 정상(success) 수집했다. 실행 기록도 111~226건씩 있다.
- 기업마당(bizinfo)은 10/28 `partial` 실행(`notice_candidate_lookup:upstream request timeout`) 이후 상태가 `error`가 됐고, 그 뒤로 한 번도 실행되지 않았다.

## 원인

1. 화면 API(`GET /api/admin/collection-sources`)가 실행 기록을 전체 기관 합쳐 최신 30건만 가져왔다.
   - 매일 수집(crawl)·업로드(upload) 기록이 기관마다 쌓여, 30건 안에는 약 24곳만 들어갔다.
   - 나머지 기관은 실행 기록이 없는 것으로 진단됐다.
2. 예약 수집(전체 실행)은 고정 사이트 목록에 더해, DB에서 `status = 'active'`인 기관만 추가해 실행했다(`index.js`).
   - 실행 결과가 `error`나 `partial`이면 tracker가 상태를 `error`로 바꾼다.
   - `error`가 된 DB 기관은 다시 실행되지 않으므로, 성공해서 `active`로 돌아올 수도 없었다.
   - 마포구 기관들은 고정 목록에 있어 상태와 관계없이 실행됐고, 기업마당·JOB-ALIO는 DB에서만 추가되는 기관이었다.

## 변경

- `apps/web/app/api/admin/collection-sources/route.ts`
  - 기존 최신 30건(최근 실행 목록용)은 그대로 둔다.
  - 그 30건에 없는 기관 중 실행한 적이 있는 기관(`last_collected_at` 또는 `last_run_status` 있음)은 기관별 최신 3건을 따로 가져와 합친다(동시 8개).
- `scripts/crawler/src/collection-source-tracker.js`
  - `mergeScheduledCollectionSourceSites`(index.js에서 이동)를 추가했다.
  - 예약 수집 대상 상태를 `active`·`error`로 넓혔다. planned·paused·retired·manual은 그대로 제외한다.
- `scripts/crawler/src/index.js`: 위 함수를 쓰도록 바꿨다.
- `scripts/crawler/src/collection-source-schedule.test.js`: error 기관 재시도와 제외 상태 테스트를 추가했다.

## 검증

- `pnpm --filter posterlink-crawler test` 432/432 통과(새 테스트 2개 포함)
- `pnpm --filter web lint`, `pnpm --filter web build` 통과
- Playwright로 관리자 계정·운영 데이터(읽기 전용), 데스크톱 1440px·모바일 390px에서 비교했다.

| 항목       | 운영(수정 전)    | 로컬(수정 후)                         |
| ---------- | ---------------- | ------------------------------------- |
| 실행 기록  | 30건, 24개 기관  | 75건, 39개 기관                       |
| 기업마당   | '최근 실행 없음' | '최근 실행 10/28' + 오류 확인 안내    |
| 나머지 4곳 | '실행 이력 없음' | 11/18 실행 시각과 실제 지표 기반 사유 |
| API 응답   | 0.9~1.8초        | 0.8~1.0초                             |

## 남은 판단 (데이터·운영)

- 기업마당은 병합 후 다음 예약 수집에서 다시 실행된다. 성공하면 `active`로 돌아온다. 바로 확인하려면 화면의 단일 실행을 쓴다.
- 마포구노동자종합지원센터: 14일간 매일 20건 확인, 20건 모두 `news-board-without-action` 제외, 새 공고 0건이다. 수집 대상이 '소식' 게시판(`community/news`)이다. 모집·공지 게시판으로 바꿀지, 우선순위를 낮출지 판단이 필요하다.
- 마포구시설관리공단: 14일간 새 공고 0건이다. 공단소개·결과 발표·운영 안내 같은 행정 공지만 있다.
- 마포구고용복지지원센터: 수집 단계 통과 6건이 업로드 단계에서 매일 모두 제외된다. 사유 확인이 필요하다.
- JOB-ALIO: 매일 새 공고 3~5건으로 정상이다. 낮은 유효율로 '즉시 점검'이 붙는 진단 기준은 조정을 검토한다.
