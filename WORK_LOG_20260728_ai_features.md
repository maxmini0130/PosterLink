# PosterLink 작업 정리 — 2026-07-28 (디딤돌 R&D 사업계획서 검토 + AI 기능 3건 구현, 상세판)

> `SNS_INGESTION.md`/`WORK_LOG_20260726_sns_ingestion.md`, 홈페이지 성능/기준정보
> (`WORK_LOG_20260727_site_quality.md`)와는 별개 트랙이다. 사용자가 준비 중인 디딤돌
> R&D 첫걸음 트랙 사업계획서(`posterlink_20260728.pptx`)를 검토해달라는 요청으로
> 시작해서, 검토 결과를 바탕으로 "여기서 말한 AI 기능들을 구현하려면 어떻게 해야
> 할까"라는 질문에 답하고, 사용자가 지정한 우선순위(추천순)대로 3건을 실제
> 구현까지 완료한 전 과정을 기록한다.

---

## 0. 파일 읽기 — 인코딩 문제부터 해결

대상 파일: `G:\내 드라이브\01. STARTUP\01.플랫폼\03.PosterLink\posterlink_20260728.pptx`
(21슬라이드).

이 로컬 환경(Windows, 사용자 PC)에는 `markitdown` 파이썬 패키지가 설치돼 있지
않아서 `pip install "markitdown[pptx]"`로 먼저 설치했다. 첫 시도
(`python -m markitdown "...pptx"`를 bash로 실행하고 콘솔에 바로 출력)에서는
한글이 전부 깨져서 나왔다(`����� R&D` 같은 mojibake) — Git Bash 콘솔의 로캘이
UTF-8이 아니어서 stdout 리다이렉트 과정에서 깨진 것으로 판단, 파일로 리다이렉트
(`>`)해도 똑같이 깨졌다(쉘 자체가 이미 잘못된 코드페이지로 인코딩해서 쓰기
때문). 해결책: **Python 스크립트 안에서 `MarkItDown().convert()`를 직접 호출하고
`open(..., encoding='utf-8')`로 파일에 직접 써서** 쉘 리다이렉션을 완전히 우회함
— 그 결과물을 Claude Code의 `Read` 도구로 읽으니 한글이 정상적으로 나왔다.

또한 이 환경엔 LibreOffice(`soffice`)가 설치돼 있지 않아서(`scripts/office/soffice.py`
래퍼가 `module 'socket' has no attribute 'AF_UNIX'` 에러) 슬라이드를 이미지로
렌더링해서 보는 **비주얼 QA는 하지 못했다**. 대신:
- `python -c "import zipfile; zipfile.ZipFile(...).extractall('.')"`로 pptx를
  직접 압축 해제해서 `ppt/media/`의 이미지 22개(`image1.png`~`image22.png`)를
  전부 `Read` 도구로 열어 확인 — 전부 900바이트~7KB 사이의 단순 라인 아이콘류였고,
  실제 제품 스크린샷이나 사진은 전혀 없었음(뒤에서 사소한 보완 제안으로 언급).
- `ppt/presentation.xml`에서 `sldSz cx="18288000" cy="10287000"`(20×11.25인치,
  16:9 비율을 1.5배 스케일한 것) 확인 — 표준 와이드스크린 규격.

---

## 1. 사업계획서 내용 요약 (21슬라이드)

1. 표지 — "디딤돌 R&D·창업성장기술개발사업 첫걸음 트랙 사업계획서", PosterLink,
   "멀티모달 AI 수집·구조화 엔진과 기관용 올인원 운영 SaaS를 결합한 AI 기반 공고
   생애주기 통합 플랫폼", (주)맥스미니 Maxmini, posterlink.kr, 2026
2. 목차 — 01 Problem / 02 Solution / 03 Scale-Up / 04 Team
3~7. **Problem**: 공고 생애주기 전 구간 관장 플랫폼이라는 개요(Inbound/Core/
   Outbound 3분류를 여기서부터 도입) → "수요자는 찾지 못해서, 기관은 운영·증빙할
   수단이 없어서 겪는 이중 비효율" → 수혜자 측 문제(이미지·PDF 미색인, 탐색비용
   과다, "이미지·PDF 공고의 검색엔진 색인 건수 0건" 통계 인용) → 공급자 측 문제
   (성과파악 수단 부재, 수작업 보고서 재구성, 비전산 접수 반복비용)
