# SEO·GEO 운영 배포 최종 승인 점검 — 2026-10-22

## 판정

**조건부 배포 가능.** `3026020`까지의 기능 변경을 기준으로 공개 이용자에게 영향을 주는 미해결 차단 결함은 이번 점검에서 발견하지 못했다. 잔여 AI 경고 3건은 아래 근거로 이번 SEO·GEO 배포의 승인 가능한 예외로 분류한다. 전체 AI 품질 게이트는 여전히 FAIL이며 기준·경고·데이터를 변경하지 않았다.

조건은 실계정 OAuth 및 회원 쓰기 기능의 미검증 범위를 명시적으로 수용하고, 배포 후 승인된 테스트 계정으로 회원가입·카카오/네이버 로그인·찜·댓글 저장을 확인하는 것이다. 이 확인을 배포 전 필수로 요구하는 승인 절차라면 해당 확인 전까지 보류한다. 이번 점검에서는 사용자 계정 사용·운영 DB 테스트 쓰기·운영 배포·Git push를 하지 않았다.

## 잔여 AI 품질 경고와 노출

읽기 전용 `pnpm --filter posterlink-crawler ai:healthcheck` 재실행: exit 0, 품질 게이트 FAIL. field_correction_candidates=2, image_ai_low_confidence_count=1, public nonposter=0. exit 0을 품질 통과로 해석하지 않는다.

| ID                                     | 공고 / 상태                                                             | 공개 노출 확인                                                                                                                                                   | 승인 예외 근거                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `63952b5b-2c98-42f1-8be4-acb7ee1dede2` | 도봉기적의도서관 재생지 북바인딩·북퍼퓸 / review, exposure null         | 익명 DB 조회 0건, 검색 RPC 미포함, 제목 검색 링크 없음, Sitemap 미포함, 상세 HTTP 404, 점검 목록·광고 링크 없음                                                  | 검수 대기 비공개 후보. 공개 사용자 영향이 없으며 검수 경고는 유지                                                                                                   |
| `70040810-4f9b-42e4-b2dd-fbf40ef41e73` | 서울시공익활동지원센터 활동가 석사과정 장학지원 / review, exposure null | 위와 동일                                                                                                                                                        | 검수 대기 비공개 후보. 공개 사용자 영향이 없으며 검수 경고는 유지                                                                                                   |
| `43cbe4d2-107f-4c5b-a01e-1340b1bf6717` | 서초구 2026 서초 웰니스 펫스타 / published, exposure null               | 익명 조회 가능, 일반·서초 지역 검색 RPC 및 제목 검색에 포함, Sitemap 포함, 상세 HTTP 200. 현재 모집중 기본 목록·서초 목록/행사 목록·강서 광고 랜딩 링크에는 없음 | 실제 낮은 AI 점수가 아니라 수동 시각 검수 기록의 confidence 미기입을 검사기가 0으로 계산. 수동 검수 근거와 현재 실제 포스터·공식 재게시 내용이 일치하므로 승인 예외 |

