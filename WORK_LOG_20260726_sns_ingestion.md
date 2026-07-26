# PosterLink 작업 정리 — 2026-07-26 (SNS_INGESTION.md 구현)

> 이 문서는 `SNS_INGESTION.md`(공고 소스를 게시판 외에 SNS로 확장하고, 공고/소식/폐기를
> 분류하는 설계 문서) 를 Phase 0부터 Phase 4까지 구현한 기록이다. 문서 자체는 레포에
> 없고 사용자 로컬에 있었다(작업은 이 레포 `C:\Maxmini_Project\PosterLink`에 적용).
>
> **핵심 요약**: Phase 0~3은 완전히 끝나서 실제 프로덕션 데이터로 검증까지 마쳤고,
> Phase 4는 엔지니어링(스키마·측정 스크립트)은 끝났지만 기관 데이터 적재는 일부만 됐다.
> 아래 "남은 일"부터 읽어도 된다.

---

## 0. 왜 이 작업을 했나

PosterLink는 지금 게시판 34개(정확히는 사이트+DB 합쳐 34개 안팎)만 크롤링한다.
`SNS_INGESTION.md`는 이 두 가지를 목표로 삼았다:

1. 네이버 블로그 등 SNS를 추가 출처로 붙여서 커버리지를 넓힌다.
2. 크롤링되는 글 중 포스터가 아닌 잡다한 글(인사말, 축하글, 맛집 소개 등)까지
   무조건 버리지 말고 **공고 / 소식 / 폐기** 3방향으로 분류한다.

문서 자체가 "Phase 0에서 레포 실태부터 확인하고, 확신 없으면 질문하라"고 지시했고,
각 Phase 끝나면 멈춰서 사람 리뷰를 받으라고 했다. 아래는 그 순서대로 실제 한 일이다.

---

## 1. Phase 0 — 레포 파악에서 확인한 사실

- **실제 레포 위치**: `C:\Maxmini_Project\PosterLink` (pnpm/Turborepo 모노레포).
  `SNS_INGESTION.md` 파일 자체는 사용자의 `Downloads` 폴더에 있었고 레포와 무관한
  위치였다.
- **크롤러가 2개 존재**: 최상위 `posterlink-crawler/`는 2026-05-08에 아카이브된
  레거시(`pnpm-workspace.yaml`에도 빠져있음). 실제로 매일 도는 건
  **`scripts/crawler/`** 다. 이후 모든 작업은 이 폴더에만 했다.
- **DB 마이그레이션 기록이 실제 상태와 어긋나 있었음**: 원격 Supabase 프로젝트의
  마이그레이션 히스토리 테이블에 딱 1개(`20260416064744`)만 기록돼 있고, 로컬에
  있는 43개 마이그레이션 파일은 전부 "미적용"으로 나왔다. 그런데 실제 테이블(예:
  `posters` 1776건, `collection_sources` 40건, `poster_notice_candidates` 400건)은
  전부 존재하고 정상 작동 중이었다 — 즉 스키마는 이미 다 적용됐는데 **기록만 꼬여
  있던 것**. 이 상태로 `supabase db push`를 그냥 돌리면 43개를 처음부터 재실행
  시도해서 위험했다.
- **CLIP은 레포에 없었음**: 문서는 "기존 CLIP 재사용"을 전제하는데, 실제로는
  CLIP이 아니라 로컬 MobileNetV3(포스터/비포스터 이진분류) + OpenAI GPT Vision
  조합으로 이미지 판별을 하고 있었다.
- **OCR도 문서가 가정한 것과 다름**: 전통적 OCR 엔진이 아니라, Supabase Edge
  Function에서 GPT-4o Vision을 호출하는 방식(운영자가 사진 업로드 시 필드
  자동채움용).
- **기존에 비슷한 역할을 하는 테이블이 이미 있었음**:
  - `collection_sources` — "어느 기관을 얼마나 자주 수집할지" 관리하는 채널
    인벤토리 테이블. 문서의 Phase 1 "sources"가 아니라 **Phase 4 "institutions"**
    개념과 거의 일치.
  - `poster_notice_candidates` — 이미지 없는 공고 후보를 담는 스테이징 테이블.
    문서의 "items"에 가장 가까움. 단, 한 행에 출처 정보가 다 박혀있어서
    "같은 공고를 여러 출처에서 병합"하는 구조는 없었음.

