# 2026-08-04 일일 크롤러 복구

## 1. 장애 확인

- `Daily Crawler`가 2026-07-29부터 2026-08-03까지 6회 연속 실패했다.
- 전체 사이트를 한 프로세스에서 순차 처리하다 내부 `150m` 제한에 걸려 `exit code 143`으로 종료됐다.
- 크롤러가 끝난 뒤에만 업로드하던 구조라 수집 결과와 품질 게이트가 모두 건너뛰어졌다.
- 최근 반복 로그를 대조한 결과 `kesco`가 `2026 전력설비 안전성 향상대회 유공자 포상 안내` 처리 다음에서 장시간 정체되는 패턴을 재현했다.

## 2. 수정

- 전체 수집을 4개 round-robin 배치로 분할하고 `fail-fast: false`로 병렬 실행한다.
- 배치별 제한을 `90m`로 분리하고 결과 파일과 artifact 이름을 배치별로 구분한다.
- 업로드는 개별 사이트 JSON이 아닌 배치 최종 `all_*.json`만 선택한다.
- 모든 배치가 끝난 뒤 AI 품질 게이트를 한 번만 실행한다.
- 사이트 하나가 끝날 때마다 배치 요약 파일을 체크포인트로 갱신한다.
- 크롤러 단계가 실패해도 업로드 단계를 `always()`로 실행해 완료된 사이트 결과를 보존한다.
- 반복 정체가 확인된 `kesco`는 일일 전체 실행에서 격리했다. `--site kesco` 수동 실행은 계속 가능하다.

반영 커밋:

- `fc9ae28 fix: split daily crawler into batches`
- `88bba11 fix: checkpoint crawler batch results`
- `19a256a fix: isolate stalled crawler source`

## 3. 검증

- 크롤러 테스트: `110/110` 통과
- 모노레포 테스트: `19/19` 통과
- Prettier 및 `git diff --check`: 통과
- 최종 커밋 CI: [성공](https://github.com/maxmini0130/PosterLink/actions/runs/30832300287)

실운영 전체 실행:

- [분할 적용 실행](https://github.com/maxmini0130/PosterLink/actions/runs/30826559130)
- 배치 0, 1, 2는 수집과 Supabase 업로드까지 성공했다.
- 배치 3은 격리 전 `kesco`에서 정확히 `90m` 후 실패해 원인을 재현했다.
- 완료 배치의 수집 통계와 업로드 결과가 운영 DB에 반영된 것을 확인했다.

최신 코드 전체 dry-run:

- [격리 적용 실행](https://github.com/maxmini0130/PosterLink/actions/runs/30834155002)
- 4개 배치 모두 성공했다.
- 원격 로그에서 `--exclude-site kesco`와 `excluded scheduled sites: kesco`를 확인했다.
- 전체 대상은 `39`개에서 `38`개로 조정됐고, 격리된 사이트를 제외한 배치 분배가 정상 동작했다.

최종 AI 헬스체크:

- `quality_gate_status=pass`
- embedding coverage: `100%`
- field verification coverage: `60.0%`
- image AI coverage: `27.9%`
- review queue reject 후보: `0건`
- 이미지 비포스터/저신뢰 후보: `0건`
- 필드 보정 후보: `0건`
- 신규 검수 대기: `53건`

## 4. 다음 작업

- [x] 일일 전체 수집의 단일 `150m` 제한 제거
- [x] 배치별 수집·업로드 및 단일 품질 게이트 구성
- [x] 시간 초과 시 완료 사이트 결과 체크포인트 보존
- [x] 반복 정체 `kesco` 일일 실행 격리
- [x] 운영 업로드와 최신 4배치 dry-run 검증
- [ ] `kesco` 어댑터의 정체 요청을 별도 재현하고 요청 단위 제한·취소 처리 추가
- [ ] 신규 검수 대기 53건 관리자 판정
