# 2026-11-11 검수대기 40건 원문 대조·수정안

상태: 검토 대기 · Claude Code · 기준 `d523740`(origin/main)

## 요청 및 범위

- 검수대기 목록을 AI로 상세 검토하고 수정해 승인할 수 있게 해 달라는 요청이다.
- 기준일은 2026-11-11, 날짜·시각은 `Asia/Seoul`이다.
- `CLAUDE.md` 11절에 따라 운영 DB 쓰기는 교차 검토와 사용자 승인 뒤 사용자가 직접 실행한다. 이 작업에서 운영 DB는 읽기만 했다.
- 이 PC에 `OPENAI_API_KEY`가 없어 Claude가 대표 이미지 40장, 공식 공고, 신청서를 직접 대조했다.

## 결정

- 공개 38건, 중복 제외 1건(`04135dd0`, 유지 대상 `695afcf0`), 검수대기 유지 1건(`3cc1015c`).
- 날짜만 있는 마감은 서울 23:59:59로 저장한다. 원문에 시각이 있으면 그 시각을 쓴다(`WORK_LOG_20261110_date_only_deadline.md`).
- 선착순이고 종료일이 없는 공고는 `until_exhausted`, 종료일을 null로 둔다. 공개 검색이 행사 종료 뒤 제외한다.
- 접수 마감이 원문에 없으면 `unknown`, null로 둔다(`cccaac47`, `e8b07c3f`, `4fba0115`).
- 신청 절차가 없는 공개 행사는 `review-current-queue-with-ai.js`의 기준대로 행사 종료 시각을 노출 기한으로 쓴다(`99e73827`, `caf26380`, `f1c2d01c`, `c09cddfb`).
- 중복 의심 중 `24822cc8`(성북캠퍼스와 별개), `46a2a97d`(동대문 센터와 별개), `df8f1404`는 별개 공고로 판단했다.
- v6.1 화면이 읽는 `deadline_status`, `deadline_source`, `deadline_time_verified`, `deadline_checked_at`, `reception_verified`를 함께 쓴다. 쓰지 않으면 25건이 `접수 여부 확인`으로 표시된다.
  - 원문에서 읽은 접수 종료일 25건은 `verified`, 근거는 `poster`·`portal`·`notice`로 남긴다. 원문 시각이 있는 3건만 시각 확인으로 둔다.
  - 행사 종료를 노출 기한으로 쓴 공개 행사 4건은 접수 마감이 아니므로 `unverified`다. 화면에는 `마감일은 공고문에서 확인`이 나온다.
  - 종료일이 없는 9건은 `unverified`이며 `4fba0115`의 기존 `verified/legacy`도 해제한다.

## 주요 수정

| ID       | 수정                                                                     |
| -------- | ------------------------------------------------------------------------ |
| 0360454f | 대표 신청 링크가 다른 프로그램(감정오일) 폼이어서 제거, 반별 신청서 지정 |
| df8f1404 | 제목을 강좌명으로 교정, 다른 강좌의 공고·신청 링크 분리                  |
| 2b05ea0d | 리스·케이크 신청서가 닫혀 있어 TCI 워크숍(11/13 마감) 기준으로 공개      |
| e8b07c3f | 교육 과정 페이지 본문을 포털 공고로 교체, 잘못된 12/31 마감 제거         |
| d5e63364 | 행사일로 저장된 신청 기간을 접수 시작과 선착순 마감으로 교정             |
| 34706b36 | 행사 종료일로 저장된 신청 마감 제거                                      |
| c09cddfb | 제목을 행사명으로 교정, 사전접수 종료와 당일 현장접수 명시               |
| 5a88c615 | 교육 일정을 12/1~12/8로 교정                                             |

- 변경 전 값은 각 행의 `field_verification.directSourceReview20261111.previous`에 저장한다.

## 운영 반영 절차

`scripts/crawler`에서 실행한다.

```powershell
node src/apply-review-queue-source-verified-20261111.js --snapshot=../../data/results/review-queue-snapshot-20261111.json
node src/apply-review-queue-source-verified-20261111.js --snapshot=../../data/results/review-queue-snapshot-20261111.json --backup=../../data/results/review-queue-backup-20261111.json --apply --confirm=SOURCE_REVIEW_20261111
node src/apply-review-queue-source-verified-20261111.js --verify
pnpm --filter posterlink-crawler audit:public-counts
```

- 복구: `--rollback=../../data/results/review-queue-backup-20261111.json --confirm=ROLLBACK_SOURCE_REVIEW_20261111`. 이 실행이 표시한 행만 되돌린다.
- 대기열이나 행의 `updated_at`이 스냅샷과 달라지면 쓰기 전에 중단한다.

## 검증

- dry-run: 40건 포함, 공개 38·제외 1·유지 1, 변경 0건.
- `--verify`: 적용 전 상태에서 조회 동작 확인. `--apply`와 `--rollback`은 운영 실행 전이라 미검증.
- 문법 검사 통과. 크롤러 테스트 421건 통과, 실패 0건(`d523740` 기준 격리 worktree).
- `d523740`의 `getDeadlinePresentation`으로 공개 38건의 카드 문구를 계산: 날짜 18, 날짜·시각 2, `소진 시 마감` 등 문구 8, `공고문에서 확인` 6, `접수 예정` 4. `접수 여부 확인` 0건.
- 같은 날 병합된 지역 자격 작업(PR #26~#28)은 `poster_regions`와 웹 표시 영역이며, 이 스크립트의 쓰기 대상과 겹치지 않는다.

## 남은 작업

- `3cc1015c`: 02-592-3721로 신청 마감 확인. 포스터의 결과 안내일이 11/12다.
- 양천 `SKILL:ON - 클로드코드로 디자인`(포털 75774, 마감 11/19)은 영상제작 공고에 병합돼 별도 레코드가 없다.
- 강서구립도서관 3건은 원문이 JavaScript 전용이라 포스터 기준으로 작성했다.
- `review-current-queue-with-ai.js`의 UTC 날짜 절단, `ai-review-queue.yml`의 `thorough` 쓰기, 크롤러의 링크 병합은 2026-11-09 보고 이후 미수정이다.
