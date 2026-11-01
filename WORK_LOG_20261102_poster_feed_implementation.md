# 포스터 피드 구현 (2026-11-02)

상태: 구현 완료·독립 검토 대기 — 구현 Codex. 기준 46e20e3, 브랜치 feat/poster-feed-20261102, 작업 폴더 C:\Maxmini_Project\PosterLink-poster-feed. 사용자 1번 조사 확인 후 2~5번 구현. 운영 DB 쓰기·마이그레이션 적용·백필·배포·push 금지.

1번 조사: WORK_LOG_20261102_poster_feed_image_audit.md. 공개 597건 중 치수 부적합 8건, 미확인 2건. 원본 전체 대량 다운로드·신규 저장소 사본 생성은 하지 않는다.

## 진행

- 시안 DefaultPoster·FeedFirst·FeedHome·PcFeed와 최신 지시서를 작업 브랜치에 복사(원본 메인 폴더 미커밋 파일 보존).
- 분야 8색·아이콘·5줄 명조 제목 기본 이미지와 같은 구성의 서버 PNG. Noto Serif KR 700 폰트는 OFL 라이선스와 함께 서브셋 WOFF로 포함.
- 마이그레이션은 파일만 작성. 기존 width/height를 유지하고 image_width/image_height/image_status 추가. 운영 미적용 시 호환 읽기·저장 경로 유지.
- 공개 이미지 헤더 메타데이터 조회는 읽기만 하며 URL을 해당 공개 공고의 이미지와 대조. 외부 사본 없는 이미지는 원본 핫링크 대신 기본 이미지.
- 홈 3:4 피드 2/3/4열, 탭, 인라인 관심 안내, 찜, 8개씩 추가, 기관/대상 지역 표시. 최초 관심 화면 강제 이동 제거.
- 로컬 전용 NEXT_PUBLIC_LOCAL_READ_ONLY=1: 분석 수집과 계정 연계 실행을 끄고 브라우저의 운영 쓰기 요청 차단. 운영 환경에는 이 설정을 적용하지 않음.

## 검증

- Node 20.20.2에서 최종 전체 단위/SQL/API 테스트 309건 중 307건 통과. 기존 profile-role-release의 릴리스 스냅샷 2건 실패는 남아 있다. 명령은 package.json의 동일한 전체 파일 목록에 `pnpm --package=node@20 dlx node node_modules/tsx/dist/cli.mjs --test --test-concurrency=2`를 적용했다.
- 최초 Node 24 실행 305건 중 303건 통과(새 API 검사 추가 전). 반복 실행 중에는 profile-role PGlite 검사 프로세스가 V8 native `jit_page_->allocations_.erase(addr)` 오류로 종료해 일부 검사가 누락됐다. 이를 제품 테스트 통과로 세지 않고 지정 런타임 Node 20으로 전체를 다시 실행했다.
- 새 이미지 정책·SQL·API·메타데이터 투영 검사 10건, 크롤러 새 검사 2건 통과. 외부 호스트/다른 공고의 이미지 차단, Range 512KiB/리디렉션 차단, 중복 요청·캐시, 미확인/저신뢰 판정 보존, 기존 RLS·데이터 보존을 포함한다.
- 크롤러 전체 328/328 통과. 웹 lint 경고 없음, tsc·build 통과. 의존성 및 잠금 파일 변경 없음. Node 20 실행기는 저장소 밖 pnpm 임시 패키지다.
- 최종 전체 화면 검사: 29건 통과, 상세용 공고 ID 미지정 2건 건너뜀(31건). 홈·내 공고·상세·관심 선택·가짜 가입 연결·바텀시트 접근성 및 6폭 피드를 포함한다. 키보드 탭 전환도 통과. 가짜 계정과 쓰기 응답만 사용했으며 실제 카카오/네이버 인증 검증은 아니다.
- 로컬 공개 읽기 빌드의 6개 폭에서 가로 넘침 0, CLS 0.00013~0.00207. 첫 4개 priority, 나머지 4개 lazy 확인. 360 AVIF 응답 및 별도 540 WebP(92,642B), 720 AVIF(131,879B) 200 응답 확인. 변환 요청마다 외부 사본을 새로 저장하지 않는다.
- 느린 4G(1.6Mbps down/750Kbps up/150ms/CPU 4배/DPR2) 최초 측정은 LCP 13.71~14.10초로 계획의 2.5초 목표 미달. CLS는 0.00008 미만이었다. 분류 1개를 읽으려고 검수 JSON 전체를 내려받던 부분을 scalar projection으로 바꾸고, 목록별 중복 메타데이터 요청을 공고당 한 번으로 합쳤다. 모바일 실제 카드 폭에 맞게 sizes를 보정하고 우선 로딩 2장·나머지 lazy, 카드 상세 선행 가져오기 제거. 이 최적화 이후 측정은 후속 기록에 남긴다. 목표를 달성했다고 간주하지 않는다.
- 로컬 헤더 조사 파일만 입력한 dry-run: ok 587, unsuitable 8, uninspected 2, missing/broken 0. 운영 조회·백필을 추가하지 않고 기존 조사 결과를 재현했다. `audit-feed-images.js`는 DB 클라이언트·apply 모드가 없다.
- 기본 이미지 PNG `/posters/<공개 ID>/poster-image` 900×1200, 200 image/png 확인. Windows Next 14의 Node 이미지 런타임 기본 폰트 URL 오류를 피하도록 이 경로는 edge runtime이다. 같은 색·아이콘·줄 나누기를 SVG와 PNG가 공유한다. 생성 PNG를 직접 열어 제목·기관/브랜드 겹침이 없음을 확인했다.

