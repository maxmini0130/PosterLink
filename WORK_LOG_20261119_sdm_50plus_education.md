# 2026-11-19 서대문50플러스센터 수강신청 게시판 수집 연결

상태: PR 검토 대기 · Claude Code · 기준 `c84f200`(origin/main) · 브랜치 `feat/sdm-50plus-education-20261119`

## 문제

- 서대문50플러스센터 강좌(수강신청) 목록 `https://www.50plus.or.kr/sdm/education.do`가 수집되지 않았다. 저장소에 50plus.or.kr·서울시50플러스재단 수집 경로나 공식 API 사용처는 없다(`scripts/crawler`, `supabase/migrations` 검색).
- 강좌는 접수 상태(수강신청 / 대기신청 / 신청마감)가 핵심인데, 공통 업로드는 기존 레코드를 '빈 값 채우기'만 하고 상태를 바꾸지 않는다. 제목이 비슷한 다른 강좌(기수, 오전반/오후반, 온라인/오프라인)는 중복 판정이 하나로 합칠 수 있다.

## 실사이트 확인 (2026-11-19, 읽기 전용 GET)

- 목록: 표 한 줄 = 강좌 하나. 열은 기관(서대문센터)·중분류·소분류·제목·모집기간·교육기간·강사·수강료·정원·신청 버튼. 버튼 링크가 `education-detail.do?id=<강좌 id>`, 버튼 글자가 접수 상태.
- `state=JOIN`(모집중) 필터: 20건(수강신청 15, 대기신청 5), 3쪽은 빈 목록. 전체 목록은 상태순이 아니다(모집 중인 76915275가 전체 5쪽에 있음).
- 상세: 제목, 신청 상자(버튼·정원·모집기간·수강료·추가비용), 문의, 회차 표(일시·장소·강사·내용·준비물), 강좌 소개 이미지. 수강 대상·자격은 HTML 글이 아니라 이미지 안에만 있다. 공통 배너 '신청·면제·환불방법'(`education-Introduce.do` 링크 이미지)이 일부 상세에 붙는다.
- 모집기간이 남았는데 신청마감인 강좌가 있다: 78232916 식물관리사 양성과정(모집 11.02~12.04, 버튼 신청마감).
- 연결 오류 없음(모든 요청 HTTP 200).

## 결정

- 수집 출처와 주관기관을 나눈다. 사이트 이름(`source_org_name`)은 서울시50플러스포털, 주관기관(`organizer_name`)은 서대문50플러스센터. 주관기관은 목록 '기관' 열이 등록된 값(서대문센터)과 같을 때만 넣고, 다르면 비우고 검수로 보낸다.
- 공고 식별자 = 상세 URL의 강좌 id. 새 기수·반은 id가 달라 다른 공고다. 같은 게시판의 다른 id 행은 제목 유사도 중복 후보에서 뺀다(다른 출처와의 중복 판정은 그대로).
- 목록 = 모집중 목록 전체(최대 5쪽, 빈 쪽에서 멈춤) + 전체 목록 3쪽(최근 마감 강좌를 다시 보기 위해). id로 합친다.
- 상태는 원문 버튼 글자로만 정한다. 수강신청 → open, 대기신청 → waitlist, 마감/종료 → closed, 예정 → upcoming, 그 밖은 unknown(검수). 상세 버튼이 목록보다 우선.
- 신청마감이면 기간이 남아도 마감으로 본다. 새 공고는 만들지 않고, 같은 source_key의 게시(published) 포스터만 `closed`로 바꾼다(상태 compare-and-set). 검수 대기 포스터는 상태를 두고 차단 이슈 `source-application-closed`를 남긴다. 마감 → 다시 모집은 기록만 하고 상태는 사람이 정한다.
- 모집기간 끝 날짜는 포털 필드로 `YYYY-MM-DDT23:59:59+09:00`. 기간이 없으면 마감일을 넣지 않고 `application-period-unconfirmed`. '상시'로 바꾸지 않는다.
- 수강 대상이 글에 없으면 `eligibility-unconfirmed`. 이 이슈와 기간·주관기관·상태 미확인, 원문 마감 이슈는 예약 AI 검수의 자동 승인을 막는다(사람 검수). 대기신청은 안내용 이슈만 남긴다.
- 마감 강좌는 이미지 후보를 넘기지 않는다(AI 이미지 검사 비용 없음). 업로드 앞단에서 처리된다.

## 변경