8~14. **Solution**: "실현가능성 및 R&D 개발내용" → Inbound(멀티모달 4단계 AI
   파이프라인: ①CLIP 레이아웃 선별 ②GPT Vision OCR ③LLM 라우터 ④표준 JSON
   구조화) → Core(pgvector 시맨틱 매칭, "Supabase pgvector HNSW 인덱싱 기반
   벡터 검색 인프라 구축", "200ms 이내 초저지연 시맨틱 검색 응답") →
   Outbound(기관용 올인원 운영 SaaS: 스마트 공고 생성기/플랫폼 내 접수모듈/AI
   성과 대시보드) → 정량적 성과목표(95%↑ 비정형 포스터 구조화 정확도, 98%↑
   Vision OCR 환각 방지·자가검증율, 3초↓ 건당 전처리속도, 200ms↓ pgvector 응답
   지연시간 — 전부 "R&D 개발 완료 시점 KPI") → 차별성 비교표(vs 단순 스크래퍼/
   API 래퍼)
15~17. **Scale-Up**: 4개 축 수익모델(SaaS 구독/타깃마케팅/지원금 코파일럿/DaaS)
   → B2G 조달전략(Phase 1 수의계약 2천만원 이하 도서관·복지관·청년센터 대상 →
   Phase 2 조달청 혁신제품 지정을 통한 전국 확대)
18~20. **Team**: 대표자/팀 역량(2022년 6월 설립, "중기부 R&D 수행이력 없는
   첫걸음 트랙 우선지원 대상 기업"이라는 자격요건을 강점으로 제시, posterlink.kr
   이미 실운용 중) → 검증된 연구 데이터 자산("30+ 핵심 수집기관 자동 크롤러
   파이프라인 상시 가동", "200+ 주요 공공기관 DB 확보(서울시 자치구·17개
   광역시도 경제진흥원/테크노파크 등)", "1,700+건의 정제 포스터 DB 구축 및
   실운용 중")
21. 클로징 — "실증된 데이터와 실행력으로 공공 정보 격차를 해소합니다"

---

## 2. 실제 DB/코드로 검증한 수치

슬라이드 20의 "실증 데이터 자산" 3개 숫자를 그대로 믿지 않고, 크롤러 디렉토리에
임시 검증 스크립트(`scripts/crawler/_tmp_verify_pptx_claims.mjs`,
`_tmp_verify2.mjs` — 확인 후 바로 삭제, 커밋 안 함)를 작성해서 Supabase에 직접
질의했다. `.select("*", {count:"exact", head:true})` 방식(1000행 페이지네이션
한계에 안 걸리는 정확한 COUNT)으로 확인:

```json
{
  "totalPosters": 1790,
  "publishedPosters": 437,
  "closedPosters": 1327,
  "posterBreakdown_재확인": {"draft":0,"review":20,"published":437,"hidden":0,"rejected":6,"closed":1327,"archived":0},
  "totalSources": 96,
  "activeSources": 39,
  "plannedSources": 57,
  "sourceBreakdown": {"planned":57,"active":39,"paused":0,"error":0,"blocked":0,"retired":0},
  "econSinbo(오늘/어제 등록한 econ-*+sinbo-* 소스 개수)": 34,
  "econSinboActive": 0
}
```

(첫 시도에서 `.select("poster_status")`로 전체 행을 가져와 JS에서 집계하려다가
Supabase JS 클라이언트의 기본 1000행 페이지네이션 한계에 걸려서
`posterStatusBreakdown: {"closed": 1000}`이라는 잘못된 집계가 나왔었다 — 이건
이전 세션 메모리에도 남아있는 동일한 함정이라 바로 알아채고 `count:"exact",
head:true` 방식으로 다시 계산해서 정확한 값을 얻었다.)

**결론**:
- "1,700+건 정제 포스터 DB" → 실제 1,790건(published+closed+review+rejected
  합산)으로 **검증됨, 오히려 보수적인 숫자**.
- "30+ 핵심 수집기관 자동 크롤러 파이프라인 상시 가동" → 실제 활성(`status='active'`)
  소스 39개로 **검증됨**.
- **"200+ 주요 공공기관 DB 확보"** → 실제 `collection_sources`는 96개뿐(활성 39
  + planned 57). 정적 사이트 목록(`scripts/crawler/src/sites.js`, `grep -c
  "id:"` 결과 20개)을 더해도 116개로 200에 못 미침. 게다가 슬라이드가 근거로
  든 "17개 광역시도 경제진흥원/테크노파크"는 **바로 전날(2026-07-27) 세션에서
  방금 등록한 것**(`econ-*` 소스 17개, 신용보증재단 `sinbo-*` 17개 — 합쳐서
  34개, 전부 `status='planned'`이고 실제 활성 크롤링은 0건)이었다. "확보"라는
  표현이 "실제 데이터 수집 중"으로 오독될 여지가 있어, 실사 단계에서 "이 200개
  기관에서 실제로 몇 건씩 수집되고 있냐"는 질문에 답이 궁색해질 리스크로 지적함.

---

## 3. 핵심 리스크 지적 — "이미 완성된 기술을 R&D 개발내용으로 제시"

슬라이드 9~10(Inbound: CLIP 레이아웃 선별 → GPT Vision OCR → LLM 라우터 → 표준
JSON 구조화)은 **바로 이 세션에서 직접 디버깅하고 오늘 이전 세션들에서 직접
구현·수정한, 이미 운영 크롤러에서 매일 돌고 있는 기능**이다(예: 어제 이 4단계
파이프라인 중 `poster-relevance-router.js`/`deadline-parser.js`의 OpenAI 호출
타임아웃 누락 버그를 실제로 찾아 고쳤음 — GitHub Actions run #118이 87분간
조용히 멈춰있다가 150분 타임아웃으로 죽은 사고). 디딤돌 R&D, 특히 슬라이드
19에서 강점으로 내세운 "중기부 R&D 수행이력 없는 첫걸음 트랙 우선지원 대상
기업"이라는 바로 그 자격요건은, 심사 시 "이미 개발 완료된 기술에 지원금을
신청하는 것 아니냐"는 지적을 받기 쉬운 조건이기도 하다.

**제안한 해결책**: 슬라이드 13의 KPI(정확도 95%↑, 환각방지 98%↑, 처리속도
3초↓, 응답지연 200ms↓)에 **"현재 baseline → 목표"** 형태로 현재 수치를 병기.
예: "현재 정확도 82% → 목표 95%↑". 이렇게 하면 (a) 이미 뭔가 작동 중이라는
사실을 숨기지 않으면서 (b) 이번 R&D의 실체가 "신규 발명"이 아니라 "고도화·정확도
개선·확장"이라는 걸 명확히 할 수 있다. 그리고 실제 신규 개발 항목(기관용
SaaS — 공고생성기·접수모듈·성과대시보드, 이건 이 세션 전체에서 코드베이스
어디에도 존재하지 않는 걸 확인했으므로 진짜 신규가 맞음)을 더 앞세우는 구성을
권장함.

---

## 4. 부수적으로 발견한 내부 모순 및 사소한 보완 제안

- **슬라이드 11 vs 13 모순**: 슬라이드 11은 pgvector 200ms 응답을 "Supabase
  pgvector HNSW 인덱싱 기반 벡터 검색 인프라 **구축**"이라고 현재완료형으로
  서술하는데, 슬라이드 13은 똑같은 "200ms"를 "R&D 개발 완료 시점" 목표(미래형)로
  다시 제시한다. 이미 되는 건지 목표인지 헷갈림 — 위 baseline 병기로 함께
  해결 가능.
- **슬라이드 6의 "0건" 통계**(이미지·PDF 공고 검색엔진 색인 건수) — 전수조사인지
  샘플조사인지 방법론 각주가 없음. 실사에서 "그 0건은 어떻게 측정했나" 질문에
  대비 필요.
- 이미지 22개가 전부 단순 아이콘뿐, 실제 posterlink.kr 화면이나 "포스터 이미지
  → 구조화된 JSON" 전후 비교 같은 실물 스크린샷이 하나도 없음. "실증"을 그렇게
  강조하는 덱인데 실제 화면이 안 보이는 건 아쉬움 — 1~2장 추가를 권장.

**잘된 점**: Inbound→Core→Outbound 프레임이 슬라이드 4·9·14 전체에 일관되게
반복되어 서사가 탄탄함, 문제 정의를 수요자/공급자 양면 대칭 구성(슬라이드
5~7)한 것이 적절함, B2G 조달 전략(수의계약 소액 → 혁신제품 지정 → 전국 확대,
슬라이드 17)이 한국 공공조달 실무를 정확히 반영한 현실적인 전략임.

**이 리뷰 단계에서는 코드/DB를 전혀 바꾸지 않았다** — 순수 검토 + 검증 쿼리만.

---

## 5. 검토 후 "AI 기능 구현" 계획 수립

리뷰 결과를 보고받은 사용자가 "여기서 말한 AI기능들을 구현하려면 어떻게 해야
할까?"라고 질문. 먼저 범위를 확인(AskUserQuestion)했더니 사용자가 아래처럼
직접 상세한 아키텍처 정리를 제시함:

**신규 개발 대상** (완전히 새로 만들어야 함):
1. Core — Supabase pgvector 기반 RAG 시맨틱 검색(자연어 질의 이해, AI 적합도
   스코어, 1줄 맞춤 추천 이유 생성)
2. Outbound — 기관용 "스마트 공고 생성기"(필수항목 누락 감지, 모호한 문구
   자동 교정 제안)
3. Outbound — 생성형 AI 포스터·카드뉴스 자동 생성기(이미지 없는 후보 대상)
4. Outbound — AI 성과 분석·자동 리포팅 엔진(조회·클릭·신청 데이터 분석 + PDF/
   Excel 리포트 자동 생성)

**보완/고도화 대상** (이미 있는 파이프라인 발전):
5. Inbound — Vision OCR 텍스트 추출 및 구조화(현재: 단순 요약 → 목표: 개별
   필드 100% 구조화 + 환각차단 98%↑)
6. Inbound — 4단계 멀티모달 파이프라인 고도화(정확도 95%↑, 처리속도 3초↓)
7. Inbound — 이미지 pHash 기반 멀티소스 중복판정(현재: URL/텍스트 유사도만 →
   목표: pHash+임베딩 결합)

내가 각 항목을 실제 코드베이스 상태와 대조해서 구체적 구현 방향을 제시했고
(예: 7번은 전날 이미 phash 계산·저장까지 끝나있어서 "점수 반영"만 남았다는
걸 짚음, 1번은 pgvector 인프라 자체는 이미 있다는 걸 짚음), 추천 순서 **7 →
5 → 1(a, 적합도 스코어 노출만)**을 제안. 사용자가 "추천순으로 작업합시다"로
승인해서 착수.

---

## 6. ✅ 작업 1: 이미지 phash 기반 중복판정 강화

**목표 태스크**: #25 (Wire image-phash into poster-duplicate-detector scoring)
**커밋**: `ac1d153`

### 배경
전날(2026-07-27) 세션에서 `ml/image_phash.py`(Pillow만 쓰는 64비트 average
hash)와 `src/image-phash.js`를 만들어서 게시판·블로그 양쪽 이미지의 phash와
해상도를 `notice_sightings.image_phash`/`image_width`/`image_height`에 저장하는
것까지는 끝냈었다. 하지만 그 phash 값을 실제 중복판정 로직
(`poster-duplicate-detector.js`)이 전혀 참조하지 않고 있었다 — 계산·저장만
하고 활용은 안 하는 상태.

### 변경한 파일과 정확한 내용

**`src/poster-duplicate-detector.js`**
- `import { arePhashSimilar } from "./image-phash.js";` 추가
- `getImagePhashes(row)` 헬퍼 신규: `row.imagePhash`(단일 문자열)와
  `row.imagePhashes`(배열)를 모아서 16자리 hex 정규식(`/^[a-f0-9]{16}$/i`)으로
  검증된 값만 반환
- `buildDuplicateFingerprint()`에 `imagePhashes: new Set(getImagePhashes(row))`
  추가
- `scorePosterDuplicate()`에 새 신호 추가:
  ```js
  const phashMatched = !imageMatched && [...candidateFp.imagePhashes].some(
    (hash) => [...existingFp.imagePhashes].some((otherHash) => arePhashSimilar(hash, otherHash))
  );
  if (phashMatched) {
    score += 85;
    matched.push("image-phash");
  }
  ```
  (`!imageMatched` 조건으로 기존 정확 URL 매칭이 이미 성공했으면 중복 가산 안
  되게 막음 — 같은 이미지를 두 번 카운트하는 걸 방지)
- `canMerge` 조건에 `(phashMatched && titleSimilarity >= 0.45)` 추가(기존
  `imageMatched` 조건과 동일한 패턴)

**`src/upload-to-supabase.js`**
- `fetchSightingPhashesByIds(idColumn, ids, batchSize=100)` 신규 헬퍼 — 
  `notice_sightings`에서 주어진 id 컬럼(`poster_id` 또는 `candidate_id`) 기준
  batch로 `image_phash`를 가져와 `Map<id, phash[]>`로 반환
- `loadDuplicateCandidates()`: 기존에 `poster_images`/`poster_links`를
  `Promise.all`로 병렬 로드하던 곳에 `fetchSightingPhashesByIds("poster_id",
  posterIds)`를 세 번째로 추가, 결과를 각 row의 `imagePhashes`에 부착
- `loadNoticeCandidateDuplicateCandidates()`: 동일하게 `candidate_id` 기준으로
  phash 맵을 가져와 부착
- 메인 업로드 루프(`for (const post of posts)`) 안, `findBestPosterDuplicate`
  호출 **직전**에:
  ```js
  const currentImagePhash = sourceImages[0] ? await computeImagePhash(sourceImages[0]) : null;
  ```
  를 추가해서 이번 post의 phash를 **한 번만 계산**하고, 이 값을:
  - `findBestPosterDuplicate`에 넘기는 candidate 객체의 `imagePhash` 필드로 사용
  - `addDuplicateCandidate()`/`addNoticeDuplicateCandidate()`(같은 실행 내
    나중 post들이 참조할 in-memory 후보 목록에 추가하는 함수)에 새 파라미터로
    전달
  - `upsertBoardNoticeSighting()`의 새 옵션 `precomputedImagePhash`로 전달해서
    **재다운로드·재계산 없이 재사용**(이전엔 이 함수가 매번 이미지를 다시
    다운받아 phash를 새로 계산했음)
  - 이 값을 쓰는 4곳의 `upsertBoardNoticeSighting(...)` 호출부 전부 업데이트
    (신규 포스터 삽입, 정확 소스키 중복 병합, 퍼지 중복 병합, 텍스트 후보
    upsert)

**`src/naver-blog-ingester.js`**
- `upsertNoticeSighting()`이 계산한 phash를 리턴값에 포함(`imagePhash:
  imagePhash?.phash ?? null`)하도록 수정
- 호출부(`ingestNaverBlog` 루프)에서 이 값을 받아 `linkOrCreateCandidate()`에
  `{ sourceOrg, imagePhash }`로 전달
- `linkOrCreateCandidate()`의 `candidateShape`에 `imagePhash` 필드 추가 —
  이걸로 블로그에서 새로 만든 후보도 phash 기반 매칭에 참여하게 됨

### 검증

`node -e`로 즉석 스크립트를 만들어 `scorePosterDuplicate()`를 3가지 시나리오로
직접 호출:

```
같은 phash, 다른 URL(게시판 vs 블로그 CDN):
  score: 150, decision: "merge", matched: ["image-phash","title-exact","org"]
다른 phash:
  score: 65, decision: "merge"(제목 완전일치+기관일치 규칙으로— phash와 무관),
  matched: ["title-exact","org"] (image-phash 없음, 정상)
정확히 같은 URL(중복가산 방지 확인):
  score: 160, matched: ["image","title-exact","org"] (image만 있고 image-phash는 없음 — 이중 가산 안 됨 확인)
```

이후 `poster-rules.test.js`에 영구 유닛테스트 3건 추가:
1. "identical image phash across different URLs (board vs. blog CDN)
   triggers a merge"
2. "an exact image URL match is not double-counted as a separate phash
   match"
3. "different image phash values do not falsely merge on their own"

`node --test src/*.test.js` 실행 결과: **55/55 통과**(기존 52건 + 신규 3건).

---

## 7. ✅ 작업 2: OCR/원문 필드 구조화 확장 + 환각 검증 강화

**목표 태스크**: #26 (Expand OCR/router field structuring + hallucination check)
**커밋**: `481acd7`(기능 본체), `840905a`(환각검증 강화)

### 배경 — 기존 코드 재확인

`upload-to-supabase.js`의 `buildReadableNoticeInfo(post)` 함수가 이미
`facts`라는 구조화 객체(`period`/`target`/`content`/`application`/`location`/
`contact`)를 만들고 있었다 — 이게 사업계획서가 말하는 "readableNotice.facts"와
정확히 일치하는 기존 기능이었다. 하지만 `pickField(source, ["대상","지원대상",
"모집대상",...])` 같은 **정규식 라벨 키워드 매칭뿐**이라서, "대상:" 같은 명시적
라벨이 없는 문장체 텍스트나 OCR로 뽑은 노이즈 섞인 텍스트에서는 필드가 많이
비게 되는 구조였다. 즉 "필드가 없다"가 아니라 "필드는 있는데 규칙기반이라
커버리지가 낮다"는 게 실제 문제였다.

### 신규 파일: `src/notice-facts-extractor.js`

기존 `poster-relevance-router.js`와 같은 스켈레톤(OpenAI `/v1/responses` +
`json_schema` strict mode, `OPENAI_REQUEST_TIMEOUT_MS`로 45초 타임아웃, 디스크
캐시, fail-open)을 그대로 따름.

**핵심 함수**: `extractNoticeFactsWithLlm(source, existingFacts)`

**호출 게이팅 로직**(비용 절감이 핵심 설계 원칙):
```js
const missingKeys = FACT_KEYS.filter((key) => !existingFacts[key]);
const filledByRegexCount = FACT_KEYS.length - missingKeys.length;
if (missingKeys.length === 0 || filledByRegexCount >= MIN_REGEX_FACTS_BEFORE_LLM) {
  return baseResult; // LLM 호출 안 함
}
```
`MIN_REGEX_FACTS_BEFORE_LLM` 기본값 3 — 즉 **정규식이 6개 중 3개 이상 채웠으면
LLM을 아예 부르지 않는다**. 이유: 장소·문의처 같은 필드는 온라인 전용
프로그램처럼 본문에 정말로 없는 경우가 많아서 "하나라도 비면 호출"로 게이팅하면
거의 모든 post에서 불필요하게 LLM을 부르게 됨 — "정규식이 명백히 실패한 경우"
(라벨 없는 텍스트, OCR 노이즈)에만 호출하도록 임계값을 둠. 정규식이 이미 채운
필드는 **LLM 응답이 와도 절대 덮어쓰지 않음**.

**출력 스키마**: `period`/`target`/`content`/`application`/`location`/`contact`
(전부 string|null) + `allFactsGroundedInText`(boolean, 자가보고) + `reason`.

### 환각 검증 — 처음 설계와 강화 과정

**1차 설계**: LLM이 스스로 "allFactsGroundedInText: true/false"를 보고하게만
했음.

**실제 API로 검증하며 발견한 문제**: 실제 텍스트로 3가지 케이스를 테스트했다.

*케이스 1 — 라벨 없는 문장체 텍스트* (`.env.local`의 실제 키로 실행):
```
입력: "마포구에 사는 만 19세부터 39세까지의 청년이라면 누구나 참여할 수
있습니다. 2026년 8월 1일부터 8월 20일까지 온라인으로 신청서를 제출하면
됩니다. 프로그램은 청년 창업 아이템 발굴과 멘토링을 지원합니다."
```
1차 결과: `location: "마포구"`로 채움 — **이건 버그다**. "마포구"는 여기서
거주지 자격요건(target)이지, 프로그램이 실제로 열리는 장소(location)가
아니다(이 프로그램은 "온라인" 신청이라 물리적 장소가 아예 없음). LLM이 자가
보고로는 `allFactsGroundedInText: true`라고 답했지만 필드 분류 자체가 틀림.

**프롬프트 수정**: "location(행사·교육·접수가 실제로 열리는 장소/주소 —
target의 거주지 자격요건과 다름, 본문에 그런 장소가 없으면 null)"이라고
명시적으로 구분하는 문구 추가. 캐시(`data/notice_facts_llm.json`) 삭제 후
동일 텍스트로 재테스트 → `location: null`로 정확히 수정됨을 확인.

