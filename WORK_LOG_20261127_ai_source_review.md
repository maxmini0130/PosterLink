# 2026-11-27 'AI 검토 승인' 원문 검토 자동 반영

상태: 검토 대기 · Claude Code · 기준 `977826c`(origin/main) · 브랜치 `feat/ai-source-review-20261127` (미커밋)

> 다른 PC에서 이어할 때는 맨 아래 [다른 PC에서 이어하기](#다른-pc에서-이어하기-1127-기준)부터 읽는다.

## 문제

관리자 검수 화면의 'AI 검토 승인' 버튼(`AI Review Queue` 워크플로, thorough 모드)이 실제로는 거의 아무것도 승인하지 못했다. 같은 날 사람이 원문을 대조해 15건을 처리한 결과와 비교했다([WORK_LOG_20261127_source_review.md](WORK_LOG_20261127_source_review.md)).

- 11/27 10:26 KST 버튼 실행(run 45922562257)
  - 모델은 15건 모두 '승인'으로 판단했다. 적용 가능한 건은 0건이었다.
  - 막힌 사유: 연도 없는 날짜 7, 마감 불일치 4, 중복 의심 3, 신뢰도 미달 4, OCR 1, 기타.
- 모델 판단도 틀렸다. 막지 않았다면 유료 티켓 판매 글(98bc2c33)과 이미 마감된 3건(03f45dc4, 05dbb7bb, e02d9a1c)이 공개될 뻔했다.
- 원인
  - `review-current-queue-with-ai.js`는 크롤러가 DB에 저장한 요약 텍스트만 읽는다. 원문 페이지·신청 페이지·포스터 이미지를 다시 보지 않는다.
  - 고칠 수 있는 값이 날짜 4개, 마감 유형, 분류, 상태뿐이다. 제목·기관·대상·요약·링크·이미지·대상 태그와 반려는 다루지 못한다.
  - 크롤러 경고(연도 없는 날짜 등)를 원문으로 해소할 수단이 없어 경고가 남으면 무조건 대기로 남는다.

## 결정

- 버튼 실행(thorough)을 수작업 원문 검토 절차와 같은 흐름으로 바꾼다. 원문 재수집 → AI 수정안 → 규칙 검증 → 반영.
- 반영 방식(사용자 결정): 검증을 통과한 건은 자동 반영한다. 오판 가능성이 있는 건은 별도 목록에서 확인한다.
  - 자동 반영 조건
    - 읽을 수 있는 원문이 1개 이상이다.
    - 규칙 위반이 없다.
    - 텍스트 근거 인용이 모두 실제로 받아 온 원문에 있다.
    - 신뢰도가 0.85 이상이다.
    - 사람 확정 판정·품질 게이트 보류·이전 자동 반영 기록이 없다.
  - 사후 확인 목록(`/admin/ai-review-checks`)에는 위험 신호가 '높음'인 건만 올린다.
    - 높음: 반려, 마감일 미확인·없음, 신뢰도 0.85~0.92, 중복 후보가 있었던 건, 날짜를 이미지에서만 읽은 건.
    - 낮음(기록에만 표시): 기관 변경, 대표 이미지 교체, 대상 태그 변경, 링크 삭제, 기타 이미지 근거, 남은 의문점.
  - 규칙에 걸린 건은 검수 대기에 남긴다. 사유를 `field_verification.sourceReviewHold`에 기록한다.
- 사용자 요청 경로(확인·되돌리기 API)는 관리자 본인 세션으로만 쓴다(RLS 적용, 서비스 역할 키 미사용).
- 예약 실행(비 thorough)은 기존 날짜·분류 검토를 그대로 둔다.

## 변경

크롤러(`scripts/crawler/src/`)

- `source-review-fetch.js`(새)
  - 저장된 링크와 그 페이지가 가리키는 신청 페이지(최대 4개), 이미지(최대 5개)를 다시 받는다. 요청마다 시간 제한이 있고 실패는 그 출처만 표시한다.
  - 네이버 블로그는 본문 프레임(`PostView`)을 읽는다. 구글폼은 폼 데이터에서 안내문을 꺼낸다.
  - undici가 거부하는 비표준 HTTP 응답(중랑구 환경교육센터)은 axios 관대 파서로 다시 시도한다.
  - 포털·사이트 홈으로 가는 '신청하기' 링크는 따라가지 않는다.
- `source-review-proposal.js`(새): 원문 텍스트와 포스터 이미지를 OpenAI Responses API(strict JSON schema)에 보내 수작업 제안과 같은 형식의 수정안을 받는다. 규칙 문구는 이번 수작업 검수 지시와 같다.
- `source-review-validate.js`(새, 순수 함수): 11/18b·11/27 적용 스크립트의 검사를 옮겼다.
  - 날짜 형식(+09:00), 날짜만 있는 마감은 23:59:59, 포털 00:00 금지
  - 공개 공고의 마감 경과 금지, 마감 처리 사유
  - 대표 링크 1개, 남기는 썸네일 존재·포스터 여부, 대상·분류 ID 유효성
  - 자리표시 기관명(청년몽땅정보통·기타 (…)) 금지, 근거 인용 원문 대조, 위험 신호 분류
- `source-review-apply.js`(새): 수작업 스크립트와 같은 순서로 쓴다(`updated_at` 조건부 claim → 관계 → 공고 → 재조회 비교). 되돌리기용 이전 값(필드·삭제한 링크/이미지·바꾼 링크 속성·분류·대상)을 `field_verification.sourceReviewAuto.previous`에 남긴다.
- `review-queue-source-review.js`(새 CLI)
  - 기본은 dry-run(쓰기 요청 차단)이다. `--apply --confirm=AI_SOURCE_REVIEW_APPLY`일 때만 쓴다.
  - 평가용 `--ids`, `--rows-file`(저장한 검수 전 행으로 dry-run)을 지원한다.
  - 반영 건과 보류 건을 `admin_actions`(`ai_source_review`)에 기록한다.
- `attachment-text-extractor.js`: `decodeBuffer`, `cleanExtractedText`를 export했다(동작 변경 없음).

웹

- `/admin/ai-review-checks`(새 화면): 세 영역으로 나뉜다.
  - 자동 반영·확인 필요: 위험 신호, 판단 근거·인용, 확인 완료·되돌리기·공고 보기 버튼
  - 반영 안 함·검수 대기: 규칙 위반 사유, 검수 화면 링크
  - 최근 자동 반영
- `/api/admin/ai-review-checks`(새): GET 목록, POST `confirm`·`revert`.
  - 서버에서 관리자 역할을 다시 확인한다.
  - 목록을 읽은 뒤 공고가 바뀌었으면(`updated_at`) 409를 반환한다.
  - 되돌리기는 이전 값을 복원하고 검수 대기(`review`)로 보낸다. 원래대로 못 돌린 항목은 화면에 알린다.
- `apps/web/lib/sourceReviewChecks.ts`(새): 되돌리기 계획, 위험 신호 라벨. 테스트 6건.
- `/admin/posters`: 버튼 확인창과 안내 문구를 새 동작에 맞게 바꾸고 확인 화면 링크를 넣었다. 관리자 메뉴에 'AI 반영 확인'을 추가했다.

워크플로·DB·문서

- `.github/workflows/ai-review-queue.yml`
  - thorough일 때 새 원문 검토를 실행하고, 그 뒤 남은 건에 기존 비포스터 정리를 실행한다.
  - 기존 날짜·분류 검토는 thorough가 아닐 때만 돈다.
  - 시간 제한을 60분으로 늘렸다. 모델 변수는 `OPENAI_SOURCE_REVIEW_MODEL`(기본 `gpt-5`)이다.
- `supabase/migrations/20261127010000_admin_delete_poster_audiences_images.sql`(새, **미적용**)
  - `poster_audiences`·`poster_images`에 관리자 DELETE 정책을 추가한다.
  - 없으면 되돌리기가 '추가된 대상 태그 삭제'를 하지 못하고, 그 사실을 화면에 알린다.
  - 확인 쿼리와 롤백은 파일 머리말에 있다.
- `README.md`: 관리자 경로와 버튼 동작을 기록했다. 루트 `package.json`의 테스트 목록에 새 웹 테스트를 추가했다.

## 검증

- 크롤러 테스트 544/544 통과. 새 테스트 28건은 실제 오판 사례(포털 00:00, '기타 (…)' 기관, 마감 지난 공개, 티켓 판매 반려, 지어낸 인용, 대표 링크 2개, 썸네일 삭제)로 만들었다.
- 루트 `pnpm test` 413/415. 실패 2건은 `scripts/security/profile-role-release.test.ts`이다. 내 변경을 뺀 상태에서도 같은 2건이 실패해 기존 실패로 확인했다(11/19 작업 로그에도 기록).
- `pnpm --filter web lint`, `pnpm --filter web build` 통과(`/admin/ai-review-checks`, `/api/admin/ai-review-checks` 생성). `git diff --check` 통과. 새 파일 Prettier 통과(README는 기존 경고 그대로).
- 실제 데이터 대조(읽기 전용)
  - 검증기: 오늘 사람이 확정한 15건 제안을 넣었다. 자동 반영 7, 반영 후 확인 6(반려·중복 판단·마감 미확인·이미지 날짜), 보류 2(인용이 원문과 글자 그대로 맞지 않음)였다. 확인 목록 6건은 수작업 검수 때 따로 표시한 건과 같다.
  - 수집: 15건의 원문을 새 모듈로 다시 받았다. 사람 근거 인용 77/86이 받아 온 텍스트에서 확인됐다. 나머지는 서브에이전트가 원문 밖에서 찾은 페이지(링크트리 경유 블로그, 별도 구글폼)와 AJAX로만 본문을 주는 동덕여대 페이지였다.
- **실행하지 못한 검증**
  - 모델 호출을 포함한 끝-끝 평가. 이 PC에 `OPENAI_API_KEY`가 없다. 키가 있는 곳에서 아래 dry-run을 실행해 사람 판정과 비교해야 한다.

    ```
    cd scripts/crawler
    node src/review-queue-source-review.js --rows-file=../../data/results/source-review-20261127/backup.json
    ```

  - 관리자 화면의 Playwright 확인. 관리자 테스트 계정 비밀번호 변경이 남아 있어 로그인 화면 검증을 하지 못했다.

## 운영 영향과 반영 순서

- 병합 전에는 운영 영향이 없다. 병합하면 `main` 배포로 웹 화면이 바뀌고, 다음 버튼 실행부터 새 흐름이 운영 DB에 쓴다.
- 권장 순서
  1. 교차 검토
  2. 키가 있는 환경에서 `--rows-file` dry-run으로 오늘 15건과 비교
  3. 마이그레이션 적용(사용자)
  4. 병합
  5. 첫 버튼 실행은 워크플로 수동 실행(`apply=false`, `thorough=true`)으로 보고서만 확인
  6. 이후 버튼 사용
- 롤백
  - 코드: 병합 커밋 되돌리기. 예약 실행은 원래 흐름이라 영향이 없다.
  - 데이터: 자동 반영된 건은 확인 화면의 '되돌리기'로 하나씩 복원한다. 복원 자료는 각 공고의 `field_verification.sourceReviewAuto.previous`에 있다.
  - 마이그레이션: 파일 머리말의 DROP POLICY.

## 남은 작업

- 끝-끝 dry-run 평가와 결과 기록(위)
- 관리자 화면 Playwright 확인(모바일·데스크톱)
- 동덕여대처럼 AJAX로만 본문을 주는 출처는 원문을 못 읽어 보류된다. 자주 나오면 출처별 어댑터를 추가한다.
- 확인 완료·되돌리기 결과를 골든셋(`review-golden-set`)에 넣어 정확도를 계속 잰다.

## 다른 PC에서 이어하기 (11/27 기준)

### 지금 상태

- 모든 변경이 **회사 PC 작업 트리에만 있고 커밋되지 않았다.** 다른 PC로 옮기려면 커밋하고 push해야 한다. push는 사용자가 한다(CLAUDE.md 11절).
- 브랜치 `feat/ai-source-review-20261127`, 기준 `977826c`(origin/main)
- 운영 DB
  - 오늘 수작업 검수 15건은 반영을 마쳤다(공개 11, 마감 3, 반려 1). 검수 대기 0건, healthcheck pass. 자세한 내용은 [WORK_LOG_20261127_source_review.md](WORK_LOG_20261127_source_review.md)에 있다.
  - 새 기능은 운영에 쓴 적이 없다. 마이그레이션 `20261127010000`은 **미적용**이다.
- 검증: 크롤러 544/544, 웹 lint·build 통과, 루트 413/415(기존 실패 2건)

### 1. 회사 PC에서 커밋하고 push하기 (사용자 실행)

두 커밋으로 나눈다. 오늘 수작업 검수 기록과 새 기능이 섞이지 않게 하기 위해서다.

```powershell
cd C:\MaxMini_Project\PosterLink

# 커밋 1: 수작업 원문 검수 기록과 적용 스크립트(11/09·11/11·11/27)
git add WORK_LOG_20261109_review_queue_source_verification.md WORK_LOG_20261111_review_queue_source_verification.md WORK_LOG_20261127_source_review.md scripts/crawler/src/apply-review-queue-source-verified-20261111.js scripts/crawler/src/apply-source-review-20261127.js scripts/crawler/src/apply-source-review-20261127-resume.js
git commit -m "chore(review): record manual source review runs (11/09, 11/11, 11/27)"

# 커밋 2: AI 원문 검토 자동 반영 기능
git add .github/workflows/ai-review-queue.yml README.md package.json apps/web/app/admin/layout.tsx apps/web/app/admin/posters/page.tsx apps/web/app/admin/ai-review-checks apps/web/app/api/admin/ai-review-checks apps/web/lib/sourceReviewChecks.ts apps/web/lib/sourceReviewChecks.test.ts scripts/crawler/src/attachment-text-extractor.js scripts/crawler/src/source-review-fetch.js scripts/crawler/src/source-review-proposal.js scripts/crawler/src/source-review-validate.js scripts/crawler/src/source-review-validate.test.js scripts/crawler/src/source-review-apply.js scripts/crawler/src/review-queue-source-review.js supabase/migrations/20261127010000_admin_delete_poster_audiences_images.sql WORK_LOG_20261127_ai_source_review.md
git commit -m "feat(review): source-based AI review with auto-apply and post-check list"

git status --short   # 비어 있어야 한다
git push -u origin feat/ai-source-review-20261127
```

- push만 하고 PR 병합은 하지 않는다. `main`에 병합하면 운영 웹이 배포된다.

### 2. 평가 자료 옮기기 (git에 없음)

`data/`는 `.gitignore` 대상이라 push해도 다른 PC에 가지 않는다. 끝-끝 평가에 필요한 파일만 USB나 개인 클라우드로 옮긴다. **저장소·채팅·공개 위치에는 올리지 않는다.** DB 행 원본이 들어 있다.

| 파일 (`data/results/source-review-20261127/`) | 크기  | 용도                                           |
| --------------------------------------------- | ----- | ---------------------------------------------- |
| `backup.json`                                 | 540KB | 검수 전 15건 행. `--rows-file` 입력(필수)      |
| `plan.json`                                   | 132KB | 사람이 확정한 판정. 비교 기준(필수)            |
| `proposals/`                                  | 156KB | 사람 제안 원본(비교용, 권장)                   |
| `taxonomy.json`, `overrides.json`             | 작음  | 참고                                           |
| `sources/`                                    | 67MB  | 받아 둔 원문. 없어도 된다(평가 때 다시 받는다) |

다른 PC에서도 같은 경로 `data/results/source-review-20261127/`에 둔다.

### 3. 다른 PC에서 준비

```powershell
cd <저장소 경로>
git fetch origin
git switch feat/ai-source-review-20261127
git log --oneline -3          # 위 두 커밋이 보여야 한다
pnpm install
pnpm --filter posterlink-crawler test   # 544/544 기대
```

환경변수(값은 파일·커밋·채팅에 남기지 않는다)

- `NEXT_PUBLIC_SUPABASE_URL`(또는 `SUPABASE_URL`)과 `SUPABASE_SERVICE_ROLE_KEY`
  - 분류·대상 목록과 중복 후보를 읽는 데 쓴다.
  - dry-run은 쓰기 요청을 막는다.
- `OPENAI_API_KEY`
  - 실제 키여야 한다. 자리표시 문자열을 넣으면 시작할 때 바로 거부된다.
  - 평가용 키를 새로 만들어 쓰고 끝나면 삭제하는 방법을 권한다.
- `REVIEW_TODAY_KST=2026-11-27`
  - 평가 기준일을 사람이 검수한 날로 고정한다.
  - `--rows-file`·`--ids` 평가에서만 마감 경과 검사도 그날 정오(KST) 기준으로 한다. 실제 실행은 항상 현재 시각을 쓴다.
  - 설정하지 않으면 실행한 날을 기준으로 마감 여부를 판단해서 사람 판정과 비교할 수 없다.

### 4. 끝-끝 dry-run 평가 (다음 할 일)

```powershell
cd scripts/crawler
$env:OPENAI_API_KEY = "<실제 키>"
$env:REVIEW_TODAY_KST = "2026-11-27"
node src/review-queue-source-review.js --rows-file=../../data/results/source-review-20261127/backup.json
```

- 결과 파일: `data/results/ai-source-review-20261127-<runId>.json`
- 모델은 `gpt-5`가 기본이다. 15건 모두 이미지와 원문을 보낸다.
  - 비용은 OpenAI Usage에서 평가 키 사용액으로 확인해 이 로그에 적는다.
- 비교할 항목: 결과 `items[]`와 `plan.json`을 공고 id별로 맞춰 본다.
  - 판정(공개·마감·반려)이 같은지
  - 결과(자동 반영·반영 후 확인·보류)
  - 제목·기관·마감일·마감 유형·분류가 같은지
  - 위험 신호와 규칙 위반 사유
- 꼭 확인할 오판 사례
  - 98bc2c33(유료 티켓 판매) → 반려
  - 03f45dc4, 05dbb7bb, e02d9a1c(이미 마감) → 마감, 공개되면 안 됨
  - 청년포털 `00:00`이 마감 시각으로 쓰이지 않는지
  - 기관명에 `청년몽땅정보통`·`기타 (…)`가 남지 않는지
- 규칙 기반 검증기만 돌린 기준치(사람 제안 입력): 자동 반영 7, 반영 후 확인 6, 보류 2. 모델 결과가 이보다 크게 나쁘면 병합 전에 프롬프트(`RULES`)나 규칙을 고친다.
- 결과와 판단은 이 로그의 '검증' 절에 추가한다.

### 5. 그 뒤 순서

1. 관리자 화면 Playwright 확인(모바일·데스크톱). 관리자 테스트 계정 비밀번호 변경이 먼저 필요하다.
2. Codex 교차 검토
   - 검토 요청에는 커밋 SHA와 지시서를 넘긴다.
   - 검토 기록은 `WORK_LOG_20261127_ai_source_review_review.md`로 같은 브랜치에 남긴다.
3. 사용자 실행: 마이그레이션 `20261127010000` 적용 → PR 병합(merge commit) → 워크플로 수동 실행(`apply=false`, `thorough=true`)으로 보고서 확인 → 버튼 사용
