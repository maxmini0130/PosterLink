# PosterLink — AI 수집·검증·노출 파이프라인 개선 스펙

작성일: 2026-08-24
대상: Claude Code 구현 지시서
목표: **이미 추출된 데이터가 "미검증"이라는 이유로 잠겨 있는 문제를 풀고, 포스터 판별 정확도를 높여 노출량을 늘린다.**

---

## 0. 배경 — 왜 이 작업을 하는가

운영자 대시보드 실측 (2026-08-24):

```
검증 완료 0 · 검토 대기 0 · SEO 준비 0 · 캘린더 준비 0 · 마감 알림 준비 0
검증 상태: verified 0 · unverified 전체
게시 중 포스터 554건 / 공개 기관 97개
```

게시 중인 포스터가 554건인데 SEO·캘린더·마감알림 기능은 0건에 걸려 있다.
원인은 AI 추출 실패가 아니라 **검증 상태가 포스터 단위 이분법(verified / unverified)이라,
필드 하나라도 불확실하면 포스터 전체가 사용 불가로 취급되는 구조**다.

실제 사례 — `/posters/375c5f75-...` (서울청년센터 동대문):
- 본문에는 "만 18~34세", "이수 시 참여수당 50만원", "구글폼 신청"이 명확히 존재
- 그러나 상단 핵심 조건 카드는 연령/혜택/신청방법이 모두 "확인 필요"

따라서 작업 순서는 **① 필드 단위 신뢰도 → ② 골든셋 측정 → ③ 노출 등급제 → ④ 포스터 판별 강화** 순이다.
③은 ①이 없으면 만들 수 없고, ③의 임계값은 ②가 없으면 근거 없이 정하게 된다.

---

## 1. 사전 확인 (구현 시작 전 필수)

이 문서는 관찰된 UI/동작을 기반으로 작성되었다. 아래를 실제 스키마와 대조한 뒤 시작할 것.

- [x] `posters` 테이블의 현재 컬럼 및 `verification` / `status` enum 실제 값
- [x] `poster_links` 의 `type` enum (관찰된 값: `official_notice`, 신청 페이지용 값)
- [x] `poster_images` 구조 및 대표 이미지 지정 방식
- [x] `collection_sources` 와 `source_key` 의 관계
- [x] 관리자 승인 체크리스트 로직 위치 (파일 경로)
- [x] OCR Edge Function `process-ocr` 의 현재 출력 JSON 형태

**스키마 이름이 다르면 이 문서의 이름이 아니라 실제 스키마를 따르고, 문서를 갱신할 것.**

### 1.1 실제 스키마 확인 결과 (2026-08-24)

- `posters` 공개 수명주기 컬럼은 `status`가 아니라 `poster_status`다.
  - 현재 값: `draft`, `review`, `published`, `hidden`, `rejected`, `closed`, `archived`
- 구조화 검증 상태는 별도 컬럼 `verification_status`를 사용한다.
  - 현재 값: `unverified`, `needs_review`, `verified`, `rejected`
- `poster_links.link_type` 현재 값:
  - `official_notice`, `official_apply`, `official_homepage`, `reference_blog`, `reference_news`, `reference_video`
- `poster_images`는 `poster_id`, `storage_path`, `width`, `height`, `image_type` 구조를 사용한다.
  - `image_type`: `original`, `processed`, `thumbnail`
  - 대표 이미지는 `posters.thumbnail_url`과 `poster_images.image_type='thumbnail'` 조합으로 관리된다.
- `collection_sources`는 수집 채널 인벤토리이며, 크롤러 결과의 원문 URL은 `posters.source_key`와 `poster_links.official_notice`로 연결된다.
- 관리자 승인 체크리스트 위치:
  - `apps/web/app/admin/posters/page.tsx`
  - 핵심 함수: `getApprovalChecklist`, `getPrimarySourceUrl`
- OCR Edge Function 현재 위치:
  - `supabase/functions/process-ocr/index.ts`
  - 기존 입력: `imageBase64`
  - Phase 1 이후 선택 입력: `posterId`
  - 기존 출력은 유지하고, `fieldEvidence`, `unresolved`를 추가한다.

따라서 아래 SQL의 `status = 'published'` 조건은 실제 구현에서 `poster_status = 'published'`로 적용한다.