*케이스 2 — 실제 장소·연락처가 있는 텍스트*:
```
입력: "마포청년나루 2층 다목적홀에서 진행되는 이번 특강은 마포구 거주 청년
30명을 대상으로 합니다. 궁금한 점은 마포구청 청년정책과(02-1234-5678)로
문의하세요."
결과: location: "마포청년나루 2층 다목적홀", contact: "마포구청 청년정책과(02-1234-5678)",
      period: null, application: null (본문에 정말 없어서 null — 정상)
```
정확한 필드 분류와 정확한 null 처리를 동시에 확인함.

**2차 강화 — 자가보고를 믿지 않는 독립 검증 추가**: 자가보고만으로는 부족하다고
판단해서, `isGroundedInText(factValue, content)` 함수를 추가함 — LLM이 채운
값의 bigram(2글자 단위)들이 실제로 원문(공백 제거 후) 안에 몇 % 등장하는지
계산해서, `GROUNDING_BIGRAM_OVERLAP_THRESHOLD = 0.4` 이상이어야 "근거 있음"으로
인정. 통과 못 하면 그 필드는 버리고(null 유지) `rejectedUngrounded` 목록에
기록.

**환각 몹업 테스트**로 이 독립 검증이 실제로 작동하는지 확인:
```js
// fetch를 몹킹해서, 모델이 "period: '2026년 9월 1일부터'"(본문에 없는 날짜)를
// 채우면서 동시에 allFactsGroundedInText: true라고 거짓 자가보고하는 상황을 재현
```
결과:
```json
{
  "facts": {"period": null, ...},
  "allFactsGroundedInText": false,
  "filledByLlm": [],
  "rejectedUngrounded": ["period"],
  "reason": "fake self-report claiming grounded"
}
```
**모델의 거짓 자가보고와 무관하게, 독립 검증이 실제로 환각을 잡아내고 값을
버리는 것까지 확인함.** 최종 `allFactsGroundedInText`는 `parsed.
allFactsGroundedInText && rejectedUngrounded.length === 0` 로 계산해서, 자가
보고가 true여도 독립검증에서 하나라도 걸리면 최종값이 false로 뒤집히게 함.