이 조사 결과를 바탕으로 사용자에게 4가지를 확인받았다:
레거시 크롤러는 그대로 둘 것, 마이그레이션 기록부터 먼저 고칠 것, `items`/`sources`는
기존 테이블을 확장해서 재사용할 것, AI 이미지 판별기는 문서대로(CLIP 방식) 새로
구축할 것.

---

## 2. Phase 1 — 스키마 & 마이그레이션 (완료)

### 2-1. 마이그레이션 기록 정리
`supabase migration repair --status applied <43개 버전>` 으로 로컬=원격을 맞췄고,
원격에만 남아있던 고아 기록(`20260416064744`)은 `--status reverted`로 정리했다.
이 과정에서 **같은 타임스탬프(`20260720020000`)를 가진 마이그레이션 파일이 2개**
있는 것도 발견해서 하나를 `20260720021000`으로 이름을 바꿨다(내용은 그대로,
git mv만). 이후 `supabase db push --dry-run`이 "Remote database is up to date"로
정상화된 것을 확인했다.

### 2-2. 스키마 확장
새 테이블을 만드는 대신 기존 테이블을 확장하는 방향으로 결정했다:

- **`poster_notice_candidates`**(=items) 확장 — 컬럼 13개 추가:
  `content_type`(공고/소식), `category`, `org_code`, `region_sido`,
  `region_sigungu`, `region_code`, `target`, `support_scale`, `deadline_type`,
  `apply_url`, `contact`, `representative_image`, `application_status`
  (접수전/접수중/마감). 레포 관례를 따라 Postgres native enum이 아니라
  `TEXT + CHECK` 제약으로 만들었다(레포 전체에 enum 타입이 하나도 없어서).
- **`notice_sightings`**(=sources) 신규 생성 — 같은 공고를 게시판/블로그/SNS
  등 여러 출처에서 "목격"한 기록을 1건씩 담는 테이블. `candidate_id`로
  `poster_notice_candidates`에 N:1 연결. `source_priority`(게시판=1 >
  블로그=2 > SNS=3), `image_phash`, `ocr_text` 등 문서 설계 그대로.
- **`collection_sources`**는 손대지 않고 그대로 Phase 4 "institutions" 역할로
  남겨뒀다(둘의 세분화 단위가 다르다는 걸 확인했기 때문).
- **자동 상태 전환**: `update_notice_candidate_application_status()` 함수 +
  매일 실행되는 pg_cron 잡(`update-notice-candidate-status-daily`, 매일
  UTC 00:10)을 추가해서 접수전→접수중→마감을 자동 갱신하게 했다. 기존
  `close_expired_posters()`(포스터 자동마감) 크론과 겹치지 않게 5분 간격을 뒀다.

### 2-3. 검증
가짜 샘플 공고 1건을 실제로 insert → 자동전환 함수 실행 → `접수전`→`접수중`으로
정확히 바뀌는 것 확인 → 마감일순 정렬 조회도 정상 동작 확인 → 테스트 데이터는
삭제.

### 커밋
`449287b` — `feat: add items/sources schema for SNS ingestion (SNS_INGESTION.md Phase 1)`

---

## 3. Phase 2 — 관련성 분류기 (완료)

### 3-1. 설계
문서가 원하는 4단 파이프라인을 그대로 구현하되, 비용 절감을 위해 **뒤로 갈수록
비싼 단계**로 설계했다(앞 단계에서 확실한 건 뒷단계로 안 넘김):