---

## 2. Phase 1 — 필드 단위 신뢰도 + 근거 저장

### 2.1 왜

- 지금: 포스터 1건 = 신뢰도 1개 → 연령 하나 불확실하면 마감일까지 못 쓴다
- 이후: 필드마다 신뢰도 → 확실한 필드는 즉시 노출, 불확실한 필드만 "원문 확인"

**근거(evidence) 저장이 이 Phase의 핵심이다.** 값만 저장하면 나중에 검증할 방법이 없다.
근거를 함께 저장하면:
1. 사람 검수 시간이 급감한다 ("이 문장이 근거입니다, 맞습니까?" 한 번이면 끝)
2. 사용자에게 "포스터에 이렇게 적혀 있습니다"를 보여줄 수 있다
3. 모델 교체 시 회귀 테스트가 가능해진다
4. 근거를 못 대는 값은 자동으로 낮은 신뢰도가 되어 환각이 걸러진다

### 2.2 스키마

```sql
-- 필드별 추출 결과와 근거
create table poster_field_evidence (
  id            uuid primary key default gen_random_uuid(),
  poster_id     uuid not null references posters(id) on delete cascade,
  field_key     text not null,          -- 아래 2.3 필드 목록 참조
  value_text    text,                   -- 정규화 전 원문 표현 ("만 18~34세")
  value_json    jsonb,                  -- 정규화 결과 ({"min":18,"max":34})
  confidence    numeric(3,2) not null,  -- 0.00 ~ 1.00
  evidence_text text,                   -- 근거가 된 원문/OCR 문장 (최대 300자)
  evidence_src  text not null,          -- 'ocr' | 'body' | 'attachment' | 'rule' | 'operator'
  extractor     text not null,          -- 'gpt-4o' | 'regex-date-v1' | 'human' 등
  extracted_at  timestamptz not null default now(),
  unique (poster_id, field_key, extractor)
);

create index on poster_field_evidence (poster_id);
create index on poster_field_evidence (field_key, confidence);
```

`posters` 에는 판정 결과 캐시만 추가한다 (매 조회 시 재계산 방지):

```sql
alter table posters
  add column exposure_tier   text,            -- 'A' | 'B' | 'C'  (Phase 3)
  add column tier_computed_at timestamptz,
  add column tier_reason     jsonb;           -- 판정 근거 (디버깅/관리자 표시용)

create index on posters (exposure_tier) where status = 'published';
```

### 2.3 필드 목록과 등급

| field_key | 중요도 | 비고 |
|---|---|---|
| `deadline_date` | **critical** | 틀리면 실제 피해. 가장 보수적으로. |
| `deadline_type` | **critical** | 관찰된 값: 마감일 고정 / 상시 모집 / 소진 시 마감 / 모집 예정 / 일정 확인 필요 |
| `host_org` | **critical** | 실제 주최·주관 (수집 출처와 구분) |
| `official_url` | **critical** | `poster_links.official_notice` |
| `is_real_poster` | **critical** | Phase 4 산출물 |
| `apply_start` | major | |
| `category` | major | |
| `region` | major | |
| `age_min` / `age_max` | minor | |
| `target_desc` | minor | |
| `benefit` | minor | |
| `apply_method` | minor | |
| `apply_url` | minor | |
| `cost` | minor | |
| `contact` | minor | |
| `capacity` | minor | |
| `venue` | minor | |

**critical 필드는 신뢰도 임계값을 별도로(더 높게) 둔다.** Phase 3 참조.

### 2.4 신뢰도 산정 규칙

모델이 뱉은 confidence를 그대로 믿지 말 것. 아래 규칙으로 보정한다.