### 실제 연결 지점

`buildReadableNoticeInfo()`는 그대로 두고(정규식 로직 자체는 안 건드림), 새
비동기 헬퍼 `enrichReadableNoticeInfoWithLlm(readableInfo, post)`를 추가해서
`upload-to-supabase.js`의 **딱 2곳**에만 연결:
1. `upsertNoticeCandidate()` — SNS 후보(`poster_notice_candidates`)로 최종
   저장되는 지점
2. 메인 루프의 posters 테이블 insert 직전(`postWithStoredImages` 기준)

**의도적으로 안 건 곳**: `addNoticeDuplicateCandidate()`(in-memory 중복후보
캐시 생성용, 이미 위 1번에서 실제 값이 확정된 뒤 호출되는 부차적인 캐시라
여기서 또 LLM을 부르면 같은 내용에 비용을 두 번 쓰는 셈이라 제외).

`mergeReadableNoticeIntoFieldVerification()`도 수정해서 `factsLlmMeta`(어떤
필드를 LLM이 채웠는지, 근거검증 통과했는지, 어떤 모델을 썼는지)를 저장된
`field_verification.readableNotice`에 같이 기록하도록 함 — 나중에 감사(audit)
가능하게.

`.env.example`에 `NOTICE_FACTS_EXTRACTOR=auto`, `OPENAI_NOTICE_FACTS_MODEL=
gpt-5-mini`, `NOTICE_FACTS_MIN_REGEX_FIELDS=3` 추가.

