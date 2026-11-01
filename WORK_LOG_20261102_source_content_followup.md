# 2026-11-02 검수 대기 23건 원문 대조 및 내용 정정

사용자 요청: 남은 23건의 원본 링크와 모든 문구를 읽고 내용을 수정한다.

원문 상세, 신청서, 원문 포스터, 첨부파일을 대조하여 23건의 상세 설명과 구조화 필드를 운영 DB에 정정했다. 강북 주택 공고 PDF 29쪽과 B2G 공고·신청서 HWP 본문도 확인했다. 신청기간과 행사기간, 주관기관과 수집기관, 원문과 신청 링크를 구분했다. 원문 간 충돌은 설명에 남기고 확정할 수 없는 날짜·연령은 비웠다. 동적 페이지 조회 실패는 확인 성공으로 처리하지 않았다.

## 결과

- 23건 내용 저장 및 항목별 read-back 검증 완료. 게시·검수 상태 변경 0건.
- 무관한 링크 관계 69개 분리, 정확한 링크 7개 추가 및 기존 링크 5개 수정. 공고 자체 삭제 없음.
- 날짜 필드 47개 정정. 별도 최종 점검에서 멘토링 모집 단위, 이끼볼 인원, 농촌체험 혜택 요약 3개 추가 정정.
- 기존 원문·상세·field_verification·분리 링크는 백업 및 검증 근거에 보존. 사람의 기존 확정 판정과 이미지·분류 관계 유지.
- 검수 대기 23건 공개 검색 노출 0건, 공개 집계 261건 일치.

항목별 내용은 [검수 기록](docs/SOURCE_CONTENT_REVIEW_20261102.md)에 기록했다.

## 실행과 검증

- `apply-source-content-20261102.js`: 고정 23개 ID, 전체 백업, 계획 SHA-256, dry-run, 수정시각 조건, 필드 허용 목록, 단계별 저널, 저장 후 비교 적용.
- 계획 SHA-256: `afe3a1071c5bdb21856b81bf56d5a641a296c8d149eb89252fd89faa608343d2`.
- `apply-source-content-facts-20261102.js`: 3개 요약 필드 보완. 첫 저장 후 관계 정렬 검증에서 관계에 없는 id를 참조해 중단했다. JSON 내용 정렬로 고친 후 저널·현재값·원본 관계를 대조하여 `--resume`으로 복구, 3건 검증 완료. 첫 저장을 중복 적용하지 않았다.
- 크롤러 테스트 385개 통과. Node 20 구문 검사, Prettier, `git diff --check` 수행.
- AI healthcheck 실패: `image_ai_public_nonposter_count=1`, `image_ai_low_confidence_count=2`, `field_correction_candidates=1`, `public_nonposter_reject_candidates=1`. 이 상태를 승인으로 대체하지 않았다.
- 웹·모바일 코드, 스키마·RLS 변경 없음. 웹 build/lint와 모바일 typecheck는 실행하지 않았다. push·배포 없음.

## 근거와 복구

개인정보가 포함될 수 있는 원문·신청서·운영 스냅샷은 커밋하지 않는다. 로컬 `data/results/source-review-20261102-followup/`의 `backup.json`, `plan.json`, `applied-content.json`, `content-after-*.json`, `facts-before-*.json`, `facts-after-*.json`, `applied-facts.json`에 근거와 변경 전후를 보존했다. 완료 저널이 있으면 최초 실행을 차단한다. 복구가 필요하면 현재값과 이후 사용자 변경을 확인한 후 해당 필드·관계만 백업에서 복구해야 한다. 전체 행 덮어쓰기는 금지한다.