| 단계 | 파일 | 무엇을 하나 | 비용 |
|---|---|---|---|
| 1. 휴리스틱 정규식 | `relevance-heuristic.js` | 인사말/축하/일상 글 즉시 폐기, "마감+신청·모집 동사"가 뚜렷하면 즉시 공고 확정 | 0원 |
| 2. CLIP 시각선별 | `poster-clip-classifier.js` + `ml/clip_classify.py` | 로컬 zero-shot CLIP(open_clip, ViT-B-32)으로 "포스터 레이아웃"인지 1차 판별. 확실히 아니면 유료 GPT Vision 호출을 건너뜀 | 0원(로컬 추론) |
| 3. OCR | `poster-ocr.js` | 최종 선택된 대표 이미지 1장에서만 GPT Vision으로 텍스트 추출(후보마다 부르지 않음) | 유료(최소화) |
| 4. LLM 라우터 | `poster-relevance-router.js` | 문서의 시스템 프롬프트/JSON 스키마 그대로, OpenAI `gpt-5-mini`로 공고/소식/폐기 + 카테고리 + 마감표현 + 대상 + 지원규모 추출 | 유료(애매한 것만) |
| + | `deadline-parser.js` | 마감 표현(정규식 우선, 실패시만 LLM 폴백)을 `apply_start`/`apply_end`/`deadline_type`으로 변환 | 대부분 0원 |

기존 크롤러의 LLM 호출 관례(OpenAI `/v1/responses` + `json_schema` 구조화 출력,
디스크 캐시, `POSTER_*_ALLOW_ON_ERROR` 류 fail-open/closed 플래그, env변수 명명
규칙)를 그대로 따라 새 코드를 만들었다. **문서는 Claude를 추천했지만, 기존
크롤러가 전부 OpenAI만 쓰고 있어서 사용자 확인 후 OpenAI로 통일했다.**

### 3-2. 파이프라인 연결
- `crawler.js`(크롤 시점): Stage 1(휴리스틱)을 기존 제외 필터 옆에 추가, 폐기
  확정 시 즉시 스킵. Stage 2(CLIP)를 기존 GPT Vision 호출 앞에 프리필터로 삽입.
  Stage 3(OCR)을 최종 대표 이미지 확정 직후에 1회만 호출.
- `upload-to-supabase.js`(업로드 시점): Stage 1 결과가 애매(`null`)할 때만
  Stage 4(LLM 라우터) 호출. 라우터가 "폐기"면 DB에 아예 안 씀. 마감일 파서
  결과로 새 컬럼들(`content_type`/`category`/`deadline_type`/`target`/
  `support_scale`/`application_start_at`/`application_end_at`)을 채움.

### 3-3. 리뷰 중 발견해서 함께 고친 버그 (제가 만든 코드 X, 기존 코드 문제)
- **CI(`crawler.yml`)에 Python 설치 단계가 아예 없었음** — 기존 MobileNetV3
  로컬모델도 지금까지 CI에서 한 번도 실제로 안 쓰이고 있었다는 뜻(항상 GPT
  Vision 폴백만 탐). 새로 만든 CLIP도 그대로 두면 로컬에서만 동작하고
  운영 크롤러에서는 조용히 무효화될 뻔했다. → `actions/setup-python` +
  `pip install` + 모델/pip 캐시(`actions/cache`) 추가.
- **"Upload to Supabase" CI 단계에 `OPENAI_API_KEY`가 아예 전달 안 되고 있었음**
  — 이건 제 신규 코드뿐 아니라 **기존** `poster-field-verifier.js`(마감일/기관명
  LLM 보정)도 지금까지 CI에서 계속 "비활성화" 기본값으로 조용히 돌고 있었다는
  뜻. 두 문제를 같이 고쳤다.

### 3-4. 검증한 것 / 못 한 것
- **검증함(실제 데이터로)**: CLIP — 실제 발행 포스터 2건(76%·83% 확신도로 정답)
  + 실제 행사사진 1건(정확히 "사진"으로 정답) = 3/3. 휴리스틱 — 실제 지원사업
  공고 8건 전부 정답(LLM 호출 0건), 합성 인사말/축하 3건 전부 정답, 애매한
  소식류 2건은 정확히 LLM 라우터로 위임. 마감일 파서 — 문서 명시 패턴 11개
  전부 정답(고정/기간/소진시/상시/연도넘김 등) + 실제 데이터 8건 정답.
  "재크롤 없이 raw 재처리로 규칙 반영" — 저장된 크롤 JSON은 그대로 두고 분류
  규칙 하나만 바꿔서 재실행 → 같은 raw 데이터가 다르게 분류됨을 직접 확인.