`node --test src/*.test.js` — 55/55 통과(기존 로직을 건드리지 않아서 회귀
없음).

---

## 8. ✅ 작업 3: 시맨틱 검색 적합도 스코어 노출 + 임베딩 백필 버그 발견/수정

**목표 태스크**: #27 (Expose semantic similarity score in recommendation API)
**커밋**: `1b4c81a`

### 기존 상태 파악

`apps/web/app/page.tsx`에서 `supabase.rpc("get_recommended_posters_v2", ...)`를
호출하는 걸 발견 — 이게 실제 "Core" 기능의 진입점이었다. 이 RPC의 정의를
`supabase/migrations/20260720021000_add_semantic_recommendation.sql`에서
찾았는데, 이미 다음을 하고 있었다:
- 사용자의 찜(favorites, 가중치 2배)과 최근 조회(poster_view_logs, 최근 50건)
  이력으로 "관심 임베딩"(`v_interest_embedding`)을 요청마다 즉석 계산
  (`AVG(e)`로 평균)
- `recom_score` = 지역매칭(최대40) + 카테고리매칭(최대30) + 대상/성별매칭
  (±20/-15) + 마감임박보너스(최대10) + **의미유사도 보너스**(최대30,
  `GREATEST(0, 1 - (p.embedding <=> v_interest_embedding)) * 30.0`)

즉 코사인 유사도 자체는 이미 계산되고 있었지만, 5개 요소가 합쳐진
`recom_score`라는 복합 점수 안에만 녹아 있어서 **순수 유사도 값 자체는 한
번도 별도로 노출된 적이 없었다.** 이게 정확히 사용자가 우선순위로 지목한
"1(a) 적합도 스코어 0~100% 노출"에 해당하는 가장 빠른 win이라고 판단.

### 마이그레이션: `20260728000000_expose_similarity_score.sql`

`get_recommended_posters_v2` 함수를 수정해서 `similarity_score FLOAT` 컬럼을
추가로 반환하게 함(계산 로직 자체는 그대로, `* 30.0` 스케일링 **전**의 원본
0.0~1.0 코사인 유사도를 그대로 반환). PostgreSQL은 `RETURNS TABLE`의 컬럼
목록을 `CREATE OR REPLACE FUNCTION`으로 바꿀 수 없어서(반환 타입 변경 자체를
거부함), `DROP FUNCTION IF EXISTS get_recommended_posters_v2(UUID, INT);` 를
먼저 실행하고 `CREATE FUNCTION`으로 재생성하도록 작성.

`npx supabase db push --dry-run` → `db push`로 실제 적용.

### 검증 중 발견한 진짜 문제 — 임베딩이 전부 비어있었음

RPC가 잘 작동하는지 실제 프로필로 테스트:
```js
// 임의의 profile로 호출
recom_score: 50, similarity_score: null  // (찜/조회 이력 없는 프로필 — 정상)
```
찜(favorites)이 있는 프로필로도 테스트했는데도 **여전히 `similarity_score:
null`이 전부**였다. 이상해서 직접 확인:
```sql
-- 개념적으로
SELECT count(*) FROM posters WHERE embedding IS NOT NULL;  -- 결과: 0
SELECT count(*) FROM posters;                              -- 결과: 1790
```
**포스터 1,790건 중 임베딩이 있는 게 0건.** pgvector 인프라(마이그레이션,
HNSW 인덱스, RPC 함수)는 전부 존재하는데, 실제 데이터는 한 번도 채워진 적이
없었다는 뜻 — "Core: 시맨틱 매칭"이 인프라만 있고 실제로는 작동한 적이 없던
기능이었다는 걸 이 시점에 처음 알게 됨.

### 원인 진단

1. `embedPosterText({title, summaryShort, summaryLong})`(`poster-embedder.js`)를
   `.env.local`의 실제 키로 **직접 호출해보니 정상 작동**(1536차원 임베딩
   정상 반환) — 함수 자체는 멀쩡함.
2. GitHub Actions 워크플로(`crawler.yml`)의 "Upload to Supabase" 스텝에
   `OPENAI_API_KEY`가 전달되고 있는지 확인 — 전달되고 있었음(이전 세션에서
   이미 고쳐놓은 부분).
