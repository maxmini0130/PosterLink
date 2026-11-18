# 2026-11-19 잘못 덧붙은 공고 링크 정리 (운영 데이터)

## 문제

PR #56 이전의 중복 판정은 공고에 덧붙은 청년몽땅정보통 링크를 그 공고 자신의 원문 주소로 취급했다. 그래서 한 번 잘못 병합되면 덧붙은 공고가 다시 수집될 때마다 또 병합되고 링크가 쌓였다. 예: 강북여성인력개발센터 <나만의 시그니처 향기>에 강북구 무료법률상담실·보건소 자원봉사자·청년아르바이트 등 다른 공고 8건의 링크가 붙어 있었다.

## 조사 (읽기 전용)

- 청년몽땅정보통 공고 링크가 2개 이상 붙은 공개 공고: 36건 (11-19 기준, 이전 조사 29건에서 증가)
- `build-snowball-link-cleanup-20261119.js`: 링크를 삽입 시각(2초 이내)으로 묶고, 묶음마다 청년몽땅정보통 원문 제목을 GET으로 가져와 포스터 제목과 비교 → `data/results/snowball-links-20261119/candidates.json`, `backup.json`
- 원문 제목은 `og:title`이 아니라 본문 카드 이미지 다음 `<strong>`에 있다.

## 결정

- 지움: 다른 프로그램이나 다른 회차(10월 공고에 붙은 11월 회차 등) 공고의 묶음, 그 묶음에 함께 들어온 신청·원문 링크
- 남김: 생성 시점 묶음, 같은 공고의 재게시(제목 동일·오타 수정·기간 연장), 강동 티톡 12월 추가모집, 커리어 위크 전체 안내, 출처를 알 수 없는 묶음(청년몽땅정보통 링크 없음)
- 대표 링크, 공고 자신의 원문 주소는 지우지 않는다(스크립트가 검사).
- 병합 때 함께 붙은 분류·대상은 이번에 건드리지 않는다.

## 변경

- `scripts/crawler/src/build-snowball-link-cleanup-20261119.js` (읽기 전용 계획)
- `scripts/crawler/src/apply-snowball-link-cleanup-20261119.js` (동결 계획, dry-run GET 전용, `--apply --confirm=SNOWBALL_LINKS_20261119`, 동시 변경 검사, 다시 읽어 검증, `field_verification.snowballLinkCleanup20261119`에 지운 링크 원본 보존, `admin_actions` 기록, 재실행 금지)

## 검증

- dry-run 통과: 포스터 19건, 링크 71개, plan `15e39d60ad155c983f367b2ef4167b86b934fa233e6893345cbfb5ac23ca4023`
- 대상 포스터는 모두 `verification_status`가 needs_review/unverified라 링크 삭제 트리거가 검증 상태를 바꾸지 않는다(적용 중에도 검사).

## 남은 일

- 사용자가 `--apply` 실행 (Claude 실행은 권한에서 막힘)
- 복구: `field_verification.snowballLinkCleanup20261119.removedLinks`의 행을 `poster_links`에 다시 넣으면 된다.
- 병합으로 붙은 분류·대상 정리는 별도 검토