## UI 문서 6장 3단계 대조

| 항목                                   | 결과                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3:4·contain·긴 이미지 전체 보기        | 통과. 비율 1.9 초과 가로 이미지는 부적합 기본 이미지, 1.9 이하 가로형은 contain 여백. 세로/가로 2 초과만 상단 crop.                               |
| 이미지 없는 카드 0                     | 없음/부적합/HTTP 실패와 onerror 대체 확인. 새 수집에서 치수는 있으나 판정을 보류한 경우도 기본 이미지 유지. 기존 미확인 2건을 ok로 저장하지 않음. |
| 390px 첫 화면 약 4장·1280px 4열        | 통과. 360/390/430 2열, 768 3열, 1280/1440 4열.                                                                                                    |
| 최초 자동 이동 제거·넷째 카드 뒤 안내  | 통과. 7일 닫기, 새로고침 유지, 조건 직접 선택·건너뛰기 검사. 공고 4개 미만이면 마지막 카드 뒤 안내.                                               |
| 비회원 방문 이후 없음·수집 출처명 없음 | 통과. 홈·찾기·내 공고의 org는 organizer_name만 사용. 없으면 출처로 채우지 않음.                                                                   |
| 변환본·CLS                             | 위 측정 통과. 모바일 4G LCP는 아래 별도 측정 기록으로 구분.                                                                                       |
| 홈 세 상태                             | 비회원 기본 탭/회원 새 공고/새 공고 없음(마감 기본) 검사 통과. 새 공고 0 탭 숨김.                                                                 |
| 기준 시각 유지                         | 회원 새로고침 검사와 기존 visitBaseline/visitClock 회귀 통과.                                                                                     |
| 빈 섹션·안내                           | 보조 열/구독 안내는 새 C항에 따라 제거. 빈 관심 결과에는 조건 변경·찾기 링크.                                                                     |
| 찾기 범위 묶음                         | 기존 지역/시·도/전국 분리 브라우저·단위 회귀 통과. 이미지 컴포넌트만 공용화.                                                                      |

## 캡처와 측정 파일 (로컬, Git 제외)

`apps/web/playwright-report/poster-feed/`에 `home-360.png`, `home-390.png`, `home-430.png`, `home-768.png`, `home-1280.png`, `home-1440.png`, 같은 폭의 `mixed-*.png`가 있다. mixed는 기본 이미지·가로형 contain·부적합 가로 배너·아주 긴 이미지 fixture다. HTTP 404/이미지 오류 대체도 검사했다.

- 실제 공개 읽기 측정: `apps/web/playwright-report/poster-feed/measurements.json`.
- 생성 PNG: `data/results/poster-feed/default-generated.png`.
- 오프라인 판정: `data/results/poster-feed/offline-audit.json`.
- 포맷/폭 검증: `data/results/poster-feed/transforms.json`.
- 로컬 4G 측정: `apps/web/playwright-report/poster-feed/mobile-4g.json` (결과는 후속 기록).

## 변경 파일 범위

- 공용 이미지: packages/lib/posterImagePolicy.cjs, web/lib의 defaultPoster·feedImages·posterImageMetadata, DefaultPoster·PosterArt·FeedCard 및 글꼴/라이선스.
- 읽기 경로: poster-image-meta API, poster-image PNG 경로, 공개 발견/찾기/내 공고 메타데이터 연결 및 OG 선택.
- 화면: HomeClient, 홈 데이터, Header, 공용 카드, globals.css. 기존 방문/관심/찜 저장 도구 재사용.
- 크롤러: poster-feed-images.js, storage-cleanup.js, upload-to-supabase.js. 신규 컬럼 미적용 DB는 기존 width/height 삽입으로 호환.
- SQL: `supabase/migrations/20261102020000_add_poster_image_feed_metadata.sql` 파일만 작성. PGlite 가짜 DB에서만 적용.
- 검사/문서: 새 단위·API·SQL·크롤러·6폭 E2E, 기존 E2E의 옛 자동 이동/보조 열 기대 변경, 지시서·시안·작업 기록. 분리 E2E 빌드는 NEXT_BUILD_DIR=.next-e2e 사용.

## 실행하지 않은 것과 제한

- 운영 DB 쓰기·운영 마이그레이션·백필·원본 대량 수집·Storage 사본 생성·push·PR·배포·Promote 없음. SQL 파일 작성과 PGlite 적용을 운영 적용으로 해석하지 않는다.
- 외부 URL 8건은 승인 없이 사본을 만들거나 직접 목록 핫링크하지 않고 기본 이미지로 표시한다. 기존 AI 포스터 판정의 의미 정확도를 이번 작업으로 전수 재검증했다고 주장하지 않는다.
- 동일 게시일·동일 조건 안에서만 섞는다. 실제 이미지 수가 부족하거나 해당 구간이 전부 기본 이미지이면 3장 연속을 완전히 막기 위해 다른 날짜로 옮기거나 공고를 버리지는 않는다.
- 이전 검토 c5be223의 P2-4(다중 분류 전체 건수 상한), P2-5(최초 상세 재진입의 뒤로 가기)는 이번 피드 작업에서 해결한 것으로 간주하지 않는다.
- 실제 인증 왕복·운영 지표·스테이징/배포 성능은 미검증이다. 로컬 구현 검증과 운영 재개 승인은 별개다.