```ts
// lib/extraction/confidence.ts
export function adjustConfidence(raw: FieldExtraction): number {
  let c = raw.modelConfidence ?? 0.5;

  // 1. 근거 없으면 상한 0.4 — 환각 방지의 핵심
  if (!raw.evidenceText || raw.evidenceText.trim().length < 4) {
    c = Math.min(c, 0.4);
  }

  // 2. 근거 문장에 값이 실제로 포함되어 있는지 (문자열 대조)
  if (raw.evidenceText && raw.valueText &&
      !normalizeForMatch(raw.evidenceText).includes(normalizeForMatch(raw.valueText))) {
    c *= 0.6;
  }

  // 3. 규칙 기반 추출은 가산 (날짜/전화/URL은 정규식이 LLM보다 정확)
  if (raw.extractor.startsWith('regex-')) c = Math.min(1, c + 0.15);

  // 4. 두 소스(본문·OCR)에서 같은 값이 나오면 가산
  if (raw.corroboratedBy?.length) c = Math.min(1, c + 0.1 * raw.corroboratedBy.length);

  // 5. 소스 간 값이 충돌하면 감점 (충돌 자체를 tier_reason에 기록)
  if (raw.conflictsWith?.length) c *= 0.5;

  // 6. 사람이 확인한 값은 무조건 1.0
  if (raw.extractor === 'human') c = 1.0;

  return Math.round(c * 100) / 100;
}
```

### 2.5 프롬프트 변경

OCR/구조화 프롬프트를 **필드별 근거를 강제하는 구조화 출력**으로 바꾼다.

```jsonc
// 응답 스키마 (structured output / tool call로 강제)
{
  "fields": [
    {
      "field_key": "deadline_date",
      "value_text": "2026년 8월 31일",
      "value_json": { "date": "2026-08-31" },
      "confidence": 0.95,
      "evidence_text": "신청 기간 8.1.(토)~8.31.(월) 선착순 모집",
      "evidence_src": "body"
    }
  ],
  "unresolved": ["capacity", "venue"]   // 근거를 못 찾은 필드는 여기에
}
```

프롬프트 규칙 (시스템 메시지에 명시):
- **근거 문장을 원문에서 그대로 인용할 수 없으면 값을 만들지 말고 `unresolved`에 넣을 것**
- 추론하지 말 것. "청년 대상이니 아마 19~39세"는 금지
- 모집 기간이 명시되지 않으면 `deadline_type: "일정 확인 필요"`. **절대 "상시 모집"으로 바꾸지 말 것**
- 날짜는 Asia/Seoul 기준. 연도가 없으면 게시일 기준으로 추정하되 confidence 0.5 이하

### 2.6 완료 기준

- [x] 마이그레이션 적용 및 RLS 정책 설정 (읽기: 공개 필드만 / 쓰기: service role)
- [x] `process-ocr` 이 `poster_field_evidence` 에 기록
- [x] 기존 554건 백필 배치 스크립트 (재크롤 없이 저장된 원문·OCR 텍스트로 재가공)
- [x] `adjustConfidence` 단위 테스트 (규칙별 최소 1케이스)

---

## 3. Phase 2 — 골든셋 평가 하네스

**임계값을 감으로 정하지 않기 위한 단계.** Phase 3보다 먼저 한다.

### 3.1 라벨링 세트

- 규모: **최초 120건** (이후 매월 20건씩 추가)
- 구성비를 실제 분포와 맞출 것:
  - 정상 포스터 60건
  - 이미지 없는 텍스트 공고 20건
  - 로고/배너만 있는 건 15건
  - 포스터 기준 미달 유형(채용·입찰·행정공고) 15건
  - 중복 의심 10건
- 저장: `eval/golden/*.json` (git 관리)

```jsonc
// eval/golden/0001.json
{
  "poster_id": "375c5f75-5e5f-4ff1-b669-a617e6e696b2",
  "labeled_by": "max",
  "labeled_at": "2026-08-25",
  "truth": {
    "is_real_poster": true,
    "content_type": "recruit",          // recruit | news | admin | discard
    "deadline_date": "2026-08-31",
    "deadline_type": "fixed",
    "host_org": "서울청년센터 동대문",
    "age_min": 18, "age_max": 34,
    "benefit": "이수 시 참여수당 50만원",
    "official_url": "https://..."
  }
}
```

### 3.2 평가 스크립트

```
scripts/eval-extraction.ts
  --set eval/golden
  --extractor current|candidate
  --out eval/reports/<timestamp>.json
```

출력 지표 (필드별):