3. 그럼 왜 안 될까 — `package.json`에 있던 `embed:backfill`(`node src/
   backfill-poster-embeddings.js`) 스크립트를 살펴봄. 이 스크립트가 자체적으로
   `dotenv.config({path: ".../apps/web/.env.local"})`, `dotenv.config({path:
   "../.env"})`, `dotenv.config()` 세 경로만 시도하고 있었는데, **정작
   `OPENAI_API_KEY`가 있는 `scripts/crawler/.env.local`은 후보에 아예 없었다.**
   나머지 모든 크롤러 모듈이 쓰는 표준 `src/load-env.js`는 `.env.local`을
   최우선으로 확인하는데, 이 백필 스크립트만 자체적으로 다른(그리고 틀린)
   로직을 갖고 있었던 것.
4. `--dry-run`으로 실행해보니 `{checked: 457, embedded: 0, skipped: 457}` —
   전부 스킵. `embedPosterText`가 `isAiModeEnabled()` 체크에서 `OPENAI_API_KEY`를
   못 찾아 매번 `null`을 반환하고, 그게 fail-open 설계 때문에 에러 없이
   조용히 "skipped"로만 처리되고 있었던 것.

### 수정 및 실행

`backfill-poster-embeddings.js`의 앞부분을 다음으로 교체:
```js
import "./load-env.js";  // 기존의 잘못된 3중 dotenv.config() 호출 전부 삭제
```
재실행:
```
node src/backfill-poster-embeddings.js 5 --dry-run
→ {"checked": 5, "embedded": 5, "skipped": 0, "dryRun": true}   ✅ 수정 확인

node src/backfill-poster-embeddings.js 1000
→ {"checked": 457, "embedded": 457, "skipped": 0, "dryRun": false}   ✅ 전량 성공
```
(457건 = `poster_status IN ('published','review')`이면서 `embedding IS NULL`인
행 전체 — published 437 + review 20)

재확인 쿼리로 `posters.embedding NOT NULL` 카운트가 정확히 457로 늘어난 것,
그리고 찜이 있는 프로필로 RPC를 다시 호출했더니:
```json
[
  {"title": "서울시공익활동지원센터 <...>", "recom_score": 64.24, "similarity_score": 0.4747},
  {"title": "서울청년센터 노원 <...>", "recom_score": 62.16, "similarity_score": 0.4055},
  {"title": "관악여성인력개발센터 <...>", "recom_score": 61.65, "similarity_score": 0.3882},
  ...
]
```
**실제 사용자별 편차가 있는 점수가 처음으로 나오기 시작함**(이전엔 임베딩이
없어서 의미유사도 보너스가 항상 0이라 모두가 동일한 `recom_score: 50`을 받고
있었다). 즉 이 버그 수정 하나로 **개인화 추천 시스템 자체가 사실상 처음으로
실제 작동하기 시작**했다 — 애초에 하려던 "유사도 스코어 노출"보다 훨씬 큰
부수 효과.

### 프론트엔드 연결

**`apps/web/app/components/PosterCard.tsx`**
- `PosterCardProps.poster`에 `similarityScore?: number | null` 추가
- ```js
  const fitPercent = typeof poster.similarityScore === "number"
    ? Math.round(poster.similarityScore * 100) : null;
  const showFitBadge = fitPercent !== null && fitPercent >= 30;
  ```
  30% 미만은 배지를 안 보여줌(너무 낮은 유사도는 "AI가 추천했다"는 신뢰를
  깎는다고 판단) — 30% 이상일 때만 카드 상단 태그 줄에 "맞춤 NN%" 배지 추가
  (파란색 톤, 기존 카테고리/지역 태그와 같은 줄에 배치)

**`apps/web/app/page.tsx`**
- `attachPosterMeta()`의 반환 객체에 `similarityScore: poster.similarity_score
  ?? null` 매핑 추가(RPC의 snake_case 컬럼을 camelCase prop으로 변환. 공개
  목록 경로(`fetchPublicPosters`)는 이 컬럼 자체가 없어서 자연히 undefined→
  null이 되어 배지가 안 뜸)
- `<PosterCard poster={{...}}>` 호출부에 `similarityScore: poster.similarityScore`
  전달 추가

### 검증
- `npx tsc --noEmit -p tsconfig.json` → 에러 0건(전체 프로젝트 클린 컴파일)
- 개발 서버(`preview_start name:"web"`) 실행 후 비로그인 상태로 홈페이지 접속
  → 콘솔 에러 0건, 페이지 정상 렌더링("96개 기관 수집 중" 등 다른 통계도
  정확히 표시되는 것 확인), 배지는 (예상대로) 안 보임 — `similarityScore`가
  없는 공개 목록 경로이므로 정상
- **로그인 상태에서 실제 배지가 뜨는 화면 자체는 테스트 계정이 없어서 브라우저로
  직접 확인하지 못했다** — RPC 직접 호출로 값이 정확히 계산되는 것, 컴포넌트
  로직(임계값·반올림)이 올바른 것, 타입체크가 통과하는 것으로 대체 검증함.
  다음에 실제 로그인 계정으로 화면까지 확인하는 걸 권장.

---

## 9. 전체 커밋 목록 (전부 push 완료)

```
ac1d153 feat: use image phash to strengthen duplicate-poster matching
481acd7 feat: LLM fallback to fill notice fact fields regex extraction misses
840905a fix: independently verify notice-facts groundedness instead of trusting self-report
1b4c81a feat: expose AI fit score on recommended posters, fix dead embedding backfill
cbbf893 docs: record pitch-deck review findings and today's 3 AI feature implementations
```
(사업계획서 검토 자체는 코드 변경이 없어 커밋 없음)

### 새로 생기거나 바뀐 파일
**신규**: `scripts/crawler/src/notice-facts-extractor.js`,
`supabase/migrations/20260728000000_expose_similarity_score.sql`,
`WORK_LOG_20260728_ai_features.md`(이 파일)

**수정**: `scripts/crawler/src/poster-duplicate-detector.js`,
`scripts/crawler/src/upload-to-supabase.js`,
`scripts/crawler/src/naver-blog-ingester.js`,
`scripts/crawler/src/poster-rules.test.js`(유닛테스트 3건 추가),
`scripts/crawler/src/backfill-poster-embeddings.js`(dotenv 로딩 버그 수정),
`scripts/crawler/.env.example`(NOTICE_FACTS_* 3개 변수 추가),
`apps/web/app/components/PosterCard.tsx`,
`apps/web/app/page.tsx`,
`WORK_LOG_20260726_sns_ingestion.md`(8-3 섹션의 phash 관련 완료 표시 갱신)