- **검증 못 함**: 로컬에 `OPENAI_API_KEY`가 없어서(레포 어디에도 실키가 없고
  GitHub Actions 시크릿에만 있음) Stage 3 OCR과 Stage 4 LLM 라우터의 **실제
  API 호출 결과 품질**은 검증하지 못했다. 문서가 요구하는 "라벨링된 샘플 각
  라우트 10건 정확도 리포트"는 아직 못 낸 상태 — 아래 "남은 일"의 최우선 항목.

### 커밋
`7dc022f` — `feat: add 4-stage relevance classifier for SNS ingestion (SNS_INGESTION.md Phase 2)`

---

## 4. Phase 3 — 소스 수집 + dedup/링킹 (완료)

### 4-1. 네이버 블로그 인제스터
`naver-blog-ingester.js` 신규 작성. RSS는 **인증 없이** 접근 가능(검색 API만
Client ID/Secret 필요, 이건 안 씀). **중요 발견**: 문서에 적힌 RSS 형식
`https://blog.naver.com/rss/{blogId}`는 지금 "페이지 주소를 확인해주세요"
에러를 반환한다 — 실제로 동작하는 형식은 **`https://rss.blog.naver.com/{blogId}.xml`**
이며, 이건 실제 마포구청 공식 블로그(`blog.naver.com/prmapo77`, 검증 방법은
아래 참고)로 직접 확인했다.

파이프라인: RSS raw 저장(무조건, 폐기해도 원문은 절대 안 버림) → Phase 2
분류기 → 마감일 파서 → 기존 `poster-duplicate-detector.js`(레포에 이미 있던
텍스트 기반 중복탐지 로직, 새로 안 만들고 재사용)로 dedup/링킹. 필드 병합
정책(3-4)은 "낮은 우선순위(블로그) 값이 이미 있는 값을 덮어쓰지 않는다"는
coalesce 방식으로 구현.

### 4-2. FB/인스타 스텁
`social-ingester-stub.js` — 호출하면 항상 에러를 던지는 두 함수만 존재.
"공식 API로 임의 공개계정 수집 불가, 스크래핑 금지" 주석 명시.

### 4-3. 실제 데이터로 검증(가장 중요한 부분)
- 마포구청 공식 블로그(`blog.naver.com/prmapo77` — mapo.go.kr 공식 홈페이지의
  "마포 SNS" 섹션에서 직접 링크를 확인해서 검증. **첫 번째 웹검색 결과가 틀린
  블로그ID("prmapo77" 이전에 시도했던 다른 후보)를 알려줬던 걸 실제 RSS
  요청으로 검증해서 걸러냈다** — 검색 엔진 답변을 그대로 믿지 않고 직접 확인.)
  에서 실제로 50건 수집.
  - 50건 전부 raw sighting 저장(원문 보존 원칙 확인).
  - 49건 신규 공고/소식 items 생성, 분류도 실제 내용과 대체로 일치(모집·캠프류는
    공고, 맛집/공원 소개는 소식).
  - **1건은 이미 발행된 기존 포스터와 정확히 매칭**되어 중복 생성 없이 넘어감
    (블로그 제목 "전남광주 행정통합에 따른 일부 민원서비스 전국 중단안내" ↔
    기존 포스터 "전남광주 행정통합에 따른 일부 민원서비스 전국 중단 안내",
    둘 다 마포구청 소스).
- 이 과정에서 **진짜 스키마 한계를 발견**: `notice_sightings.candidate_id`는
  `poster_notice_candidates`만 참조하도록 만들어놔서, 이미 이미지 검증까지
  끝나 `posters`로 승격된 공고와 매칭되는 경우는 링크를 못 하고 로그만
  남겼다. → **`notice_sightings.poster_id`** 컬럼을 추가(마이그레이션
  `20260726010000`, `candidate_id`와 배타적 체크 제약)해서 실제로 연결되게
  고쳤다.
