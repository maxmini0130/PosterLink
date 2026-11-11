# 2026-11-11 일일 크롤러 예약 시각과 이미지 신뢰도 게이트

브랜치 `fix/crawler-schedule-gate-20261111` (origin/main `d523740` 기준)

## 문제

- 일일 크롤러(`crawler.yml`)가 11-03부터 11-10까지 8일 연속 `failure`로 끝났다.
  - 수집·업로드 4개 배치는 모두 성공했다.
  - 실패한 것은 `quality-gate` 하나다. 위반 항목은 `image_ai_low_confidence_count` 1건이고 기준은 0건이다.
- 실패의 부작용이 있다.
  - `AI Review Queue`는 크롤러가 성공했을 때만 `workflow_run`으로 이어서 실행된다.
  - 그래서 8일 내내 크롤러 직후 실행이 `skipped`였고, 15:00 KST 대체 예약으로만 돌았다.
- 예약 `0 1 * * *`(10:00 KST)의 실제 시작은 07:00~08:00 UTC였다. 정각 예약이 6~7시간 밀린 것이다.

## 원인: 785ce221에 신뢰도 값이 없는 이유

- 대상: `785ce221-e77e-4f75-8a46-98f87eed9fa0` 서초구 〈서초구-숭실대가 함께하는 2026 서초 취업 멘토링〉, 게시 중.
- 이미지 판정 기록은 AI 모델이 쓴 것이 아니다.
  - 10-23 직접 원문 검수 스크립트 `apply-direct-review-20261023.js`(커밋 `5814149`)가 썼다. 이 커밋은 `feat/ai-verification-phase-1`에만 있고 main에는 없다.
  - 그 스크립트는 `{isPoster: true, visualType, source: "codex-visual-inspection", checkedAt, reason}`만 쓰고, `confidence` 필드는 쓰지 않는다.
- 게이트는 `Number(confidence ?? 0) < 0.55`로 계산했다. 그래서 값이 없으면 0으로 보고 저신뢰로 셌다.
  - 게시 중인 공고뿐 아니라 `review` 공고도 셌다.
- 같은 현상의 기존 기록:
  - `WORK_LOG_20261022_final_deploy_approval.md`(펫스타 공고)
  - `WORK_LOG_20261102_poster_feed_full_test.md`(2건)
- 운영 읽기 전용 조회(11-11) 결과:
  - 게시·검수 중인 이미지 판정은 673건이다.
  - 신뢰도 값이 없는 것은 이 1건뿐이다.
  - 실제 저신뢰(0.55 미만)는 0건이다.

## 결정

1. **예약 시각:** `37 0 * * *`(00:37 UTC = 09:37 KST)로 옮긴다.
2. **공고별 보류:** 신뢰도가 낮은 공고는 그 공고만 검수 대기로 보내고, 실행은 실패시키지 않는다.
   - 새 단계 `hold-low-confidence-images.js`가 게이트 직전에 실행된다.
   - 대상은 게시 중이고 이미지가 있는 공고 가운데, 모델 신뢰도가 0.55 미만(`low`)이거나 신뢰도가 없는(`unscored`) 공고다.
   - 쓰는 값:
     - `poster_status`를 `published`에서 `review`로 바꾼다.
     - `field_verification.imageConfidenceHold`를 기록한다. 내용은 규칙 버전, 사유, 신뢰도, 기준, 판정 출처·모델, 판정 시각, 이전 상태, 보류 시각, 실행 ID다.
     - 기존 이미지 판정은 그대로 둔다.
   - 안전장치:
     - 쓰기는 `--apply --confirm=IMAGE_CONFIDENCE_HOLD`가 있을 때만 한다.
     - `poster_status = published`와 읽은 시점의 `updated_at`이 그대로일 때만 쓴다.
     - 대상이 `IMAGE_HOLD_MAX`(기본 10)건을 넘으면 모델 장애 같은 전체 문제로 보고, 아무것도 쓰지 않고 실패한다.
   - 보고서가 롤백 백업이다. `--rollback=<보고서>`는 그 실행이 보류한 공고 중 아직 보류 상태인 것만 되돌린다.
   - 보고서는 게이트 아티팩트에 30일 보관된다.
3. **신뢰도 없음은 0이 아니다.**
   - 모델 판정에 값이 없으면 `unscored`(미확인)로 보고 보류한다. 통과로 보지 않는다.
   - 모델 없이 수동 시각 검수 출처(`visual-inspection|manual|human|admin`)만 있으면 `manual`로 분류한다. 이것은 사람의 판정이므로 보류하지 않고 따로 집계한다. 785ce221이 여기에 해당한다.
4. **게이트 지표:** `image_ai_low_confidence_count`는 이제 "보류되지 않고 남은 게시 공고" 수다.
   - 검수 대기 공고는 이미 사람을 기다리므로 세지 않는다.
   - 보류 단계가 실패하면 이 값이 남아 게이트가 실패한다. 품질 게이트는 유지된다.
5. **재승인 존중:** 관리자가 보류 뒤 다시 승인하면(`published_at`이 보류 시각보다 늦음) 같은 이미지 판정으로 다시 보류하지 않는다. 새 이미지 판정이 생기면 다시 판단한다.
6. **자동 승인 차단:** `review-current-queue-with-ai.js`는 보류가 걸린 공고를 자동 승인하지 않는다(`auto_approval_blockers: image-confidence-hold`). 보류는 사람만 해제한다.

## 변경

- `.github/workflows/crawler.yml`:
  - 예약 시각을 바꿨다.
  - 보류 단계를 추가했다.
  - 게이트 단계에 `if: !cancelled()`를 넣었다.
  - 아티팩트 경로를 두 곳으로 늘리고 보관 기간을 30일로 했다.
- `scripts/crawler/src/image-confidence-hold.js`(신규): 판정 상태, 보류 계획, 기록, 집계를 담은 순수 함수.
- `scripts/crawler/src/hold-low-confidence-images.js`(신규): dry-run, 적용, 롤백 CLI.
- `scripts/crawler/src/image-confidence-hold.test.js`(신규)
- `scripts/crawler/src/ai-healthcheck.js`: 저신뢰 집계에 같은 규칙을 쓰고, 세부 내역(`confidence_breakdown`)을 보고한다.
- `scripts/crawler/src/review-current-queue-with-ai.js`: 보류 공고의 자동 승인을 막는다.

## 검증

- `pnpm --filter posterlink-crawler test`(`npm test`): 424/424 통과.
- 운영 dry-run(쓰기 없음): `hold-low-confidence-images.js`는 게시 중 이미지 633건 중 보류 대상 0건이다.
- 운영 `ai-healthcheck.js --enforce`(읽기 전용, 하위 스크립트도 dry-run): `quality_gate_status=pass`, 위반 0건, exit 0.
  - `confidence_breakdown`: low 0, unscored 0, manual 1.
- `git diff --check` 통과.

## 운영 영향

- DB 스키마 변경은 없다. 운영 데이터는 이번 작업에서 쓰지 않았다.
- 병합 후 첫 예약 실행부터 보류 단계가 자동으로 운영 데이터를 바꿀 수 있다. 오늘 기준 대상은 0건이다.

## 남은 작업

- 수동 검수 기록에 신뢰도가 없는 문제는 다음 직접 검수 스크립트부터 `confidence`를 기록하거나, 출처를 명시하는 규칙으로 정리한다. 기존 1건에 값을 지어내 넣지는 않는다.
- 병합 후 첫 예약 실행의 시작 시각과 결과, 그리고 `AI Review Queue`의 `workflow_run` 실행을 확인한다.