| 지표 | 정의 | 용도 |
|---|---|---|
| accuracy | 정답과 일치한 비율 | 전반 성능 |
| **precision@τ** | confidence ≥ τ 인 값 중 정답 비율 | **자동 게시 임계값 결정에 사용** |
| coverage@τ | confidence ≥ τ 인 비율 | 임계값을 올렸을 때 잃는 양 |
| hallucination rate | 근거 없이 값을 만든 비율 | 프롬프트 품질 |

**임계값 τ 결정 규칙:**
- critical 필드: `precision@τ ≥ 0.98` 을 만족하는 가장 낮은 τ
- major/minor 필드: `precision@τ ≥ 0.90`

이 계산 결과를 threshold 리포트로 남기고, `production_ready: true`와 coverage 기준을 함께 만족할 때 운영 기본값 `scripts/crawler/src/exposure-tier.js`의 `DEFAULT_EXTRACTION_THRESHOLDS`에 반영한다.

### 3.3 완료 기준

- [x] 120건 라벨 완료
- [x] `pnpm eval:extraction` 로 실행 가능
- [x] 필드별 임계값 표가 리포트에서 산출되어 코드에 반영됨
- [x] CI에서 주 1회 실행 (회귀 감지)

---

## 4. Phase 3 — 노출 등급제 (핵심 산출물)

### 4.1 등급 정의

| 등급 | 조건 | 처리 |
|---|---|---|
| **A** | critical 필드 5개 전부 임계값 통과 + 중복 아님 + 유형 = recruit | **자동 게시.** SEO·캘린더·마감알림 전부 ON |
| **B** | critical 통과, major/minor 일부 미달 | **자동 게시.** 미달 필드만 "원문 확인 필요" 표시. SEO ON, 캘린더/알림은 deadline 신뢰도에 따름 |
| **C** | critical 중 하나라도 미달 / 포스터 아님 의심 / 중복 의심 | 검수 대기 (사람) |

### 4.2 판정 함수 — 순수 함수로 분리할 것

테스트 가능성이 중요하다. DB 접근 없이 입력→출력만 하는 함수로 만든다.

```ts
// lib/exposure/tier.ts
export type TierInput = {
  fields: Record<string, { confidence: number; value: unknown }>;
  isDuplicate: boolean;
  contentType: 'recruit' | 'news' | 'admin' | 'discard';
  hasPosterImage: boolean;
};

export type TierResult = {
  tier: 'A' | 'B' | 'C';
  reason: string[];              // 사람이 읽을 수 있는 사유 (관리자 UI 표시)
  gates: {
    seo: boolean;
    calendar: boolean;
    deadlineAlert: boolean;
    recommendation: boolean;
  };
};

export function computeTier(input: TierInput): TierResult
```

**gates 를 tier와 분리하는 이유:** B등급이라도 `deadline_date` 신뢰도가 높으면 마감 알림은 켤 수 있다.
기능별 게이트를 독립 판정하면 노출량이 눈에 띄게 늘어난다.

```ts
// 게이트 판정 예시
gates.deadlineAlert =
  fields.deadline_date?.confidence >= TH.deadline_date &&
  fields.deadline_type?.value === 'fixed';

gates.calendar = gates.deadlineAlert;

gates.seo =
  fields.host_org?.confidence >= TH.host_org &&
  fields.official_url?.confidence >= TH.official_url;

gates.recommendation =
  gates.seo && fields.category?.confidence >= TH.category;
```

### 4.3 기존 승인 게이트와의 관계

현재 관리자 승인 체크리스트(통과/경고/차단)는 **유지**한다. 등급제는 그 앞단이다.

```
크롤 → 추출 → computeTier
                 ├─ A → 자동 published (admin_actions에 'auto_approve' 기록)
                 ├─ B → 자동 published + 부분 표시
                 └─ C → review 큐 → 기존 관리자 승인 흐름
```

**자동 승인도 반드시 `admin_actions` 에 남긴다.** 사후 추적과 롤백을 위해 필수.

### 4.4 UI 반영

- **공개 상세**: minor 필드가 미달이면 그 필드만 "원문 확인 필요". 내부 등급/검증 상태는 노출 금지 (8/24 수정 유지)
- **근거 표시**: 신뢰도 높은 필드에 hover/tap 시 근거 문장 표시 → 신뢰도를 사용자에게 전달하는 장치
- **운영자 편집 화면**: 필드마다 신뢰도 배지 + 근거 문장 인라인 표시 → 6항목 체크리스트를 필드 단위로 교체
- **관리자 대시보드**: A/B/C 건수와 게이트별 활성 건수를 표시 (현재 전부 0인 카드를 여기에 연결)

