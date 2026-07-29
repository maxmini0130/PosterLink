# PosterLink AI Operations Log - 2026-07-29

2026-07-29에는 전날 추가한 AI 백필/healthcheck 도구를 사용해 운영 데이터 커버리지를 목표치까지 확장하고, 결과를 검증했다.

## 1. 시작 상태 점검

실행:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-start-20260729.json
```

시작 수치:

- embedding coverage: 100%
- field verification coverage: 37.8%
- image AI coverage: 8.0%
- review queue: 4건
- review queue reject candidates: 0건
- field correction candidates: 0건
- nonposter reject candidates: 0건
- golden set labeled rows: 0건

## 2. Field Verification Coverage 50% 이상 확대

실행:

```bash
pnpm --filter posterlink-crawler verify:backfill -- --limit=60 --concurrency=3 --apply --output=data/results/field-verification-backfill-20260729-apply-60.json
```

결과:

- candidate_count: 60
- applied_count: 60
- failed_count: 0
- concurrency: 3

중간 검증:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-after-field-backfill60-20260729.json
```

- field verification coverage: 51.6%
- field correction candidates: 14건
- nonposter reject candidates: 0건

## 3. AI 보정값 실제 필드 반영

Dry-run:

```bash
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --output=data/results/field-verification-corrections-20260729-after-backfill60-dryrun.json
```

- scanned_count: 225
- correction_count: 14

Apply:

```bash
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --apply --output=data/results/field-verification-corrections-20260729-after-backfill60-apply.json
```

결과:

- correction_count: 14
- source_org_name 보정 포함
- application_end_at 보정/추가 포함

## 4. Image AI Coverage 20% 이상 확대

실행:

```bash
pnpm --filter posterlink-crawler image:backfill -- --limit=55 --concurrency=3 --apply --output=data/results/image-classification-backfill-20260729-apply-55.json
```

결과:

- candidate_count: 55
- applied_count: 55
- failed_count: 0
- nonposter_count: 1
- concurrency: 3

이미지 AI가 잡은 비포스터:

- `[소식] 마포구, 청소년 음악축제 '제3회 유스 썸머 나잇 페스타: 스쿨 樂(락) 스트리트'에 참가할 중·고등학교 밴드동아리 10개 팀 모집(2026.07.14.)`
- visualType: `news article webpage screenshot`
- reason: 온라인 뉴스 기사 화면이며, 독립적인 포스터/플라이어가 아니라는 판정.

## 5. 이미지 기반 비포스터 반려 처리

Dry-run:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --output=data/results/nonposter-cleanup-20260729-after-image55-dryrun.json
```

- reject_count: 1
- issue: `image-not-poster`

Apply:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --apply --output=data/results/nonposter-cleanup-20260729-after-image55-apply.json
```

결과:

- reject_count: 1
- 뉴스 기사 화면 1건을 `rejected` 처리.

## 6. 최종 Healthcheck

실행:

```bash
pnpm --filter posterlink-crawler ai:healthcheck -- --golden-set=data/baseline/human_golden_set_seed_20260728.csv --output=data/results/ai-healthcheck-final-20260729.json
```

최종 수치:

- embedding coverage: 100%
- field verification coverage: 51.5%
- image AI coverage: 20.5%
- review queue: 4건
- review queue reject candidates: 0건
- image AI nonposter count: 0건
- image AI low confidence count: 0건
- field correction candidates: 0건
- nonposter reject candidates: 0건
- golden set labeled rows: 0건
- golden set macro accuracy: n/a

## 7. 최종 검증

추가 dry-run:

```bash
pnpm --filter posterlink-crawler cleanup:review-nonposters -- --statuses=review,published --output=data/results/nonposter-cleanup-20260729-final-dryrun.json
pnpm --filter posterlink-crawler verify:apply-corrections -- --limit=1000 --min-confidence=0.85 --output=data/results/field-verification-corrections-20260729-final-dryrun.json
```

결과:

- published/review 비포스터 reject 후보: 0건
- field verification correction 후보: 0건

테스트:

```bash
pnpm --filter posterlink-crawler test
git diff --check
```

