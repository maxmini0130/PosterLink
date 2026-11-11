# 2026-11-10 지역 연결 근거(장소/신청 자격) 채우기 — dry-run

브랜치: `data/region-basis-20261110` (main 52e683c 기준)

## 문제

- 홈은 서울에 연결된 공고를 모든 구에 보인다(PR #25). 그런데 접수 중 공고 463건은 구에만 연결돼 있고, `poster_regions.basis`(연결 근거)는 전부 비어 있다.
- 그래서 '서울특별시 권역 청년'처럼 서울 누구나 신청할 수 있는 공고도 장소인 구에서만 보인다.
- 원인: 크롤러 업로드가 기존 연결을 `ignoreDuplicates`로 건너뛰어 `basis`를 채우지 않고, 근거 분류기(`classifyRegionBasis`)는 이미 붙은 지역의 근거만 정할 뿐 '서울 누구나'일 때 서울 연결을 만들지 않는다.

## 결정

- 발행 기관이 아니라 대상 문장(대상 요약, 원문 facts.target, 본문 '대상:' 줄)으로 판정한다. 동작구가족센터 공고라도 '서울시 생활권 1인가구'면 서울 전체 대상이다.
- 판정(규칙 `region-eligibility-20261110`, 근거 문장 보존):
  - `seoul_wide`: 서울특별시 권역·거점·생활권, 서울(시) 거주·소재·재학·재직, 서울시민, 서울 청년(기관명 '서울청년센터' 등 제외) → 서울 연결 추가(`basis = eligibility`), 구 연결은 장소·기관·관련.
  - `gu_restricted`: OO구민, OO구 주민·거주·소재 → 그 구 연결에 `eligibility`. 보이는 범위는 그대로.
  - `gu_preferred`(구민 우대·우선), `open`(누구나, 제한없음): 기본으로 쓰지 않음. 대표 결정 뒤 `--kinds`로.
  - `review`(구 조건과 '누구나'가 함께, '구민·지역주민 누구나'), `unknown`(지역 언급 없음): 바꾸지 않고 사람 검수 목록.
- 이미 채워진 `basis`는 덮어쓰지 않는다. 쓰기는 백업 파일을 남기고, `--rollback`으로 되돌린다.

## 변경

- `scripts/crawler/src/region-eligibility.js`(새), 테스트 12건.
- `scripts/crawler/src/region-basis-backfill.js`(새), 테스트 5건: `--snapshot` 오프라인 dry-run, 실시간 dry-run, `--apply --confirm=REGION_BASIS_BACKFILL`, `--rollback`.

## dry-run (운영 DB 읽기 전용 스냅샷, 11-10 21:18 KST)

- 접수 중 635건 중 구에만 연결 463건.
- 판정: unknown 351, open 34, seoul_wide 28, gu_restricted 31, gu_preferred 8, review 11.
- 기본 적용(seoul_wide + gu_restricted) 59건: 서울 연결 추가 28, `basis` 설정 eligibility 31·venue 23·institution 4·related 6.
- 서울시·산하기관(서울청년센터 등) 66건: seoul_wide 15, gu_preferred 4, open 10, gu_restricted 1, review 1, unknown 36(대상 문장에 지역 언급 없음).
- 적용 시 구별 홈 목록 증가: 마포구 +26, 강북구·종로구·노원구 +28, 강남구 +26.
- 실시간 조회 경로(공개 키, 읽기만)도 같은 결과(635 → 463 → 59).
- 서울 전체 28건과 구 주민 한정 31건은 근거 문장을 전부 눈으로 확인했다. 첫 실행에서 '청년 및 은평구민 누구나'를 구 주민 한정으로 본 오판을 고쳐 review로 보냈다.

## 운영 적용 (11-10 21:21 KST, 대표 승인 뒤 대표가 실행)

- `--kinds=seoul_wide,gu_restricted`(기본), 범위 전체. 93개 쓰기 모두 성공: 서울 연결 추가 28, `basis` 65(eligibility 31, venue 23, related 7, institution 4).
- 백업: `data/results/region-basis-backup-2026-11-10T12-21-49-421Z.json`.
- 확인(읽기 전용): `poster_regions`에서 서울·eligibility 28, 구 연결 basis 65. 구에만 연결된 접수 중 공고 463 → 435.
- 운영 홈(쓰기 차단 브라우저): 마포구 92 → 109건. 서울 연결이 생긴 26건 중 홈 조건(마감일 확인 상태, 행사 종료 여부 등)을 통과한 17건이 늘었다. 서울 전체 245건, 부산 전체 33건은 그대로.
- 되돌리기: `node src/region-basis-backfill.js --rollback=data/results/region-basis-backup-2026-11-10T12-21-49-421Z.json --apply --confirm=REGION_BASIS_BACKFILL`

## 크롤러 연결 (대표 지시 11-10)

- `buildCardFacts`가 판정을 계산하고 `applyRegionEligibility`로 지역 근거를 정한다. 판정은 `field_verification.cardFacts.regionEligibility`(종류, 구, 근거 문장, 규칙 버전)에 남는다.
  - 서울 전체·구 우대(구 우대는 대표 승인): 서울 연결 추가(`eligibility`).
  - 구 주민 한정: 그 구 연결만 `eligibility`.
  - 그 밖(애매함 포함): 서울 연결을 추가하지 않고, 키워드 분류기가 붙인 구 `eligibility`는 '없음'(`related`)으로 내려 검수 대상으로 남긴다. 장소·기관 근거는 그대로.
- 업로드(`assignPosterRegions`): 추가된 서울 연결을 저장하고, 이미 있는 연결의 비어 있는 근거를 채운다(채워진 값은 덮어쓰지 않음). 전에는 `ignoreDuplicates` 때문에 기존 연결의 근거가 채워지지 않았다.
- 크롤러 테스트 419건 통과(새 테스트: 크롤러 연결 2, 구 우대 이름 1, 판정 기록 1).

## 구 우대 8건 dry-run (읽기 전용 스냅샷 2, 11-10)

- `--kinds=gu_preferred`: 8건 모두 서울 연결 추가, 판정 기록 8, 구 연결 근거 venue 6·institution 2·related 1.
- 우대 구: 마포구·서대문구, 용산구 2건, 강북구, 강동구·송파구 2건('강동·송파 생활권'을 실제 구 이름으로 인식), 송파구, 종로구.
- 화면의 '○○구 거주·생활권 우대'는 이 판정 기록을 읽는다(웹 브랜치 `fix/home-region-eligibility-20261110`).

## 검수 목록

- `docs/REGION_BASIS_REVIEW_20261110.md`: 근거 '없음' 연결 7개(공고 6건), 애매한 공고 11건, 지역 언급 없음 351건 안내.

## 남은 작업

- 구 우대 8건 운영 적용(대표 실행).
- open 34건: 장소인 구에만 둠(11-10 결정).
- unknown 351건(서울시 산하 36건 포함): 원문에서 대상 문장을 다시 추출해야 판정 가능.
- 검수 목록 A·B를 사람이 확인.