### 4.5 안전장치

- `EXPOSURE_AUTO_PUBLISH` 환경변수로 자동 게시 전체 kill switch
- 최초 2주는 A등급만 자동, B는 검수 대기로 (`AUTO_PUBLISH_TIERS=A`)
- 자동 게시된 건은 목록에서 필터 가능하게 (`?auto=true`) — 사후 샘플 검수용
- 일괄 롤백 스크립트: 특정 기간 자동 게시분을 review로 되돌리기

### 4.6 완료 기준

- [x] `computeTier` + 게이트 판정 단위 테스트 (등급별·게이트별 경계값 케이스)
- [x] 554건 재판정 배치 실행 후 A/B/C 분포 리포트
- [x] 관리자 대시보드에 분포 표시
- [x] kill switch 동작 확인

---

## 5. Phase 4 — 포스터 판별 강화 (신호 앙상블)

단일 모델 판정 대신 값싼 신호를 먼저 쌓고, 애매한 것만 VLM에 넘긴다.

### 5.1 신호

```ts
// lib/poster-detection/signals.ts
export type PosterSignals = {
  aspectRatio: number;        // h/w. 포스터는 대체로 1.2~1.6 (A4≈1.41)
  megapixels: number;         // 너무 작으면 로고/썸네일
  textDensity: number;        // OCR 문자수 / 면적
  fontSizeVariance: number;   // 포스터는 큰 제목 + 작은 본문 → 분산 큼
  titleSimilarity: number;    // 게시글 제목 ↔ OCR 텍스트 의미 유사도 (0~1)
  hasDateToken: boolean;      // OCR에 날짜 패턴 존재
  hasContactToken: boolean;   // 전화/이메일/QR 존재
};
```

판정 규칙 (규칙 우선, VLM은 최후):

```
1. 즉시 제외 (VLM 호출 없음)
   - megapixels < 0.05           → 아이콘/로고
   - aspectRatio < 0.4           → 가로 배너
   - textDensity ≈ 0             → 사진/지도/장식

2. 즉시 채택 (VLM 호출 없음)
   - aspectRatio 1.2~1.6
     AND textDensity 중간 구간
     AND fontSizeVariance 높음
     AND titleSimilarity > 0.6
     AND (hasDateToken OR hasContactToken)

3. 나머지 → VLM 판정
   질문: "이 이미지가 특정 프로그램·행사의 모집/홍보 포스터입니까?
          로고, 배너, 안내 사진, 지도, 문서 스캔이면 아니오."
   출력: { is_poster: bool, kind: 'poster'|'logo'|'banner'|'photo'|'map'|'document', confidence: 0~1 }
```

**규칙으로 걸러지는 비율을 로그로 남길 것.** VLM 호출량 절감 효과를 측정해야 6장(비용)의 근거가 된다.

### 5.2 첨부파일 우선 탐색 — 노출량 증가 효과가 가장 큰 항목

공공기관 게시글은 본문에 로고만 있고 **진짜 포스터는 첨부 PDF/HWP 안에 있는 경우가 흔하다.**

```
1. 첨부파일 목록 수집 (기존 '첨부파일 후보 분석' 확장)
2. PDF: 1~2페이지를 이미지로 렌더링 (pdftoppm / pdfium)
3. HWP: hwp5 → PDF 변환 후 동일 처리 (변환 실패 시 skip, 에러로 취급하지 않음)
4. 렌더링 결과를 포스터 후보에 추가하고 5.1 신호 판정
5. 본문 이미지 후보와 점수 비교 → 높은 쪽을 대표 이미지로
```

우선순위 규칙: **첨부 렌더링 결과와 본문 이미지 점수가 비슷하면 첨부를 택한다.**
(본문 이미지는 기관 로고/배너일 확률이 높다)

### 5.3 완료 기준