### DB에 실제로 반영된 것
- `posters.embedding` 457건 신규 채움(published 437 + review 20)
- `get_recommended_posters_v2` 함수 재정의(DROP+CREATE, `similarity_score`
  컬럼 추가)

---

## 10. 남은 일

- **Core: 자연어 검색 자체는 없음.** 지금 있는 건 "찜/조회 이력 기반 유사도"뿐
  — 검색창에 자연어 질의를 입력하면 그걸 임베딩해서 매칭하는 기능은 존재하지
  않는다. 사업계획서의 "RAG 기반 자연어 질의 이해"는 이 신규 기능을 가리키는
  것이므로, 만들려면 (a) 질의 임베딩 + HNSW 검색 API 엔드포인트 신설, (b)
  지역/업종 슬롯 추출 후 기존 region/category 컬럼과 결합하는 하이브리드
  검색, (c) top-K 결과를 LLM에 넣어 "왜 이 공고가 맞는지" 한 줄 생성 —
  이렇게 3단계로 나눠 만드는 걸 추천했었음(아직 착수 안 함).
- **Outbound 3종(기관용 공고 생성기, GenAI 포스터/카드뉴스 생성기, AI 성과
  분석·리포팅)은 전부 손 안 댐** — 완전 신규 개발 항목. 특히 공고 생성기와
  성과 리포팅은 기관 로그인·초안 저장·이벤트 로깅 같은, 지금 크롤러
  코드베이스엔 아예 없는 새 인프라(주로 `apps/web` 쪽)가 필요해서 별도 설계
  논의가 필요함.
- **econ-gwangju(광주경제고용진흥원, gepa.or.kr) SSL 인증서 불일치** — 2026-07-27
  기록에서 이어지는 미해결 건. 인증서가 `jni.re.kr` 앞으로 발급돼 있어 브라우저가
  접속 자체를 거부함 — 새 도메인을 웹검색으로 재조사해야 함.
- **로그인 상태에서 "맞춤 NN%" 배지가 실제로 잘 보이는지 브라우저로 시각
  확인 필요** — 이번엔 테스트 계정이 없어 RPC+타입체크로만 검증함.
- 정규식 기반 6개 필드(`buildReadableNoticeInfo`)와 LLM 보완의 실제 커버리지
  향상 폭(예: "정규식만 있을 때 각 필드가 몇 %의 공고에서 채워지는지" vs
  "LLM 보완 후 몇 %로 올라갔는지")은 아직 정량적으로 측정 안 함 — 사업계획서의
  "95%↑ 정확도" 목표에 쓸 실제 baseline 숫자가 필요하면 100+건 골든셋을 만들어
  측정하는 후속 작업이 필요함.

---

## 11. 2026-07-28 후속 리뷰 보강 — Claude 작업 검토 후 안전장치 추가

사용자가 "현재 클로드가 작업한 내용들이 잘 되었는지도 검사"를 요청해서 최신
AI 기능 작업을 코드 리뷰 관점으로 재검토했다.

### 확인 결과
- `pnpm --filter posterlink-crawler test` 통과
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` 통과
- `pnpm --filter web build` 통과
- 운영 DB에서 `get_recommended_posters_v2` 직접 호출해 `similarity_score` 반환 확인

### 보강 1 — pHash 중복판정 자동 병합 조건 완화

문제: `image-phash`가 85점을 주고 `score >= 90`이면 바로 merge라, 같은 기관
공통 배너/템플릿 이미지가 반복될 때 서로 다른 공고가 자동 병합될 위험이 있었다.

조치: `phashMatched`는 여전히 강한 신호로 쓰되, 자동 merge는 제목 유사도와 함께
기관명/마감일/신청URL 중 하나가 보강될 때만 허용하도록 변경. 보강 신호가 부족하면
`review`로 남긴다.

추가 테스트:
`matching image phash without org or deadline corroboration stays review, not merge`

### 보강 2 — LLM 구조화 환각 reject 감사 메타 저장

문제: `filledByLlm.length === 0`이면 바로 `readableInfo`를 반환해서, LLM을 실제로
호출했고 `rejectedUngrounded`가 있어도 `field_verification.readableNotice.
factsLlmMeta`에 남지 않았다.

조치: `filledByLlm`이 비어 있어도 `model !== "none"`이거나 `rejectedUngrounded`가
있으면 `factsLlmMeta`를 저장하도록 변경.

### 보강 3 — LLM 독립 근거검증 회귀 테스트 추가

`notice-facts-extractor.test.js` 추가. `fetch`를 모킹해서 모델이 본문에 없는
`period` 값을 채우고 동시에 `allFactsGroundedInText: true`라고 거짓 보고하는
상황을 재현한다. 기대 결과는 `period: null`, `rejectedUngrounded: ["period"]`,
`allFactsGroundedInText: false`.

테스트 캐시가 실제 `data/notice_facts_llm.json`을 더럽히지 않도록
`NOTICE_FACTS_CACHE_PATH` 환경변수도 추가했다(기본값은 기존과 동일).

### 보강 4 — 웹 번들 크롤러 업로드 CLI 진입점 수정

`pnpm --filter web build` 중 `upload-to-supabase.js`의 `import.meta.url`이 CJS
번들에서 비어 있다는 esbuild 경고가 계속 나왔다. 확인해보니 관리자 크롤러 실행
API(`/api/admin/crawler/run`)는 빌드된 `apps/web/.generated/crawler/
upload-to-supabase.cjs`를 `node upload-to-supabase.cjs <result.json>`로 직접
실행하는데, 기존 direct-execution 체크가 `import.meta.url` 비교라 CJS 번들에서는
false가 되어 업로드 단계가 조용히 실행되지 않을 수 있었다.

조치: direct-execution 체크를 `path.basename(process.argv[1])` 기반으로 바꿔
`upload-to-supabase.js`와 `upload-to-supabase.cjs` 양쪽에서 동작하게 수정.

검증:
- `pnpm --filter web build`에서 해당 esbuild 경고 사라짐
- `node apps/web/.generated/crawler/upload-to-supabase.cjs` 인자 없이 실행 시
  usage 출력 후 exit 1 확인(즉 CLI 진입점이 실제로 살아 있음)

최종 검증:
- `pnpm --filter posterlink-crawler test` → 57/57 통과
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` → 통과
- `pnpm --filter web build` → 통과

---

## 12. 2026-07-28 Core 자연어 검색 v1 구현

