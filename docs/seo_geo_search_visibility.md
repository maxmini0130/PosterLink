# SEO·GEO 검색 노출 구조와 운영 확인

## 분석 기준

- 2026-10-22, `feat/ai-verification-phase-1`의 로컬 코드 기준. 시작 시 fetch 완료, 작업 트리 깨끗함, origin보다 기존 5커밋 앞섬.
- 실제 의존성은 Next.js 14.2.0, React 18이다. 요청에 적힌 16/19로 업그레이드하지 않았다.
- DB 스키마·RLS·인증·댓글·찜의 쓰기 구현은 변경하지 않았다. 배포·마이그레이션·공고 데이터 교정은 수행하지 않았다.

## 기존 구현과 확인한 원인

| 항목      | 기존 상태 / 판단                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 렌더링    | 홈, 목록, 공고 상세, 지역·분야·기관 페이지는 `force-dynamic` SSR. Client Component도 초기 HTML을 서버에서 출력한다. 홈 피드 자체는 브라우저 조회, 홈 탐색 링크는 서버 조회. 공개 공고 경로에 SSG/ISR은 사용하지 않음. 약관·개인정보·로그인 화면 등은 정적 생성. |
| 상세 SEO  | 동적 제목·요약 description·canonical·OG·Article 및 검증된 Event JSON-LD가 이미 존재. 핵심 사실, 공식 링크, 정보 확인일 표시도 존재.                                                                                                                             |
| robots    | 일반 검색 허용, 관리자·운영자·API 등 차단. 검색용 AI와 학습 크롤러의 구분은 없었음.                                                                                                                                                                             |
| sitemap   | 모집중 검색 RPC 최대 500건과 일부 evidence 조회에 의존. 최종 모집중 필터로 마감·예정 공고 누락. 근거 없는 지역·분야 조합 fallback 및 매번 현재 시각의 lastmod 사용.                                                                                             |
| 홈 0건    | 초기 상태가 모두 0이고 통계는 hydration 후 API 요청. 조회 오류도 0으로 치환하고 서비스 역할 키에 의존. 실제 DB 모집중 count/search는 각각 275건으로 일치.                                                                                                       |
| 지역 검색 | 서버와 브라우저의 계층 범위 계산이 달라 전국 자격 포함 여부가 달랐음. 구 검색은 해당 구+상위 시도+전국 자격을 포함하는 기존 브라우저 정책 유지. 다른 구 기관에서 게시해도 자격이 전국/서울 전체이면 유효한 결과임.                                              |
| 지역 수집 | 출처·기관·교육 장소 키워드가 지역 후보로 사용됨. 기존 서울 전체 자격 우선 규칙에 구 단위 명시적 자격을 보강할 필요가 있음. 기관 소재지를 신청 자격으로 간주하면 안 됨.                                                                                          |
| 접수 상태 | DB는 실제 timestamp로 모집 시작/종료를 판정하지만 화면은 서울 날짜만 비교하여 같은 날 마감 시각 이후에도 접수중 표시.                                                                                                                                           |
| 원문/주관 | 대표 신청 링크가 공식 원문 메타데이터로 사용될 수 있었고, 수집 기관이 JSON-LD 발행자·행사 주관기관으로 쓰일 수 있었음.                                                                                                                                          |
| 중복      | 기존 수집기는 source key, 정규화 URL, 공고 후보·이미지 비교 및 검수 처리가 이미 존재. 제목 유사성만으로 공개 공고를 합치거나 삭제하지 않음. 상세의 완전히 같은 label/text 반복만 표시에서 제거.                                                                 |
| DB·캐시   | 공개 검색 RPC는 SECURITY INVOKER, anon/authenticated 실행 권한. RLS는 공개 published/closed와 노출등급 null/A/B, 소유자·관리자 예외. 공개 읽기에 서비스 역할 우회가 불필요. Next 개발 로그에서 대형 검수 원본의 Data Cache 2MB 초과도 관찰.                     |
| Vercel    | 서울 icn1, 기존 install/build 설정 유지. 공개 페이지를 로그인 없이 읽을 수 있음. Vercel 프로젝트의 WAF/Bot Protection 등 대시보드 설정은 로컬 코드만으로 확인 불가.                                                                                             |

## 변경 후 노출 구조