- [x] 신호 추출 함수 + 단위 테스트
- [x] 골든셋 기준 포스터 판별 precision/recall 측정 (Phase 2 하네스 재사용)
- [x] VLM 호출 절감률 로그
- [x] 첨부 PDF 렌더링 파이프라인 및 실패 시 graceful skip
- [x] "이미지 없는 후보" 페이지 건수가 감소하는지 전후 비교

---

## 6. Phase 5 — 공고 유형 라우팅

반려로 끝내면 수집 비용만 쓰고 버리는 것이다. (현재 반려 40건에 "공중화장실 관리인 모집 공고" 등 포함)

```ts
type ContentType =
  | 'recruit'   // 프로그램·교육·행사·지원사업 모집  → 메인 피드
  | 'news'      // 기관 소식·보도자료               → 아카이브 (색인 O, 피드 X)
  | 'admin'     // 채용·입찰·일반 행정공고           → 아카이브 (색인 O, 피드 X)
  | 'discard';  // 중복·무의미                      → 저장만
```

- 라우팅은 **분류이지 삭제가 아니다.** `admin`/`news` 도 상세 페이지와 sitemap은 유지 → SEO 자산 보존
- 메인 피드, 추천, 마감 알림, 지역·분야 랜딩에서는 `recruit` 만 노출
- 아카이브 페이지는 `noindex` 하지 말 것 (롱테일 검색 유입원)
- 오분류 정정은 운영자 편집 화면에서 1클릭으로

---

## 7. Phase 6 — 모델 계층화 (비용)

수집 소스를 늘리기 전에 반드시 정리할 것. 지금 구조는 소스 수에 비례해 비용이 선형 증가한다.

| 단계 | 처리기 | 대상 |
|---|---|---|
| 0 | 정규식/규칙 | 날짜, 전화번호, 이메일, URL, 금액 — **LLM보다 정확하고 무료** |
| 1 | 저가 모델 | 분류(category/region/content_type), 요약 |
| 2 | 상위 모델(gpt-4o급) | 0·1단계 신뢰도가 임계값 미달인 필드만 |
| 3 | VLM | 5.1의 3번 케이스만 |

- 단계별 처리 건수·비용을 `ai_usage_log` 에 기록하고 관리자 대시보드에 일/주 단위 표시
- **골든셋으로 "저가 모델로 내려도 precision이 유지되는가"를 검증한 뒤에만 내릴 것**

---

## 8. 사용자 피드백 루프

상세 페이지에 "이 정보가 정확한가요?" — 필드 옆 작은 신고 버튼.

- 저장: `field_reports (poster_id, field_key, reporter_id, note, created_at)`
- 같은 필드에 신고 2건 이상 → 해당 필드 신뢰도 강제 0, 포스터를 검수 큐로
- 관리자 화면에 신고 많은 필드 랭킹 → 프롬프트 개선 우선순위
- 기관 담당자의 정정 요청 창구로도 사용 (기관 접촉 메일과 연결)

---

## 9. 작업 순서 요약

```
1. Phase 1  필드별 신뢰도 + 근거 스키마·프롬프트·백필     [선행 필수]
2. Phase 2  골든셋 120건 + 평가 하네스 + 임계값 산출      [Phase 3의 전제]
3. Phase 3  등급제 + 게이트 + UI + kill switch          [노출량 증가 시점]
4. Phase 4  포스터 판별 앙상블 + 첨부 PDF 렌더링
5. Phase 5  유형 라우팅
6. Phase 6  모델 계층화
7. 사용자 피드백 루프
```

**Phase 3까지 끝나면 노출 지표가 움직인다.** 4~6은 그 위에 쌓는 개선이다.

---

## 10. 지켜야 할 원칙 (변경 금지)

1. **모집기간 미확인을 "상시모집"으로 바꾸지 않는다.**
2. **모든 날짜는 Asia/Seoul 기준.**
3. **공식 원문 링크는 항상 병기하고, "신청 전 원문 확인" 안내를 유지한다.**
   틀린 마감일은 사용자에게 실제 피해를 준다. 이 서비스가 파는 것은 신뢰다.
4. **내부 검수 상태·등급을 공개 페이지에 노출하지 않는다.**
5. **실제 주최·주관 기관과 수집 출처를 구분해 표시한다.**
6. **자동 게시는 전부 `admin_actions`에 기록하고, 언제든 일괄 롤백 가능해야 한다.**
