# GA4 제한된 내부 수신 테스트 고지·실행 기준

2026-10-23. 이 문서는 운영 개인정보처리방침의 확정·게시나 운영 GA4 활성화를 승인하지 않는다. 기존 비활성 준비 기록 이후 사용자가 승인한 별도 내부 테스트에만 적용한다.

## 참여자에게 제공할 고지

이번 테스트는 접근이 제한된 Vercel Preview에서 공개 홈페이지·공고 목록·공고 상세의 분석 이벤트 수신을 확인하기 위한 선택적 내부 테스트다. Google Analytics는 GA 쿠키 식별자, 접속 IP, 브라우저·기기 정보와 정제된 공개 페이지 이벤트를 처리할 수 있다. 별도 테스트 속성 PosterLink Preview QA 20261023의 PosterLink Preview Web 스트림(G-K8EVG5FHHF)만 사용한다. 운영 속성 G-1Z7X91CJCS로 전송하지 않는다.

참여하지 않거나 철회해도 서비스 이용에 불이익은 없다. /privacy의 ‘분석에 동의’를 명시적으로 선택하기 전에는 GA SDK와 Google Analytics 요청이 없어야 한다. ‘동의하지 않음 / 철회’를 선택하면 이후 전송을 중단하고 이 브라우저의 GA 쿠키 및 자체 분석 유입 저장을 지운다. 이미 Google에 전송된 정보가 자동 삭제되는 것은 아니다. GA 철회는 Supabase·Vercel의 기존 통계나 과거 데이터 삭제를 의미하지 않는다.

실제 로그인·회원가입·찜·댓글·팔로우·신청 링크 클릭은 하지 않는다. 회원 식별정보, 이메일, 전화번호, 검색어 원문, 인증 토큰은 전송하지 않는다. GA 자체 쿠키 식별자와 브라우저 정보가 전혀 수집되지 않는다는 의미는 아니다. 광고 개인화·Google Signals는 코드에서 비활성 유지한다.

Google 계약 주체, 국외 처리 국가, 법적 근거와 보존기간을 이 문서에서 추정하거나 확정하지 않는다. 운영 서비스 정책의 미확정 항목은 기존 승인 목록에 남긴다. 추가 내부 참여자가 있으면 운영자가 위 고지를 먼저 제공하고 각자의 명시적 선택 동의를 확인해야 한다. 이름·이메일·서명 등 참여자 개인정보를 Git에 기록하지 않는다.

## 실행 조건

1. Vercel 배포 보호가 유지된 단일 Preview만 사용한다. 승인된 내부 담당자만 접근하며 보호를 공개로 전환하지 않는다.
2. 실행 코드는 e3c56027b6d953271b41588526a06886aacc98a0. 운영 19db3c39의 관리자 보안 및 신규 가입 통계는 보존한다. 코드·DB·RLS 변경 없이 배포별 build/runtime 값만 지정한다.
3. NEXT_PUBLIC_GA_MEASUREMENT_ID=G-K8EVG5FHHF, ENABLED/POLICY_REVIEWED/ALLOW_NON_PRODUCTION/DEBUG의 GA 플래그는 해당 단일 테스트 배포에서만 true다. POLICY_REVIEWED는 이 제한된 테스트 고지 검토를 뜻하며 운영 정책 승인으로 해석하지 않는다. 운영·공유 Preview 환경변수는 변경하지 않는다.
4. 새 브라우저 컨텍스트에 Vercel 접근 쿠키만 사용한다. Supabase 회원 세션은 가져오지 않는다. API 및 Supabase의 변경 요청을 네트워크에서 차단한다. 자체 방문·상세 조회 기록 쓰기도 차단한다.
5. 참여자 명시적 동의 확인 전에는 실제 Google 요청을 차단한다. 동의 후에도 테스트 ID 외 수집, 허용하지 않은 이벤트·민감한 payload가 발견되면 전송을 차단하고 중단한다.
6. 전체 HAR, 쿠키 값, GA client/session 식별자, 인증 헤더는 저장하거나 출력하지 않는다. 이벤트명·허용된 공개 경로·횟수·상태 코드와 개인정보 검사 결과만 기록한다.

## 검증 순서

| 단계                                | 합격 기준                                              |
| ----------------------------------- | ------------------------------------------------------ |
| 새 컨텍스트 /privacy 및 공개 페이지 | 미동의 GA SDK·수집 요청 0건                            |
| 명시적 동의                         | 최초 page_view 1회, 측정 ID는 테스트 ID만 사용         |
| 실제 SPA 링크로 홈페이지→목록→상세  | 경로별 page_view 각 1회, 상세 view_poster 1회          |
| 동일 경로 query/hash 변화           | 추가 page_view 0회, 검색어 원문 미전송                 |
| 실제 payload 검사                   | 회원 ID·이메일·전화·인증 토큰·검색어 원문 없음         |
| 철회 후 공개 페이지 이동 및 대기    | 이후 신규 Google 전송 0건, 거부 저장 유지              |
| 실제 테스트 속성 DebugView          | Network 이벤트와 실제 수신 이벤트별 횟수를 별도로 대조 |

자동 session_start·first_visit·user_engagement가 있다면 수동 page_view 중복과 구분해 기록한다. 네트워크 2xx만으로 DebugView 수신 성공을 선언하지 않는다. [Google 공식 DebugView 안내](https://support.google.com/analytics/answer/7201382?hl=en)에 따라 수동 이벤트에 debug_mode:true를 적용한다.

테스트를 마치면 동의를 철회하고 테스트 브라우저를 닫는다. 과거 활성 Preview는 새 비활성 배포만 생성한다고 정지하지 않으므로 기존 접근 제한을 유지하고 추가 참여 테스트를 중단한다. 재사용 시 동일 고지·개별 동의·DB 쓰기 차단 절차를 다시 적용한다. 공개 배포나 상시 분석 환경으로 사용하지 않는다.

2026-10-25: reuse the same approved internal notice/consent scope for the new Naver-safe Preview. Current source SHA and results are in WORK_LOG_20261025_ga4_naver_safe.md; older source SHAs above describe the earlier test. Production collection remains disabled.