- `scripts/crawler/src/adapters/fifty-plus-education.js`(새 어댑터 `50plus-education`): 목록·상세 파서(네트워크 없는 순수 함수 분리), 라벨 붙은 본문(주관기관·과정 분류·접수상태·모집기간·교육기간·수강료(추가비용)·정원·강사·신청방법·문의·교육장소·교육일정·소개 글), 마감일·portalDeadline·교육기간(event)·신청 링크(`education-apply.do?id=`, 수강신청/대기신청일 때만)·`sourceApplicationStatus`·`sourceReviewIssues`·`sourceIdentity`. 요청은 기존 `fetchPage`(axios 15초 타임아웃). 목록 첫 쪽이 두 목록 모두 실패하면 오류로 기록, 상세 실패는 그 강좌만 실패.
- `scripts/crawler/src/source-application-status.js`(새, 순수 함수): 버튼 글자 분류, 어댑터 검수 이슈 정규화, 재수집 상태 반영 계획, AI 자동 승인 차단 코드, 같은 게시판 다른 항목 판정. 이 필드가 없는 다른 어댑터의 게시물은 영향 없음.
- `adapters/index.js`, `sites.js`: 사이트 `sdm-50plus` 등록(`analyzeAttachments: false`, 분류 `교육`).
- `upload-to-supabase.js`: 원문 마감 앞단 처리, 같은 게시판 다른 id 중복 후보 제외, 어댑터 검수 이슈를 품질 이슈(review)와 `field_verification.qualityIssues`로 저장, 어댑터의 구조화 주관기관 우선, `field_verification.sourceApplicationStatus` 기록(새 레코드·상태 변경 시).
- `review-current-queue-with-ai.js`: 위 차단 이슈가 있으면 자동 승인하지 않음(`auto_approval_blockers`에 표시).
- `supabase/migrations/20261119020000_add_sdm_50plus_education_source.sql`: `collection_sources` 행(`sdm-50plus`, active). **적용하지 않음.**
- 테스트: `src/fifty-plus-education.test.js`(10), `src/source-application-status.test.js`(7). 고정 자료 `test-fixtures/50plus-sdm/`(실사이트 목록 3, 상세 3. 본문 블록만 남기고 줄 들여쓰기·줄 끝 공백만 정리).

## 검증

- `pnpm --filter posterlink-crawler test`: 473/473 통과.
- `git diff --check`: 통과. `node scripts/build-crawler-bundles.mjs`(웹 관리자용 번들): 빌드 성공(생성물은 git 무시 경로).
- 실사이트 로컬 수집 2회(`node src/index.js --site sdm-50plus --force`, Supabase·AI 키 없는 환경이라 DB 쓰기 없음):
  - 목록 31건, 상세 31건 모두 수집. 수강신청 15 · 대기신청 5 · 신청마감 11. 주관기관 31/31 서대문50플러스센터, 마감일 31/31.
  - 두 번째 실행도 같은 31개 source key, 상태·마감일·제목 변화 0. 기수(<5기>~<10기>)·오전반/오후반·온라인/오프라인은 각각 별도.
  - 로컬에는 AI 키가 없어 이미지 판정이 기본 거부되고 모두 '텍스트 공고'로 분류됐다(규칙 점수는 100). 운영에서는 기존 AI 이미지 검사가 판정한다.
- 업로드 단계는 DB 없이 순수 함수 단위 테스트로만 확인했다(실제 Supabase 업로드는 실행하지 않음).

## 운영 반영 시 사용자 작업

1. PR 검토·병합. 병합되면 정적 사이트 목록에 들어가 다음 예약 수집(매일)부터 이 게시판을 수집한다. 새 공고는 모두 `poster_status = review` 또는 이미지 없는 공고 후보(`notice_candidates`, pending)로 들어간다.
2. 수집 통계를 수집원 화면에 남기려면 마이그레이션 적용: `supabase/migrations/20261119020000_add_sdm_50plus_education_source.sql`(롤백 `DELETE FROM collection_sources WHERE source_slug = 'sdm-50plus';`). 적용하지 않아도 수집은 돈다.
3. 첫 수집 뒤 확인(읽기 전용): `SELECT poster_status, count(*) FROM posters WHERE source_key LIKE 'https://www.50plus.or.kr/sdm/education-detail.do?id=%' GROUP BY 1;`

## 남은 작업

- 이미지 없는 공고 후보(`notice_candidates`)로 들어간 강좌는 원문이 신청마감으로 바뀌어도 자동 반영하지 않는다(포스터 테이블만 처리). 검수에서 처리.
- 전체 목록 3쪽 밖에 있는 강좌가 마감되면 버튼 변화를 못 볼 수 있다. 그때는 기존 마감일 기준 자동 마감(`close-expired-posters`)이 닫는다.
- 수강료·정원 변경은 기존 '빈 값 채우기' 규칙대로 기존 레코드에 덮어쓰지 않는다.
- 다른 50플러스센터(/nwc, /djc 등)는 같은 어댑터로 붙일 수 있지만 `FIFTY_PLUS_CENTERS`에 실사이트 확인 뒤 추가해야 한다.
- 웹 관리자 '크롤러 실행'은 Vercel Ignored Build Step 때문에 다음 웹 빌드 전까지 예전 번들을 쓴다.