결과:

- crawler tests: 72/72 통과
- `git diff --check`: 통과

## 8. 남은 작업

- Human golden set은 100건 중 55건의 포스터 여부를 사람이 판정했다.
- 이미지 선택은 47건, 원문 링크는 54건이 채점되어 부분 macro accuracy
  87.5%를 확정했다.
- 제목, 주관기관, 마감일, 카테고리, 중복 판정은 아직 사람 라벨이 없다.
- 미검수 45건은 rejected 15건과 pending candidate 30건이다.
- 상세 검수 및 데이터 보정 기록은
  `WORK_LOG_20260729_human_golden_review.md`에 이어서 관리한다.

## 9. 자동 품질 게이트

사람 검수에서 발견한 오류 유형이 다시 들어오는 것을 자동으로 감지하도록
CI와 일일 크롤러에 품질 게이트를 연결했다.

- 일반 CI에 독립된 `crawler-ci` 작업을 추가해 크롤러 회귀 테스트를 실행한다.
- 일일 크롤러도 실제 수집 전에 같은 회귀 테스트를 실행한다.
- 업로더의 순수 규칙 함수는 Supabase 비밀키 없이 import할 수 있게 하고,
  실제 업로드 직접 실행에서만 DB 설정을 필수로 검사한다.
- 업로드 후 `ai:healthcheck --enforce`를 실행한다.
- 임계치 미달 또는 품질 후보 발생 시 보고서를 먼저 저장하고 종료 코드 2로
  워크플로를 실패 처리한다.
- 성공 및 실패 보고서는 GitHub Actions artifact에 모두 보관한다.
- 커버리지 기준은 GitHub repository variable로 조정할 수 있다.
  - `AI_MIN_EMBEDDING_COVERAGE`: 기본 99%
  - `AI_MIN_FIELD_COVERAGE`: 기본 45%
  - `AI_MIN_IMAGE_COVERAGE`: 기본 20%
- 다음 품질 후보의 허용값은 기본 0건이다.
  - 신청 폼 `source_key`
  - 검수 대기 reject 후보
  - 이미지 AI 비포스터 및 저신뢰 후보
  - 필드 보정 후보
  - published/review 비포스터 후보

운영 DB 검증:

- 정상 기준 실행: `quality_gate_status=pass`
- 강제 실패 기준 실행: 위반 내역 기록 후 종료 코드 2 확인
- crawler tests: 92/92 통과
- web config tests: 13/13 통과
- workflow YAML 및 신규 파일 형식 검사 통과
- `git diff --check` 통과
- embedding coverage: 100%
- field verification coverage: 48.2%
- image AI coverage: 20.4%
- review queue: 3건
- 모든 차단 품질 후보: 0건
- golden-set labeled rows: 55건
- partial macro accuracy: 87.5%

## 10. 현재 작업 리스트

- [x] 신청 폼과 원문 링크 분리 및 업로드 이중 방어
- [x] 원문 포스터 우선순위와 다중 페이지 이미지 보존
- [x] 근거 없는 제목 보정 및 중복 제목 방지
- [x] 알려진 오류 유형 회귀 테스트 추가
- [x] CI 및 일일 크롤러 회귀 테스트 연결
- [x] 일일 업로드 후 AI 품질 게이트 및 artifact 연결
- [x] 방문 로그에서 관리자와 AI/자동 브라우저 주체 분리
- [ ] rejected 15건 사람 판정
- [ ] pending candidate 30건 사람 판정
- [ ] 제목, 주관기관, 마감일, 카테고리, 중복 골든 라벨 작성
- [ ] 전체 골든셋 재채점 및 지표별 목표 확정
- [ ] field verification coverage 60% 이상 확대
- [ ] image AI coverage 30~50% 확대
- [ ] 현재 review queue 3건 처리
- [ ] 다음 일일 수집 결과에서 신규 표본 재감사
- [ ] E2E 관리자 계정 갱신 후 방문 주체 화면 스크린샷 검증
- [ ] 관리자/운영자 핵심 E2E 및 운영 배포 점검
