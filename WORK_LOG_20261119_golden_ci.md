# 2026-11-19 검수 정답 세트 정확도 CI 자동 측정

## 문제

- `golden:measure`(PR #50)는 정답 세트에 저장된 **크롤러 출력값**을 검수 값과 비교했다.
  - 크롤러 코드를 고쳐도 숫자가 바뀌지 않아 CI 회귀 검사로 쓸 수 없었다.
  - 2~3단계 개선(PR #51~#53)의 '재현' 수치는 로컬 `data/results` 백업으로 따로 계산했다.
- 정답 세트 파일에는 구조화 단계 입력(요약문, `field_verification`)이 없었다.

## 결정

- 정답 세트 각 행에 구조화 입력 `input`을 추가하고, `measure`가 현재 코드의 `buildStructuredPosterFields`로 날짜·주관기관·마감 유형을 다시 추출(재현)해 비교한다.
  - 재현 입력은 `upload-to-supabase.js`를 따른다: 마감일은 서울 날짜만, 행사일은 저장값(시각이 없던 값은 날짜만), 원문은 제목+요약.
  - 업로드 단계의 포털 마감 대조(`decideDeadlineVerification`)는 재현하지 않는다. 그래서 재현 마감일 정확도(74.4%)는 저장값(77.1%)보다 낮다. 기준선이 재현값이므로 회귀 판정에는 영향이 없다.
  - 제목·이미지·링크·분류·대상은 재현하지 않는다(source=`stored`). 정답 세트나 측정 코드가 바뀔 때만 움직인다.
- 저장소가 공개이므로 `input`에서 전화번호·이메일을 `[phone]`/`[email]`로 가리고, `facts.contact`, 모델 사유, 검수 메모는 넣지 않는다(297곳 가림).
  - 가림 처리 때문에 전화번호 숫자가 날짜로 오인되는 경우는 재현에서 빠질 수 있다.
- 기준선은 행 수(정답 개수)로 저장하고, 필드별로 1행보다 많이 떨어지면 실패한다. 오르면 통과하고 `golden:baseline` 갱신을 안내한다.

## 변경

- `scripts/crawler/src/review-golden-set.js`
  - `build --results=<dir>`: 결과 폴더 지정, 행마다 가린 `input` 저장
  - `measure`(기본 재현, `--stored`는 저장값, `--json`)
  - `check [--tolerance=1] [--summary=<file>]`: 기준선 대비 표 출력, 회귀 시 종료 코드 1
  - `baseline`: 기준선 파일 갱신
  - 행사 시작·종료 '분' 단위 항목 추가
- `scripts/crawler/test-fixtures/review-golden-set.json`: 같은 17개 묶음으로 다시 만듦. 266행의 crawler/reviewed 값은 기존과 동일(차이 0), `input`만 추가(0.6MB → 1.6MB)
- `scripts/crawler/test-fixtures/review-golden-baseline.json`: 새 기준선
- `scripts/crawler/package.json`: `golden:check`, `golden:baseline`
- `.github/workflows/crawler-golden-set.yml`: `scripts/crawler/**` 변경 PR·main 푸시에서 `golden:check`, 결과 표를 `$GITHUB_STEP_SUMMARY`에 기록. 비밀값·네트워크·DB 없음
- 테스트 8개 추가(가림, 입력 선별, 재현, 결정성, 허용 오차, 개선·행 수 변경, 커밋된 기준선 일치)

## 기준선 (origin/main `c84f200`, 266행)

| 항목                        | 출처   | 저장값 | 재현(기준선) |
| --------------------------- | ------ | ------ | ------------ |
| title                       | stored | 181    | 181 (68.0%)  |
| organizer_name              | replay | 174    | 174 (65.4%)  |
| deadline_type               | replay | 205    | 201 (75.6%)  |
| application_end_at (day)    | replay | 205    | 198 (74.4%)  |
| application_end_at (minute) | replay | 113    | 118 (44.4%)  |
| application_start_at (day)  | replay | 189    | 196 (73.7%)  |
| event_start_at (day)        | replay | 224    | 223 (83.8%)  |
| event_start_at (minute)     | replay | 88     | 126 (47.4%)  |
| event_end_at (day)          | replay | 208    | 207 (77.8%)  |
| event_end_at (minute)       | replay | 87     | 116 (43.6%)  |
| thumbnail_url               | stored | 250    | 250 (94.0%)  |
| links (no wrong link)       | stored | 235    | 235 (88.3%)  |
| links (exact set)           | stored | 208    | 208 (78.2%)  |
| categories                  | stored | 163    | 163 (61.3%)  |
| audiences                   | stored | 228    | 228 (85.7%)  |

## 검증

- `pnpm --filter posterlink-crawler test` 464/464 통과
- `npm run golden:check` 통과. `TZ=UTC`, `Asia/Seoul`, `America/Los_Angeles`에서 `measure --json` 결과 동일
- 일부러 고장: `extractDeadlineTime`이 항상 `null`을 돌려주게 하면 `application_end_at (minute)` 118 → 81(−37)로 `check`가 종료 코드 1로 실패(되돌림)
- 열린 PR 코드로 재현(로컬, 되돌림): #55·#57의 `poster-structured-fields.js`는 organizer_name 174 → 193(+19)로 통과하고 갱신 안내 출력. #54는 변화 없음
- `git diff --check` 통과

## 남은 작업

- PR #54~#57 병합 뒤 `npm run golden:baseline`으로 기준선을 갱신해 커밋한다(개선분을 잠그기 위해).
- 새 검수 묶음이 생기면 로컬에서 `npm run golden:build -- --results=<data/results>` 후 기준선을 함께 갱신한다.
- 포털 마감 대조 단계와 제목·링크·이미지 추출은 재현 대상이 아니다. 원문 HTML을 정답 세트에 넣어야 가능하다.