사업계획서의 Core 항목인 "RAG 기반 자연어 질의 이해"에 맞춰, 포스터 목록 검색에 임베딩 기반 의미 검색 경로를 추가했다. 기존 키워드/동의어 검색은 OpenAI 키 누락, API 오류, 의미 검색 결과 없음 상황에서 fallback으로 그대로 유지한다.

### 변경 사항
- `supabase/migrations/20260728010000_add_semantic_search_rpc.sql`
  - `match_posters_by_embedding` RPC 추가.
  - `posters.embedding`과 query embedding의 cosine similarity 기준으로 접수 중인 published 공고를 정렬.
- `supabase/migrations/20260728011000_fix_semantic_search_return_types.sql`
  - 운영 DB의 varchar 컬럼과 `RETURNS TABLE ... TEXT` 타입 불일치 보정.
- `supabase/migrations/20260728012000_add_semantic_search_filters.sql`
  - 카테고리/지역 필터가 켜진 상태에서도 DB 단계에서 먼저 필터링한 뒤 의미 점수순 top-K를 고르도록 RPC 확장.
- `apps/web/app/api/posters/semantic-search/route.ts`
  - 서버에서 OpenAI embedding 생성 후 Supabase RPC 호출.
  - `OPENAI_API_KEY`가 없거나 실패하면 200 응답으로 빈 결과를 반환해 클라이언트가 기존 키워드 검색으로 fallback.
- `apps/web/app/posters/page.tsx`
  - 접수 중 목록에서 검색어 2자 이상이면 의미 검색을 먼저 시도.
  - 성공 시 결과 카운트에 `의미순` 표시.
  - 의미 점수를 `PosterCard`의 `similarityScore`로 전달해 `맞춤 NN%` 배지 표시.
  - 카테고리/지역/내 맞춤/정렬 필터는 기존 흐름과 함께 동작하도록 유지.

### 검증
- `npx supabase db push --dry-run` → 신규 마이그레이션 적용 대상 확인
- `npx supabase db push` → 운영 DB에 `20260728012000_add_semantic_search_filters.sql` 적용
- API 직접 검증
  - `청년 창업 지원금` → `semantic: true`
  - 1순위: `「2026년 청년 취업 준비 비용 지원사업」 신청자 모집공고`
  - 카테고리 필터 포함 요청도 `semantic: true` 및 결과 반환 확인
- 화면 검증
  - `/posters?q=청년 창업 지원금`
  - 결과 문구: `총 80건 · 접수 중 · 의미순`
  - 첫 5개 결과가 API 의미 점수순과 일치
  - `맞춤 NN%` 배지 12개 표시
  - 콘솔 에러 0건
  - 스크린샷: `data/results/semantic-search-posters.png`
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` → 통과
- `pnpm --filter posterlink-crawler test` → 57/57 통과
- `pnpm --filter web build` → 통과

---

## 13. 2026-07-28 Outbound 스마트 공고 생성기 v1 구현

Core 자연어 검색 v1 다음 단계로, 사업계획서의 Outbound 항목 중 "기관용 스마트 공고 생성기"의 첫 화면 기능을 추가했다. 포스터 이미지를 올리는 기존 OCR 흐름은 유지하고, 기관 담당자가 원문 메모나 행사 정보를 텍스트로 붙여넣으면 AI가 등록 폼의 주요 항목을 먼저 채우는 방식이다.

### 변경 사항
- `apps/web/app/api/operator/posters/draft/route.ts`
  - 로그인 사용자만 호출 가능한 초안 생성 API 추가.
  - OpenAI `/v1/responses` + `json_schema`로 제목, 기관명, 카테고리, 지역, 마감일, 요약, 공식 링크를 구조화.
  - 카테고리/지역은 운영 DB의 실제 `categories`, `regions` id 후보 중 하나만 반환하도록 제한.
  - 불명확하거나 누락된 항목은 `missingFields`, `ambiguousPhrases`로 별도 반환.
  - `OPENAI_POSTER_DRAFT_MODEL` → `OPENAI_NOTICE_FACTS_MODEL` → `gpt-5-mini` 순서로 모델 선택.
- `apps/web/app/operator/posters/new/page.tsx`
  - 신규 등록 화면에 `AI 공고 초안` 패널 추가.
  - `초안 채우기` 버튼으로 API 호출 후 기존 폼 상태에 병합.
  - AI가 지적한 누락/모호 항목을 노란 검토 박스로 표시.

### 검증
- API 직접 검증
  - 입력: 마포구 청년 창업 교육 참여자 모집, 무료, 2026-08-31 마감, 공식 링크 포함.
  - 반환: 제목/기관/카테고리/지역/마감/요약/링크 정상 구조화.
  - 누락 정보(신청방법, 교육기간, 장소, 모집인원, 제출서류 등)와 모호 표현 반환 확인.
- 화면 검증
  - 임시 operator 프로필 사용자로 `/operator/posters/new` 진입.
  - `AI 공고 초안`, 설명문, `초안 채우기` 버튼 표시 확인.
  - 스크린샷: `data/results/operator-smart-draft.png`
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` → 통과
- `pnpm --filter web build` → 통과

---

## 14. 2026-07-28 Outbound 포스터 이미지 자동 제작 v1 구현

스마트 공고 생성기 다음 단계로, 운영자 신규 포스터 등록 화면에서 텍스트/초안 폼 값만으로 검수용 기본 포스터 이미지를 만들 수 있게 했다. 기존 이미지 업로드/OCR 흐름을 대체하지 않고, 이미지가 없는 기관 담당자가 바로 검수 등록까지 갈 수 있는 보조 경로다.

### 변경 사항
- `apps/web/app/operator/posters/new/page.tsx`
  - 1080x1350 PNG를 브라우저 canvas로 생성하는 템플릿 포스터 제작 함수 추가.
  - 제목, 기관명, 카테고리, 마감일, 요약을 포스터 레이아웃에 반영.
  - 입력 텍스트 기반으로 파란색/초록색/빨간색/보라색 팔레트를 안정적으로 선택.
  - `포스터 이미지 자동 제작` 섹션과 `이미지 만들기` 버튼 추가.
  - 생성된 PNG Blob을 기존 `croppedImageBlobs`/`imagePreviews`에 주입해 기존 업로드/저장 로직을 그대로 사용.

### 검증
- 임시 operator 프로필 사용자로 `/operator/posters/new` 진입.
- 제목/기관/마감/요약 입력 후 `이미지 만들기` 클릭.
- 이미지 preview가 0개 → 1개로 증가 확인.
- 콘솔 에러 0건.
- 스크린샷: `data/results/operator-template-poster.png`
- `pnpm --filter web exec tsc --noEmit -p tsconfig.json` → 통과
- `pnpm --filter web build` → 통과
