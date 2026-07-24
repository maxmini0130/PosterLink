# PosterLink 작업 정리 - 2026-07-24 (수집 데이터 품질 검증·정리)

수집된 포스터 데이터(`posters` 1,776건)를 검증하고, 정확성·가독성 문제를 크롤러 로직 수정 + 무손실 백필로 정리했다. 관련 PR #4·#5·#6·#7 은 모두 `main` 에 머지됐고, 데이터/크론은 운영에 반영됐다.

## 데이터 검증 결과 (감사)

published 1,736 / review 34 / rejected 6. published+review 1,770건 대상 감사:

- **요약이 "상세정보…"로 시작**: published의 약 55%. 게시판 상세 페이지 탭 라벨이 본문 앞에 붙음.
- **요약 라벨 아티팩트**: `"내용: 은 …"`, `"대상: 으로 …"`. 라벨을 단어 일부에서 오매칭.
- **기관명이 포털명**: published의 94.6%(1,642건)가 `source_org_name="청년몽땅정보통"`(수집 포털). 실제 주최 기관은 제목 `<…>` 앞에만 존재.
- **마감 지난 published**: 1,306건(대부분 2026년 종료 프로그램). 명백한 구식은 1건(2021년).
- **구조화 facts**: `readableNotice.facts` 채워진 건 1.7%(30건)뿐.
- (제외) "저장 마감일 ≠ 본문 마감일 246건"은 요약 잘림으로 인한 휴리스틱 오탐이라 폐기.

## 조치

### 1. 요약 가독성 정리 (PR #5, `fix/summary-content-cleanup`)
- `upload-to-supabase.js`
  - `splitReadableLines`: 본문 첫 줄 앞 탭 라벨("상세정보" 등) 제거 + 단독 라벨 줄 노이즈 처리.
  - `pickField`: 라벨과 값 사이에 실제 구분자(콜론/공백) 요구 → "대상으로"·"내용은" 오매칭 차단.
- 백필 `backfill-summary-cleanup.js`(무손실 외과적 정리, 재생성 아님).
- 운영 DB: `summary_short` 1,186 / `summary_long` 1,541건 정리(총 1,555행). 무의미 잔재 55건은 null.
- 검증: "상세정보" 접두어 0, `내용: 은`/`대상: 으로` 아티팩트 0.
- 회귀 테스트 6건.

> 참고: 전체 재생성 방식은 dry-run에서 요약을 오히려 열화(정상 본문 → "기간: 2026")시켜 폐기하고 무손실 정리로 전환했다.

### 2. 기관명 정확화 (PR #6, `fix/org-name-accuracy`)
- `poster-org.js`(신규): 포털명일 때 제목 `실제기관 <프로그램명>` 에서 실제 기관 추출. 추출 불가(제목에 `<` 없음/앞부분 과다) 시 포털명 유지.
- `upload-to-supabase.js`: 세 곳의 `source_org_name` 대입에 `resolveSourceOrgName` 적용(신규 수집분 반영).
- 백필 `backfill-org-name.js`.
- 운영 DB: 1,674건 중 1,481건을 실제 기관명으로 정정. 추출 불가 193건 유지.
- 검증: "청년몽땅정보통" 정확히 193건만 잔존. 회귀 테스트 5건.

### 3. 폐기 데이터 정리
- `청년이음센터 2021년 청년 모집`(마감 2021-07-31, id `0b3605cf-…`) → `closed`. 다른 구식 연도 제목은 없음.

### 4. 날짜 오탐 보정 (PR #4, `fix/youth-seoul-date-false-positives`)
- `poster-date-quality.js` `findApplicationRange`: 인접한 두 날짜 사이가 실제 범위 연결어일 때만 start~end 로 인정(시각·요일 토큰 제외, 다른 숫자 없음). 단일 마감일은 까지/마감/종료/기한/선착순 키워드 30자 이내 날짜만 채택.
- 프로그램 일정 날짜와 신청기간이 섞일 때 나던 `date-end-before-start`·`deadline-mismatch` 오탐 제거. 회귀 테스트 7건.

### 5. 마감 지난 포스터 자동 closed (PR #7, `feat/auto-close-expired-posters`)
- migration `20260724000000_auto_close_expired_posters.sql`: `close_expired_posters()` 함수 + pg_cron 매일 UTC 00:05.
  - 규칙: `application_end_at` 이 오늘 0시 이전인 published 를 closed. 마감 당일 유지, NULL 마감 제외.
- 운영 반영:
  - 라이브 백로그 1,301건 즉시 closed(백업 보관). 마감일 NULL 301·마감 당일 9는 유지.
  - 함수 + cron 은 대시보드 SQL Editor 에서 직접 실행해 설치(cron job id 4). RPC 호출로 함수 동작 검증(0 반환).

### 6. facts 구조화 백필 → 보류
- 저비용 역구조화(`buildReadableNoticeInfo` 재실행)는 69%에서 facts 추출되지만 품질 미달: 공고 텍스트에 줄바꿈 없이 `✔️`/`■`/`●` 기호로 라벨이 이어져 여러 필드가 한 값에 뭉침(target에 기간·신청방법까지, period="2026"만).
- 깨끗한 facts 는 전용 기호경계 파서 또는 LLM 재구조화(`poster-field-verifier`) 배치 필요 → 별도 투자성 작업으로 미룸.

## 그 외 (같은 날 처리)
- collection source config editor 후속: PR #2(설정 편집기) + PR #3(테스트 13건 + 게시판 key 안정화) 머지.
- git 동기화, GitHub CLI 설치·로그인, 크롤러 git 명령 권한 설정.

## 검증
- 크롤러 테스트 52/52 통과(기존 34 + 날짜 7 + 요약 6 + 기관 5).
- 모든 DB 변경은 dry-run → 승인 → 백업 → 적용 → 재조회 검증 절차 준수. 백업 파일은 scratchpad 보관(되돌리기용).

## 배포/운영 주의 — 마이그레이션 이력 불일치
- 원격 마이그레이션 이력 테이블에 `20260416064744` 단 1건만 있고, 로컬 43개 전부 "미적용"으로 표시된다(실제 스키마는 적용돼 있음). 이 상태에서 `supabase db push` 하면 43개를 재실행 시도해 위험하다.
- 그래서 이번 신규 SQL(함수+cron)은 대시보드 SQL Editor 에서 직접 실행했다.
- 근본 해결: `supabase migration repair --status applied <각 버전>` 으로 이력을 실제 상태에 맞춘 뒤 db push 정상화(별도·신중 작업).

## 다음 순서
1. (별개) 마이그레이션 이력 정비로 `db push` 정상화.
2. facts 구조화 백필(전용 파서 또는 LLM 배치).
3. (관찰) 마감일 NULL 301건 중 실제 상시가 아닌 것 점검.