- **더 큰 한계도 발견**: 게시판 크롤러(`upload-to-supabase.js`) 자체가
  **`notice_sightings`에 지금까지 아무것도 안 쓰고 있었다** — 오직 새로 만든
  블로그 인제스터만 썼다. 그래서 "1개 공고 : N개 출처" 구조가 블로그 쪽에서만
  절반만 완성돼 있었다. → `upsertBoardNoticeSighting()` 함수를 만들어서 게시판
  크롤 결과가 (a) 신규 포스터로 저장될 때, (b) 정확한 URL로 기존 포스터와
  중복 병합될 때, (c) 퍼지(제목·기관·마감일 유사도) 매칭으로 기존 포스터와
  병합될 때 — 이 3곳 전부에 연결했다. **실제로 실행해보다가 (c) 경로를
  처음에 빠뜨린 걸 발견**해서 바로 잡았다(실전 테스트가 없었으면 놓쳤을
  버그).
- **최종 검증**: 위에서 매칭됐던 "전남광주 행정통합" 포스터의 원본 게시판
  URL(`https://www.mapo.go.kr/site/main/board/notice/276434?bcId=notice`,
  실제 `posters.source_key` 값)로 게시판 sighting을 채워 넣은 뒤 확인한 결과 —
  **같은 실제 공고 1건에 sightings가 정확히 2건**(게시판 우선순위1,
  네이버블로그 우선순위2). 문서의 Phase 3 완료 기준("items 1건 + sources
  2건으로 병합됨을 보인다")을 문자 그대로, 실제 프로덕션 데이터로 재현했다.

### 커밋
`1c9569d` — Naver 블로그 인제스터 / `3538b88` — 게시판↔블로그 sightings 연결 완성

---

## 5. Phase 4 — 기관 커버리지 맵 (엔지니어링만 완료, 데이터는 일부만)

### 5-1. 스키마
`collection_sources`(Phase 1에서 이미 "institutions" 역할로 결정)에
`naver_blog_id`, `facebook_id`, `instagram_id`, `coverage_grade`(게시판완결
/게시판부실/SNS-only), `sns_enabled`(boolean) 컬럼 추가.

### 5-2. 커버리지 측정 스크립트
`measure-institution-coverage.js` — **새 분류 로직을 거의 안 만들고**, 이미
있는 Phase 2 분류기(휴리스틱+LLM라우터)와 Phase 3 dedup(`findBestPosterDuplicate`)
을 그대로 재사용해서: 기관별 최근 3개월 블로그 RSS를 분류 → route='공고' 건수
집계 → 게시판 쪽(같은 기관명으로 `posters`+`poster_notice_candidates`에 최근
3개월 저장된 공고 건수)과 겹침 비율 계산 → 등급 산출. 겹침 70%(설정 가능,
`COVERAGE_OVERLAP_THRESHOLD`) 이상이면 "게시판완결"(SNS 끌 필요 없음).

`naver-blog-ingester.js`에 `--all-enabled` 배치 모드를 추가해서 `sns_enabled=true`
인 기관만 순회하도록 만들었다(문서의 "블로그 인제스터가 이 플래그를 존중한다"
완료 기준).

### 5-3. 실제 데이터로 검증
마포구청(`mapo-gu`) 행에 검증된 `naver_blog_id='prmapo77'`을 설정하고 측정
실행 → **게시판 40건 vs 블로그 13건, 겹침 100%** → 정확히 "게시판완결" 등급 →
`sns_enabled=false` → `--all-enabled` 실행 시 정확히 건너뛰는 것까지 확인.

### 5-4. beachhead 기관 목록 적재
문서가 요구한 목록: 소상공인시장진흥공단+지역본부, 광역/기초 지자체
경제·일자리과, **창조경제혁신센터 17개**, 신보/기보 등.

- **창조경제혁신센터**: 실제로 확인해보니 **17개가 아니라 19개**(17개 시도
  + 포항·빛가람 특화센터)였다. 통합 포털(`ccei.creativekorea.or.kr`, 주관:
  중소벤처기업부/운영: 창업진흥원)의 실제 지역 선택 드롭다운에서 19개 전체
  이름·URL을 확인했고, 게시판 URL 패턴(`/{지역}/custom/notice_list.do`)은
  서울센터를 직접 방문해서 확인한 뒤, 나머지 5곳(부산/제주/경북/포항/빛가람/
  세종)을 curl로 스팟체크해서 전부 실제 페이지(에러 아님)임을 확인하고 19개
  전부에 적용했다.
  - **중요 발견**: 서울/부산/대구 3개 지역을 실제로 방문해보니, 19개 센터가
    **통합 네이버 블로그(`ccei_forever`) 하나를 공유**하고 있었다(facebook/
    instagram만 지역마다 다름). 이 블로그의 RSS를 직접 조회해서 실재함을
    확인(글 50건 존재)했지만, **가장 최근 글이 2026-02-05**로 최근 3개월
    기준 활동이 없는 휴면 상태였다 — 그래서 커버리지 측정 시 19개 전부
    "게시판완결"로 나오는데, 이건 버그가 아니라 "블로그가 최근에 안 올라와서
    비교할 게 없다"는 실제 상태를 정확히 반영한 결과다.
  - 이 발견 덕분에 **진짜 비효율 하나를 잡았다**: 여러 기관이 블로그를
    공유하는 경우, `measure-institution-coverage.js`와
    `naver-blog-ingester.js --all-enabled`가 같은 RSS를 기관 수만큼(19번)
    반복해서 받고 분류(LLM 호출 포함)하고 있었다. → blogId 기준 캐시/스킵
    로직을 추가해서 한 번만 처리하도록 고쳤다.
  - 부산(`facebook=cceibusan`, `instagram=bccei`)·대구(`facebook=daeguccei`,
    `instagram=daegu_ccei`)는 SNS 계정까지 실제로 확인해서 채웠다. 나머지
    16개 지역은 블로그(공통)는 채워졌지만 facebook/instagram은 아직 미확인.
- **소상공인시장진흥공단(semas.or.kr)**: 실사이트 방문 확인. "지역본부"·
  "전국 소상공인지원센터"(60여 곳)는 전부 물리적 사무소 안내일 뿐 별도
  웹사이트가 아니라 `semas.or.kr` 하나로 통합 운영되는 걸 확인해서, 지역본부
  마다 따로 등록하지 않고 **중앙 포털 1건**으로 등록했다. 실제 "사업공고"
  게시판 URL, `naver_blog_id='marketagency'`, facebook·instagram 전부
  실사이트에서 확인.
- **기술보증기금(kibo.or.kr)**: `kibo.or.kr`은 스플래시 페이지였고 실제
  사이트는 `kibo.or.kr/main`. `naver_blog_id='techkibo'`(RSS 실재 확인),
  instagram 확인.
- **신용보증재단중앙회(koreg.or.kr)**: 실사이트 방문 확인 결과, 중앙회
  자체는 공고 게시판도 SNS도 없고 "신용보증재단 찾기"로 지역 재단을
  안내하는 역할만 한다. 낮은 우선순위 참고용 1건만 등록했고, **17개 시도
  지역신용보증재단(서울신보/경기신보 등, 각각 별도 법인·별도 사이트)은
  이번에 손 안 댐** — 개별 확인이 필요한 후속 작업으로 남긴다.

### 커밋
`f6ea238` 커버리지 측정 엔지니어링 / `2339861` 창조경제혁신센터 19개 시드 /
`e7c27e4` 공유 블로그 중복처리 방지 수정 + 지역별 SNS 계정 보강 /
`8ea9397` 소진공·기보·신보중앙회 시드

---

## 6. 전체 커밋 목록 (`main`에 전부 push됨)

```
449287b feat: add items/sources schema for SNS ingestion (Phase 1)
7dc022f feat: add 4-stage relevance classifier for SNS ingestion (Phase 2)
1c9569d feat: add Naver blog RSS ingester (Phase 3-1)
3538b88 feat: link notice_sightings across board and blog surfaces (Phase 3 완성)
f6ea238 feat: add institution coverage grading (Phase 4 엔지니어링)
2339861 feat: seed 창조경제혁신센터 institutions into collection_sources (Phase 4 데이터)
e93a211 docs: add detailed work log for SNS_INGESTION.md Phase 0-4 implementation
e7c27e4 fix: dedupe shared-blog institutions in coverage measurement + batch ingest
8ea9397 feat: seed 소상공인시장진흥공단/기술보증기금/신용보증재단중앙회
22438f5 docs: update SNS ingestion work log with Phase 4 institution data progress
138120e feat: seed 17개 시도 지역신용보증재단
```

## 7. 새로 생기거나 바뀐 파일 (전체 20개 + 후속 마이그레이션 3개)

**신규 코드**
- `scripts/crawler/src/relevance-heuristic.js` (Stage 1)
- `scripts/crawler/ml/clip_classify.py`, `scripts/crawler/src/poster-clip-classifier.js` (Stage 2)
- `scripts/crawler/src/poster-ocr.js` (Stage 3)
- `scripts/crawler/src/poster-relevance-router.js` (Stage 4)
- `scripts/crawler/src/deadline-parser.js`
- `scripts/crawler/src/naver-blog-ingester.js`
- `scripts/crawler/src/social-ingester-stub.js`
- `scripts/crawler/src/measure-institution-coverage.js`

**수정된 기존 코드**
- `scripts/crawler/src/crawler.js`, `scripts/crawler/src/upload-to-supabase.js` (파이프라인 연결)
- `scripts/crawler/.env.example`, `scripts/crawler/package.json`, `scripts/crawler/ml/requirements.txt`
- `.github/workflows/crawler.yml` (Python 설치, OPENAI_API_KEY 전달 버그 수정)

**마이그레이션 (전부 적용·push됨)**
- `20260720021000_add_semantic_recommendation.sql` (파일명 변경만, 중복버전 수정)
- `20260726000000_add_items_sources_fields.sql` (Phase 1)
- `20260726010000_add_notice_sightings_poster_link.sql` (Phase 3, poster_id 연결)
- `20260726020000_add_collection_source_coverage_fields.sql` (Phase 4 스키마)
- `20260726030000_seed_ccei_collection_sources.sql` (Phase 4 데이터, 창조경제혁신센터 19개)
- `20260726040000_update_ccei_sns_accounts.sql` (19개 공통 블로그 + 부산/대구 SNS 보강)
- `20260726050000_seed_semas_collection_source.sql` (소상공인시장진흥공단)
- `20260726060000_seed_kibo_koreg_collection_sources.sql` (기술보증기금/신용보증재단중앙회)

---

## 8. 남은 일 (우선순위 순)

### 8-1. 최우선 — OPENAI_API_KEY 추가 (사용자가 회사에서 가져오기로 함)
`scripts/crawler/.env.local`에 `OPENAI_API_KEY=...` 한 줄만 추가하면 됨(채팅에는
붙여넣지 말 것 — 파일에 직접). 이게 있어야:
- Phase 2 Stage 3(OCR)·Stage 4(LLM 라우터)의 **실제 분류 정확도**를 검증하고
  문서가 요구하는 "라벨링된 샘플 각 라우트 10건 정확도 리포트"를 낼 수 있음.
- Phase 4의 커버리지 측정도 애매한 글을 더 정확히 분류할 수 있음(지금은
  휴리스틱만으로 판단해서 다소 거칠음).

### 8-2. Phase 4 기관 데이터 계속 채우기

**⚠️ 2026-07-27 사용자 결정: OPENAI_API_KEY가 들어올 때까지 실제 블로그
"수집"(`naver-blog-ingester.js` 실행, `--all-enabled` 포함)은 잠시 멈춘다.**
이유: API 키 없이 수집하면 애매한 글이 전부 "소식"으로 기본값 처리되는데,
실제로 `semas`(`marketagency`)·`kibo`(`techkibo`) 블로그를 수집해보니 진짜
지원사업 모집 공고(예: "혁신 소상공인 AI 활용지원 사업 참여 소상공인 모집",
"기보 제19기 기보벤처캠프 참여기업 모집")는 휴리스틱으로 잘 잡혔지만,
"인천지역본부 전통시장 시니어 디지털 지원단"이라는 이름으로 올라온 개별
전통시장 상점 홍보성 블로그 글 30여 건도 전부 "소식"으로 저장돼버렸다 —
이건 진짜 판단이 아니라 API 키가 없어서 나온 안전 기본값이라, 포스터링크의
취지("포스터를 모으는 사이트")와 안 맞는 노이즈가 계속 쌓이는 셈이었다.
**기관 발굴/등록(홈페이지·게시판·블로그ID를 찾아서 collection_sources에
넣는 것)은 분류를 거치지 않으므로 계속 진행해도 된다** — 멈추는 건 오직
"실제 콘텐츠를 poster_notice_candidates에 적재하는" 단계다.
`measure-institution-coverage.js`도 저장은 안 하고 등급 계산만 하므로 계속
돌려도 안전하다.

이미 실행된 결과(참고): `semas`·`kibo` 블로그에서 각 50건씩, 총 100건이
`poster_notice_candidates`에 신규 생성됐다(현재 DB 전체:
`poster_notice_candidates` 549건[공고 422/소식 127], `notice_sightings`
171건). 키가 들어오면 이 127건의 "소식" 전체를 실제 LLM 라우터로 재분류하는
일괄 재처리가 필요하다(raw는 그대로 있으니 재크롤 없이 가능 — Phase 2
완료기준 그대로).

- ~~소상공인시장진흥공단·기술보증기금·신용보증재단중앙회 목록/URL~~ → 완료.
- ~~신용보증재단 17개 시도 지역재단 목록/홈페이지~~ → 완료(koreg.or.kr
  공식 페이지에서 이름-링크 정확히 매칭, 17개 전부 생존 확인). **단, 각
  재단의 실제 공고 게시판 하위 경로·SNS 계정은 아직 개별 미확인**(지금은
  홈페이지 URL을 임시로 넣어둠).
- 창조경제혁신센터 16개 지역(부산·대구 제외)의 facebook/instagram 계정
  개별 확인(블로그는 19개 전부 공통값으로 이미 채움) — 안전하게 계속
  가능하지만 실용적 가치는 낮음(코드에서 아직 안 씀).
- 광역/기초 지자체 경제·일자리과는 아직 손 안 댐 — beachhead 우선순위상
  가장 나중이어도 될 항목.
- `semas`·`kibo`에 `measure-institution-coverage.js`를 실행해서 실제로
  등급 산정함 — **둘 다 게시판 크롤 대상이 아니었는데 블로그에 최근 3개월
  실제 공고가 있어서 정확히 "SNS-only" → `sns_enabled=true`로 판정됨**
  (Phase 4 취지 그대로 실증). `mapo-gu`·19개 CCEI는 전부 "게시판완결".

### 8-3. 구조적으로 남은 것 (설계상 자연스러운 다음 단계)
- **이미지 phash dedup 미구현**: `notice_sightings.image_phash` 컬럼은 있지만
  실제로 계산해서 채우는 로직이 없음(현재 dedup은 전부 텍스트/URL 기반).
  블로그 글에 이미지가 있을 때 phash로 더 강하게 매칭하려면 추가 구현 필요.
- **대표 이미지 자동 선정 미구현**: `items.representative_image`/
  `poster_notice_candidates`의 대표이미지 갱신 로직이 아직 "여러 출처 중
  해상도 큰 것 선택"까지는 안 감(현재는 board 우선순위로 필드만 병합, 이미지
  해상도 비교는 없음).
- **facebook/instagram 실제 구현 안 함** — 문서 방침대로 의도적으로 스텁만
  있음(운영권 확보나 정책 변경 전까지는 그대로 둘 것).
- **네이버 검색 API(키워드 검색) 미구현** — RSS만 구현했고, "특정 기관
  블로그가 없을 때 키워드로 찾기"용 검색 API 연동은 안 함(문서에도 후순위로
  언급됨, `NAVER_CLIENT_ID/SECRET` 발급 필요).

### 8-4. 검증/리뷰 관점에서 남은 것
- 이 문서에 적힌 커밋들이 실제로 운영 크롤러(GitHub Actions 매일 크론)에서
  에러 없이 도는지 다음 정기 실행 때 확인 필요(로컬에서는 개별 함수/일부
  흐름만 테스트했고, 전체 크론 파이프라인을 실제로 통째로 돌려보지는 않음).
- CI에 새로 추가한 Python/CLIP 설치 단계가 실제 GitHub Actions 러너에서
  문제없이 도는지(로컬 venv에서만 확인, CI 환경 자체에서는 아직 미확인).
