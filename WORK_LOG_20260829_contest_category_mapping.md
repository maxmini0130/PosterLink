# 2026-08-29 공모전 분야 매핑 보강

## 확인한 사례

- `2026년 가을편 「서울꿈새김판 」 문안 공모`
- 운영 poster id: `f324f854-32e3-4ef6-bb62-2173d3be141b`

## 확인 결과

- 제목과 본문이 처음부터 `문안 공모`, `공모전`, `응모`, `출품`, `심사기준` 성격이다.
- 사용자 관점의 분야는 `기타`가 아니라 `공모전(CAT_CONTEST)`이 맞다.
- 신청기간은 공모 접수기간으로 보며, 이 건은 `2026-08-28 ~ 2026-09-06`로 해석해야 한다.
- 우편 접수 도착 마감(`2026-09-05 18:00`)은 세부 접수 조건이지 전체 모집 종료일을 앞당기는 기준으로 쓰면 안 된다.
- 발표, 검증, 전시, 행사 운영 기간은 신청기간과 분리하여 행사 필드로 관리한다.

## 변경 사항

- `scripts/crawler/src/poster-classifier.js`
  - `CAT_CONTEST` 분야 규칙을 추가했다.
  - `공모전`, `문안 공모`, `아이디어 공모`, `주민제안 공모`, `영상 공모`, `사진 공모`, `숏폼 공모`, `굿즈 공모`, `디자인 공모`, `슬로건 공모`, `응모`, `출품`, `수상작`, `당선작`, `심사기준`을 공모전 신호로 본다.
  - `공모` 단독 키워드는 제외했다. `공모사업` 같은 지원사업을 공모전으로 잘못 분류하지 않기 위해서다.
- `scripts/crawler/src/audit-contest-category-mapping.js`
  - 운영 DB의 `published,review` 포스터를 읽기 전용으로 감사한다.
  - 현재 카테고리가 `CAT_CONTEST`가 아닌데 규칙상 공모전으로 보이는 후보를 보고서로 뽑는다.
- `scripts/crawler/package.json`
  - `audit:contest-categories` 스크립트를 추가했다.
- `scripts/crawler/src/poster-rules.test.js`
  - 서울꿈새김판 문안 공모가 `CAT_CONTEST`로 분류되는 테스트를 추가했다.
  - 일반 지원사업 공모가 `공모` 단어만으로 `CAT_CONTEST`가 되지 않는 회귀 테스트를 추가했다.

## 운영 데이터 감사 결과

명령:

```bash
pnpm --filter posterlink-crawler audit:contest-categories -- --limit=5000
```

결과:

- 감사 대상: `published,review` 541건
- 공모전 분야 교정 후보: 8건
- 보고서: `data/eval/reports/contest-category-audit.json` (git 제외)

후보:

- `2026년 가을편 「서울꿈새김판 」 문안 공모` - review, `CAT_OTHER -> CAT_CONTEST`
- `2026년 창업진흥원 정책 아이디어 공모전` - published, `CAT_BUSINESS -> CAT_CONTEST`
- `강남구청 <민선9기 강남 대전환!! 주민제안 공모전> 안내` - published, `CAT_WELFARE -> CAT_CONTEST`
- `광진구청<「제6회 광진구 영상 공모전」개최 공고>(~9/14)` - published, `CAT_WELFARE -> CAT_CONTEST`
- `양천구청<나만의 양천픽(PICK)?! 2026 양천구 숏폼 공모전 개최>` - published, `CAT_WELFARE -> CAT_CONTEST`
- `제2회 서울 브랜드 굿즈 공모 안내 (8.24.~9.11.)` - published, `CAT_OTHER -> CAT_CONTEST`
- `서울광역청년센터 <2026년 제16회 서강청년영화제 출품작 모집>` - published, `CAT_WELFARE -> CAT_CONTEST`
- `서초문인협회 <2026 제12회 서초전국백일장> 모집 안내` - published, `CAT_WELFARE -> CAT_CONTEST`

## 검증

- `node --test scripts/crawler/src/poster-rules.test.js`
- `pnpm --filter posterlink-crawler test`
- `pnpm --filter posterlink-crawler audit:contest-categories -- --limit=5000`
- `git diff --check`

## 운영 DB 반영 대기

운영 DB 쓰기는 명시적 승인 후 별도 적용한다.

- 서울꿈새김판:
  - `poster_categories`: `CAT_CONTEST`로 교정
  - `application_start_at`: `2026-08-28`
  - `application_end_at`: `2026-09-06`
  - `field_verification.classification`의 category 근거 갱신
  - `low-category-confidence` 이슈 제거
- 공모전 감사 후보 8건:
  - 각 후보의 현재 분야를 `CAT_CONTEST`로 교정 가능한지 적용 전 한 번 더 원문/요약 기준으로 확인한다.
  - 분야 교정은 공개 상태 자체를 바꾸지 않는다.

## 운영 DB 적용

승인 문구:

```text
공모전 분야 교정 후보 8건 및 서울꿈새김판 신청기간 2026-08-28~2026-09-06 운영 DB 적용 승인합니다.
```

적용 명령:

```bash
pnpm --filter posterlink-crawler apply:contest-category-corrections -- --apply
```

적용 결과:

- 분야 교정: 8건
- 포스터 레코드 갱신: 8건
- `poster_field_evidence` 근거 upsert: 10건
- 서울꿈새김판:
  - `poster_categories`: `CAT_CONTEST`
  - `application_start_at`: `2026-08-28`
  - `application_end_at`: `2026-09-06`
  - `field_verification.classification.categoryCodes`: `CAT_CONTEST`
  - `classificationIssues`: `[]`

적용 후 검증:

- `pnpm --filter posterlink-crawler audit:contest-categories -- --limit=5000`
  - 감사 대상 541건
  - 잔여 공모전 분야 교정 후보 0건
- 서울꿈새김판 개별 DB 조회
  - 분야 `공모전`
  - 신청기간 `2026-08-28 ~ 2026-09-06`
  - `contest-category-corrections-v1` 근거: `apply_start`, `category`, `deadline_date`