1. `robots.txt`는 Googlebot, Bingbot, Naver Yeti, OAI-SearchBot, ChatGPT-User 및 일반 크롤러에 같은 공개 접근 규칙을 명시한다. **GPTBot은 별도 그룹에서 차단**한다. 학습 접근을 허용할 경우 해당 그룹만 별도 변경하면 된다.
2. robots의 sitemap 주소는 `/sitemap-index.xml`이다. 기존 `/sitemap.xml`은 정적·지역·분야·실제 공고에서 얻은 조합·공개 기관 URL을 제공한다. 추측한 조합은 만들지 않는다.
3. `/sitemaps/posters/0.xml`, `1.xml` 등은 각각 최대 1,000건이다. 검색 RPC의 500건 상한과 무관하게 anon RLS에서 읽히는 published/closed, 노출등급 null/A/B 공고를 포함한다. 접수 마감은 비공개·삭제와 다르므로 공개 기록을 유지한다.
4. ID 정렬/range로 분할하고 각 URL은 UUID canonical을 사용한다. 감사 시점 4개 조각, 총 3,088개 공고 URL. count 조회 1회, 각 조각 조회 1회. DB 오류는 빈 정상 sitemap 대신 503, 잘못된 조각은 404를 반환한다.
5. 조각과 index에는 CDN `s-maxage=300`을 적용한다. 공개 상태 변경의 sitemap 반영에는 최대 약 5분의 캐시 지연이 있다. 상세 페이지 접근은 기존 RLS를 따른다. 조각 간 갱신 시점 차이는 다음 재생성으로 수렴하며, 현재 분할은 ID offset 기준이다.
6. 상세 메타데이터와 본문의 DB 조회를 요청 내 React cache로 공유한다. Twitter 카드에는 상세 제목·description·공고 이미지를 지정한다. JSON-LD의 `<`를 이스케이프한다.
7. 공식 원문은 `official_notice`만 사용한다. 신청 URL은 신청 동작에 유지한다. JSON-LD는 PosterLink 발행자, 수집 기관의 원문, 검증된 실제 주관기관을 분리하고 원문을 `citation`으로 연결한다. 행사 시작·장소가 검증되고 종료가 역전되지 않을 때만 Event를 추가한다. 채용/지원사업을 임의로 JobPosting 등으로 변환하지 않는다.
8. 홈 통계는 공개 키·RLS로 서버에서 조회해 초기 HTML에도 출력한다. 조회 실패는 null/확인 중으로 표시하고 실제 0과 구분한다. 홈과 공개 검색의 upstream fetch는 명시적으로 no-store로 하여 오래된 기간·건수 캐시를 방지한다.
9. 목록은 대형 field_verification 전체 대신 주분류 코드만 DB에서 투영한다. 동일 240건 응답에서 약 1,694,862 → 283,038 bytes로 감소했다. 원본 검수 자료는 DB에 그대로 보존한다.
10. 서버·브라우저가 같은 지역 범위 helper를 사용하고 상세에는 연결된 신청 지역 전체를 출력한다. 수집에서는 명시된 구 거주/주민/구민/재학/재직 자격을 다른 기관·장소보다 우선한다. 주민센터·구민회관·단순 소재 장소를 자격 근거로 승격하지 않는다. 원문에 자격이 없는 기존 키워드 후보는 기존 검수 경로에 남는다.
11. 접수 상태는 실제 시작·종료 시각을 비교하고 D-day는 Asia/Seoul로 계산한다. 기간 미확인은 상시로 바꾸지 않는다.
12. 검색어·정렬·마감 포함 URL에는 noindex/follow를 지정하고 지역·분야 canonical은 기존 전용 랜딩을 유지한다. 상세에서 같은 지역·분야 목록으로 연결한다. 랜딩의 건수는 로드된 48개 대신 정확한 totalCount를 사용한다.

## 검증

