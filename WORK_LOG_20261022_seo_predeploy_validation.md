# 2026-10-22 SEO·GEO 운영 배포 전 검증

## 판단

**`e66bb6b`의 운영 배포는 보류한다.** 빌드·기존 테스트·Preview SEO 응답은 통과했지만 새 지역 자격 규칙에서 실제 회귀를 재현했다. 모바일 찜 조작의 기존 결함과 운영 데이터 품질 잔여 항목도 확인했다. 이번 요청은 검증·보고이므로 앱 코드를 변경하거나 교정 후보를 운영에 적용하지 않았다.

## 1. Git과 검증 대상

- 시작 시 `git fetch origin`, `git status --short --branch` 실행.
- 초기 HEAD: `e66bb6bd2e46d6a18feae6d63b2148f0806c930d`. 작업 트리 clean, `feat/ai-verification-phase-1`이 origin보다 6커밋 ahead.
- 대상 커밋은 SEO·공개 조회·지역 분류·기간 표시·문서/테스트 25개 파일 변경이다.
- 기존 Vercel Preview는 `3560365`여서 이번 변경 검증에 사용할 수 없었다. 로컬 target commit에서 **Preview만 새로 배포**했다. 소스 수정 없이 검증했으며 보고서 커밋은 배포 후 별도로 생성한다.
- [검증 Preview](https://poster-link-al2p63oq0-maxmini0130s-projects.vercel.app), deployment `dpl_6MsGmLddYNmD8pFeJrrFEC8zrY41`, 최종 상태 READY, target preview.
- Vercel Deployment Protection이 있으므로 CLI가 제공하는 인증 우회 쿠키를 사용했다. 앱 회원 로그인 세션은 사용하지 않아 Supabase 공개 조회·익명 접근 조건을 유지했다. 우회 쿠키·토큰은 Git 제외 로컬 파일에만 보관하고 보고서에 포함하지 않았다.
- Production 최신 배포 URL/커밋을 전후 비교해 동일함을 확인했다. Production 커밋은 `35603652fa989a4febcd92d7e2bb5c30bb0ccaab`로 유지. Git push·운영 배포·도메인 승격 없음.

## 2. 재실행 검증

| 검증                                                         | 결과                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| Node 20.20.2 / pnpm 10.33.0 production build                 | 통과                                                        |
| `pnpm --filter web exec tsc --noEmit --pretty false`         | 통과                                                        |
| `pnpm --filter web lint`                                     | 통과                                                        |
| `pnpm test`                                                  | 65개 통과                                                   |
| `pnpm --filter posterlink-crawler test`                      | 321개 통과                                                  |
| `pnpm --dir apps/mobile typecheck`                           | 통과                                                        |
| Vercel 원격 install/build/type/lint                          | 통과, Preview READY                                         |
| Preview SEO E2E                                              | 14개 통과                                                   |
| Preview 기존 인증 화면·회원가입 입력/약관·익명 접근 제어 E2E | 15개 통과                                                   |
| Preview 홈/목록/상세 × 데스크톱 1440×1000·모바일 390×844     | 6화면 HTTP 200, H1 표시, 수평 overflow 없음, 캡처 시각 확인 |
| 추가 브라우저 검사                                           | pageerror 0, 단 모바일 상세 찜 버튼 조작 실패               |
| 추가 지역 자격 경계 사례                                     | 2건에서 잘못된 판정 확인, 아래 상세                         |

- Preview E2E는 기존 테스트를 Git 제외 `.generated/preview-validation/`에 복사하여 인증 우회 storage state를 적용했다. 회원가입/로그인 폼을 실제 제출하지 않았고 `/api/` mutation을 차단해 방문 통계 등을 쓰지 않았다.
- 기존 Browserslist 갱신 안내와 edge runtime 정적 생성 안내는 빌드를 차단하지 않았다.

## 3. Preview 실제 HTTP·SEO

| 경로                                            | HTTP 및 확인 내용                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/`                                             | 200 HTML, canonical `https://www.posterlink.kr`, 초기 모집중 275건                       |
| `/posters`                                      | 200 HTML, canonical `https://www.posterlink.kr/posters`, 실제 상세 링크                  |
| `/posters/80b6d9ef-bd51-4889-86df-30df1dccf9ce` | 200, 운영 도메인의 고유 canonical, 상세 Twitter 카드, JSON-LD 파싱 성공·Article 확인     |
| `/robots.txt`                                   | 200 text/plain, Googlebot/Bingbot/Yeti/OAI-SearchBot/ChatGPT-User 명시, GPTBot 별도 차단 |
| `/sitemap.xml`                                  | 200 application/xml, 공개 정적·분류·기관 탐색 URL                                        |
| `/sitemap-index.xml`                            | 200 XML, 정적 sitemap 및 공고 4개 조각 연결                                              |
| `/sitemaps/posters/0.xml` ~ `3.xml`             | 각각 200, 1,000 / 1,000 / 1,000 / 88 URL                                                 |

- robots의 index URL과 공고 sitemap의 모든 URL은 `https://www.posterlink.kr`를 사용한다. Preview 자체를 canonical로 만들지 않았다.
- Preview에는 Vercel이 `X-Robots-Tag: noindex`를 출력한다. 검증용 호스트가 검색에 노출되지 않도록 하는 정상적인 Preview 차단이며, 운영 배포 시에는 운영 응답에 noindex가 없는지 다시 확인해야 한다.
- 배포 보호 없이 방문하면 Vercel 인증으로 302 이동한다. 이는 Preview 플랫폼 접근 제어이며 앱의 공개 페이지 로그인 요구가 아니다. 우회 쿠키로 확인한 앱 상세는 익명 Supabase RLS로 조회됐다.
- 이번 HTTP 파싱은 JSON 문법·실제 출력 확인이다. Google Rich Results의 특수 결과 승인이나 모든 공고의 원문 사실 검증을 의미하지 않는다.

## 4. Sitemap 공개 가능성

- anon 키로 직접 조회한 공개 조건과 Preview sitemap **3,088개 ID 전체를 집합 비교**했다. 누락 0, 추가 0, 중복 0.
- 상태: published 610 / closed 2,478. 노출등급: null 2,835 / A 245 / B 8.
- review·rejected 각 1개 표본은 sitemap 제외 및 Preview 상세 404 확인. 현재 hidden/draft 데이터 표본은 없었다. 존재하지 않는 UUID 상세도 404 확인.
- closed는 공개 이력이지 삭제·비공개가 아니므로 현행 정책상 포함된다. 분할 URL의 공개 허용 조건은 만족한다.
- 다만 필드 검수 상태는 unverified 1,695 / needs_review 1,393이다. 이는 공개 승인 상태와 별도 필드이므로 전체 비공개 대상으로 임의 전환하지 않았다. **공개 허용과 내용 정확성 확정은 다르다.**
- 읽기 전용 `ai:healthcheck` 재실행은 exit 0이지만 품질 게이트 fail이다. 저신뢰 이미지 판정 1건, 마감일 교정 후보 20건을 보고했다. 교정 후보 중 published 18건이 sitemap에 포함되며 나머지 2건은 review로 제외된다. AI 후보는 확정 오류/수정 승인으로 취급하지 않았고 자동 수정하지 않았다.

## 5. 기존 회원 기능 영향

| 기능      | 확인 내용 / 한계                                                                                                                                                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 회원가입  | signup 구현 diff 없음. 이메일/비밀번호, 약관, 미동의 버튼 비활성화 및 화면 이동 통과. 실제 가입·메일 발송은 하지 않음.                                                                                                                                                                                   |
| 카카오    | login/signup/Supabase auth callback 구현 diff 없음. 버튼 클릭 시 provider kakao, redirect_to가 Preview `/auth/callback`을 가리키는 클라이언트 요청 확인. 외부 인증 요청은 중단했으므로 공급자 허용 URL·계정 인증 완료는 미검증.                                                                          |
| 네이버    | API/callback 구현 diff 없음. 시작 endpoint가 nid.naver.com으로 307, state 쿠키 생성 확인. callback은 `https://www.posterlink.kr`이다. Preview에 저장된 state 쿠키와 운영 callback의 호스트가 달라 Preview만으로 왕복 완료를 입증할 수 없다. 운영에서의 동일 호스트 경로는 이번 커밋으로 변경되지 않았다. |
| 찜        | toggleFavorite 저장/삭제 구현 diff 없음. 데스크톱 비로그인 클릭 시 로그인 필요 toast 확인. 모바일에서는 하단 내비게이션이 클릭을 가로챔. 로그인 상태의 insert/delete는 미실행.                                                                                                                           |
| 댓글      | CommentSection 및 RLS diff 없음. 익명 입력 비활성화 확인. 로그인 상태의 작성·삭제·신고 저장은 미실행.                                                                                                                                                                                                    |
| 인증·권한 | middleware, Supabase 인증 클라이언트, 스키마/RLS 변경 없음. mypage/favorites/notifications 익명 접근 제어 기존 테스트 통과.                                                                                                                                                                              |

실제 소셜 로그인 왕복과 회원 데이터 쓰기는 별도 테스트 계정·테스트 DB에서 추가 검증해야 한다. 이번 결과를 해당 기능의 end-to-end 완료로 표시하지 않는다.

## 6. 배포 전 발견 사항

### P1 — 새 지역 자격 규칙의 범위 축소 회귀

위치: `scripts/crawler/src/region-rules.js:82`~`87`.

- 입력: `신청 대상: 서울시 거주 청년. 마포구 주민 우대`.
- 이전 커밋: `REG_SEOUL`, confidence 0.9.
- e66bb6b: `REG_SEOUL_MAPO`, confidence 0.9.
- 원인: 구 이름 뒤의 주민/거주 신호를 전체 본문에서 찾은 후 서울 전체 자격 판정보다 먼저 반환한다. 우대 조건을 필수 자격으로 해석하여 신청 가능 지역을 좁힌다.
- 추가 입력: `부산광역시 중구 거주 청년`, 출처 `부산중구청`.
- 이전에도 서울 중구 키워드 오판(0.82)이 있었지만, 새 규칙은 잘못된 서울 중구 판정을 **명시적 자격 근거·0.9**로 강화한다. 서울 지역 문맥 확인 없이 동명 구를 매칭한다.
- 필요 조치: 필수 자격과 우대 조건을 분리하고 시도 문맥/부정 조건을 확인하며, 상충하는 범위는 검수 대기로 처리한다. 위 두 사례를 회귀 테스트에 추가한 뒤 크롤러·웹 검증과 Preview 재검증 필요.
- 새 수집 데이터의 신청 자격 정확성에 직접 영향을 주므로 현 커밋 그대로 운영 배포하지 않는 판단의 주된 근거다.

### P2 — 기존 모바일 상세 찜 버튼 가림

- 위치: `apps/web/app/posters/[id]/PosterDetailClient.tsx:883`, `apps/web/app/components/BottomNav.tsx:6`.
- 상세 액션 바와 BottomNav가 모두 `fixed bottom-0`이고 뒤에 렌더된 BottomNav가 위에 놓인다.
- 390×844에서 찜 버튼의 중심 위치에 실제 hit-test를 수행하면 BottomNav의 SVG가 선택된다. Playwright 실제 클릭도 `intercepts pointer events`로 실패했다. 데스크톱에서는 클릭·로그인 안내가 정상이다.
- 해당 fixed 위치와 찜 handler는 e66bb6b에서 바뀌지 않아 새 SEO 회귀는 아니지만, 모바일 기능 정상 판정은 할 수 없다.
- 필요 조치: 상세 액션 바의 bottom offset/하단 탐색 배치를 조정하고 모바일 실제 탭 검증을 추가한다.

### 데이터 검수·인증 잔여 위험

- 앞 절의 마감일 교정 후보 18개가 sitemap에 포함된다. 원문 확인 또는 불확실성을 반영한 색인 정책 결정을 거쳐야 하며 자동 교정하지 않는다.
- Preview의 카카오 callback allow-list와 네이버 호스트/state 구성을 통한 완전한 OAuth 검증은 미완료다. 운영 배포 후에만 확인하도록 미루기보다 테스트 환경에서 왕복을 검증하는 편이 안전하다.
- 기존 목록 최대 240건 로드/RPC 500건 상한, sitemap offset 분할의 갱신 시점 차이는 이전 보고서의 제한과 같다. 이번 확인에서 URL 누락·중복은 없었다.

## 7. 재개 조건과 산출물

1. P1 지역 자격 규칙 수정 및 경계 회귀 테스트 통과.
2. 모바일 찜/상세 액션 배치 수정·실제 탭 회귀 검증.
3. 마감일 교정 후보의 원문 검수 또는 명시적인 색인 정책 정리.
4. 테스트 계정/DB에서 소셜 로그인 왕복·찜/댓글 쓰기 검증으로 미검증 범위 해소.
5. 수정 커밋으로 Preview를 갱신해 SEO·권한·모바일 검증을 다시 수행. Production 배포는 별도 결정.

Git 제외 증거는 `data/results/seo-20261022/`의 `preview-verification.json`, `public-index-audit.json`, `region-edge-validation.json`, Preview 6화면 PNG, Vercel 배포/빌드 로그에 보관했다. 보호 우회 storage/cookie 파일도 같은 로컬 영역에 있으며 공유·커밋 대상이 아니다.

이번 작업의 추적 변경은 이 검증 보고서뿐이다. 앱 소스와 운영 공고/회원 데이터·DB/RLS는 변경하지 않았다.