이미지 경고는 공개 공고이므로 단순히 비공개라는 이유로 제외하지 않았다. 현재 대표 이미지를 다운로드하여 직접 확인했다. 행사명, 2026.10.31 13:00~17:00, 서초문화예술공원 잔디광장, 주최 서초구·주관 THE ABLE DOG가 일치한다. [공식 재게시 원문](https://youth.seoul.go.kr/infoData/sprtInfo/view.do?key=2309130006&sprtInfoId=74966)은 HTTP 200이며 행사명·2026년·10/31·13:00~17:00을 다시 확인했다. 기존 `WORK_LOG_20261018_direct_source_review.md`와 수동 검수의 source=`codex-visual-inspection`, checkedAt 및 판정 근거를 대조했다. confidence를 임의 추가하거나 경고를 삭제하지 않았다.

실제 HTTP 확인은 최신 Preview에서 수행했다. 점검 경로는 `/posters`, 제목 검색, `/regions/seoul-seocho`, `/regions/seoul-seocho/event-recruit`, 광고 랜딩 `/regions/seoul-gangseo/event-recruit`, sitemap index의 전체 공고 shard 및 각 상세 URL이다. 두 review 공고는 익명 RLS와 공개 검색 상태 조건으로 모든 지역의 공개 결과에서도 제외된다. 펫스타의 행사 시작 전 기본 목록 제외는 기존 신청기간 필터이며, 공개 제목 검색과 보관 색인은 허용된다. 광고 게이트가 적용된 현재 랜딩에 노출되지 않는다.

## 로그인·회원·RLS

- 운영 SHA `35603652fa989a4febcd92d7e2bb5c30bb0ccaab`과 HEAD를 비교했다. 로그인/회원가입 화면, `/auth/callback`, 네이버 시작·콜백 API, Supabase 클라이언트, middleware, `CommentSection`, `siteUrl`, DB migrations에 변경이 없다.
- 찜 상세 버튼 변경은 접근성 이름·배치이며, 로그인 확인·현재 user.id 사용·favorites insert/delete 함수는 변경하지 않았다. 댓글도 현재 user.id로 insert하고 기존 오류 처리를 유지한다. 브라우저 경로에서 서비스 역할 키를 새로 도입하지 않았다.
- 저장소 RLS는 favorites의 `auth.uid() = user_id`, comments INSERT의 동일 조건을 유지한다. 두 review 공고의 익명 읽기 차단을 실제 확인했다. 원격 DB의 전체 RLS 정의를 관리 SQL로 재추출한 것은 아니므로 외부에서 별도로 바뀐 모든 정책까지 보증하지 않는다.
- Supabase 공개 Auth settings HTTP 200: email=true, kakao=true, disable_signup=false.
- 카카오 클라이언트 redirectTo는 현재 origin의 `/auth/callback`. Supabase를 경유하는 기존 흐름이다. 공급자 측 콜백은 Supabase Auth callback이며, Kakao Developers 콘솔의 허용 URI와 Supabase의 전체 redirect allowlist는 직접 확인하지 못했다.
- 네이버 시작 API를 redirect 자동 추적 없이 GET 했다. 운영·Preview 모두 HTTP 307 → nid.naver.com, redirect_uri=`https://www.posterlink.kr/api/auth/naver/callback`. 설정 누락 오류가 없었다. Preview의 네이버 흐름도 운영 콜백을 사용하므로 독립 Preview 로그인 성공 검증으로 취급하지 않는다. Naver Developers 콘솔 등록 목록은 미검증이다.
- 이전 production 공개 회귀 92개와 모바일 6개, Preview 20개 통과 기록을 다시 읽었다. 회원가입/로그인 화면, 비로그인 찜 안내·댓글 비활성화, 모바일 실제 버튼 클릭을 검증했다. 기존 테스트가 실제 OAuth 완료·이메일 가입 완료·로그인 후 찜/댓글 저장 성공까지 보장하지 않는다. 이 경로들은 **미검증**이다.

## 운영 / Preview 영향 비교

| 구분                        | 확인 결과                                                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 운영                        | `poster-link-hz99ep95e-maxmini0130s-projects.vercel.app`, READY, SHA `35603652fa989a4febcd92d7e2bb5c30bb0ccaab`                                                                                                                                                                                      |
| 최신 점검 Preview           | `poster-link-8vut9chai-maxmini0130s-projects.vercel.app`, READY. `3026020`에 커밋된 기능 변경을 배포한 Preview. 배포 후 기능 코드 수정 없음                                                                                                                                                          |
| 코드 차이                   | 홈 집계·공개 탐색/기간·메타데이터/SSR/JSON-LD·robots/sitemap 분할·지역 추론·모바일 Safe Area·광고 게이트. 수동 원문 검수 스크립트/로그도 포함되지만 웹 build는 이 스크립트들을 apply하지 않음                                                                                                        |
| 스키마 / 의존성 / 배포 설정 | 운영 대비 migrations·package manifest·lockfile·Vercel 설정 변경 없음. 새 migration 적용 불필요                                                                                                                                                                                                       |
| Supabase 연결               | 현재 production/preview의 공개 URL·publishable key가 동일. 같은 프로젝트를 사용하므로 데이터·Auth 설정도 공유                                                                                                                                                                                        |
| 인증 환경변수               | NAVER_CLIENT_ID/SECRET, NEXT_PUBLIC_APP_URL, SERVICE_ROLE_KEY는 production/preview를 함께 대상으로 하는 동일 환경변수 레코드. 관련 업데이트 시각은 두 배포 생성 이전. 분기별 override 없음. 민감값 자체는 내려받기에서 비어 있으므로 값의 직접 일치 검증과 구분. 네이버 시작 응답으로 콜백 일치 확인 |
| 환경 차이                   | OPENAI_API_KEY, GITHUB_ACTIONS_TOKEN, CRAWLER_ADMIN_RUN_ENABLED, NEXT_PUBLIC_SENTRY_DSN은 production 대상만 등록. SENTRY_ORG/PROJECT는 환경별 별도 등록이라 값 일치 미검증. 공개 SEO·회원 경로 필수 차단 요소는 발견하지 못함. Preview로 운영 AI/관리자 실행·관측 설정까지 검증했다고 주장하지 않음  |
| 데이터 영향                 | 이번 점검 DB 쓰기 0건. 배포에 회원·댓글·공고 삭제/마이그레이션 없음. 기존 18건 검수/7건 날짜 교정은 이미 공유 DB에 반영되어 있으며 웹 배포 시 재실행되지 않음                                                                                                                                        |

배포별 환경 스냅샷은 Vercel CLI `env pull --id`가 READY 배포를 거부하여 직접 추출하지 못했다. 현재 환경 메타데이터·다운로드 가능한 공개 값·등록 시각·운영/Preview 실제 HTTP 동작으로 비교했다. 민감값이나 개인정보는 보고서에 기록하지 않았다.

## 복구 대상과 조건

빠른 웹 복구 대상은 현재 운영 중인 READY 배포 `dpl_XPzVK14HAVx8exqNtfJz5Fk3uKUW` / `poster-link-hz99ep95e-maxmini0130s-projects.vercel.app`이다. 현재 `www.posterlink.kr`, `posterlink.kr`가 연결되어 있는 것도 확인했다. 향후 문제 발생 시 Vercel에서 이 이전 배포로 되돌릴 수 있다. 이번에 rollback/promote 명령을 실행하지 않았다.

웹 배포 복구는 이미 적용된 공고 날짜·검수 JSON을 되돌리지 않는다. 필요하면 기존 스냅샷과 이후 변경 여부를 대조하여 별도 승인된 데이터 복구를 수행해야 한다. 스키마 변경은 없어 migration rollback은 필요 없다.

승인 조건과 잔여 위험:

1. 위 3개 ID에 한정한 경고 예외를 이번 SEO·GEO 배포 범위로 기록한다. 전체 품질 통과·향후 review 공고 자동 공개 승인을 뜻하지 않는다.
2. 실계정 인증·저장 기능과 물리 iPhone/Android 검증은 미완료로 인수한다. 배포 후 승인된 테스트 계정으로 확인하고 실패하면 이전 READY 웹 배포로 복구한다.
3. 운영 공개 페이지 HTTP, robots/sitemap, canonical·JSON-LD와 비공개 제외를 배포 직후 재확인한다. 검색 순위·AI 인용 개선은 실제 색인 관찰이 필요하다.

이번에는 기능 추가·리팩터링·품질 기준 완화·경고 삭제·환경 설정 수정·운영 데이터 쓰기·배포·push를 하지 않았다. 추가 변경은 이 점검 로그뿐이다. Git 제외 `data/results/final-approval-20261022/`에 HTTP/환경 메타데이터·대조 결과를 보존했다.