- Node **20.20.2** / pnpm **10.33.0**에서 production build 통과. 웹 lint 및 build의 타입 검사 통과. 별도 웹 `tsc --noEmit`도 통과.
- `pnpm test`: **65개 통과**. 날짜 시각 경계, 지역 계층, XML 이스케이프, 검증되지 않은 구조화 데이터 배제 포함.
- `pnpm --filter posterlink-crawler test`: **321개 통과**. 구 자격과 출처·장소 충돌 회귀 포함.
- `pnpm --dir apps/mobile typecheck`: 통과.
- 공개 SEO E2E: 개발 서버 **14개 통과**, Node 20 production 서버 **14개 통과**.
- 모바일 390×844, 데스크톱 1440×1000 홈·상세 캡처 및 가로 넘침 검사 통과. 캡처: Git 제외 `data/results/seo-20261022/`.
- 공개 count/search 직접 읽기: anon/service 모두 **275건**. 키·비밀값은 기록하지 않음.
- `ai:healthcheck`: 읽기 전용 실행 성공(exit 0)이지만 **품질 게이트 fail**. 저신뢰 이미지 판정 1건, 필드 교정 후보 20건. 공개 비포스터 후보 0건, 신청 폼 source key 0건. 자동 교정·승인·삭제하지 않음.
- 초기 기존 브라우저 E2E에서 자동 방문 로그 POST가 발생한 것을 확인했다. 이후 SEO E2E에는 API mutation 차단을 추가했고 최종 실행·화면 검증은 POST를 차단한다. 공고·회원·찜·댓글 데이터의 쓰기 테스트는 하지 않았다.

## 배포 후 확인

- 자동 배포하지 않는다. 사용자 배포 후 `NEXT_PUBLIC_APP_URL=https://www.posterlink.kr`, 공개 Supabase 키, apex→www/HTTPS 리디렉션을 확인한다. 로컬 canonical은 환경설정대로 localhost이다.
- robots/index/모든 sitemap 조각이 로그인·챌린지 없이 200인지, 비공개·검수 공고는 익명 상세에서 404인지 확인한다. 상태 변경 후 CDN TTL도 고려한다.
- Google Search Console, Naver Search Advisor, Bing Webmaster Tools에 **새 index URL**을 제출하고 기존 sitemap 제출도 유지할 수 있다. 소유 확인은 각 계정에서 진행한다.
- URL 검사와 Rich Results Test로 초기 HTML, 고유 canonical, title/description, JSON-LD를 확인한다. 일반 Article이 검색의 특수 결과를 보장하지는 않는다.
- Vercel WAF/Bot Protection 및 실제 접근 로그에서 OAI-SearchBot·Googlebot·Bingbot·Yeti가 차단되지 않는지 확인한다. User-Agent 문자열만으로 진짜 봇을 인증하지 않는다.
- 로그인·회원가입·OAuth·찜·댓글의 실제 쓰기 회귀는 테스트 계정과 별도 테스트 DB로 실행한다. 이번 검증은 공개 읽기 및 화면 중심이다.

## 추가 개선과 제한

- 기존 54개 검수 대기, 건강검사 교정 후보 및 지역 오분류 레코드는 원문 자격 근거를 대조한 별도 검수 대상이다. 이번 새 수집 규칙은 기존 데이터를 소급 변경하지 않는다.
- 복수 출처의 실제 동일 공고는 기존 중복 검출기로 검수한다. source URL이 같다는 이유로 기존 공개 공고를 대량 병합하지 않았다.
- 상세의 핵심 사실과 본문이 의미상 반복되는 부분은 원문 정보를 잃지 않도록 유지한다. 완전히 같은 파싱 행만 제거한다.
- 목록은 기존 최대 240건 로드/브라우저 더보기 및 RPC 500건 상한을 유지한다. 공개 공고 전체의 검색엔진 발견은 분할 sitemap으로 보완했다. 진정한 서버 페이지네이션은 안정적인 cursor RPC·인덱스 설계를 포함한 별도 DB 변경이 필요하다.
- 기관/분류 수가 수만 단위가 되면 정적 URL sitemap도 분할하고, 공고가 매우 많아지면 offset 대신 안정적인 keyset 경계 또는 sitemap 스냅샷을 검토한다.
- 검색 등록·AI 인용 여부·순위 상승은 이번 로컬 검증으로 확인할 수 없다. 배포 후 수집/색인/클릭 데이터를 관찰해야 한다.

## 근거 문서

- [Google sitemap 작성 및 크기 제한](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google sitemap index](https://developers.google.com/search/docs/crawling-indexing/sitemaps/large-sitemaps)
- [Google noindex 규칙](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
