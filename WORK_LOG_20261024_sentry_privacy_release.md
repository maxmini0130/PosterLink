# Sentry 개인정보 최소화 전용 운영 릴리스

## 범위와 기준

- 운영 기준: `eb5ddef2690bcaed30f63481f18354ae55b4e409`. 2026-10-24 14:15:25 UTC Vercel 읽기 전용 조회로 Pro / Production 배포 `dpl_7VgprVajPVjfb2FSgM2ojeJKU2AY` 확인.
- 브랜치: `release/sentry-privacy-only-20261024`. 기존 개인정보/GA 후보 전체를 병합하지 않고 `eb8e532`의 Sentry 4개 파일만 그대로 분리했다.
- 런타임: `apps/web/instrumentation.ts`, `apps/web/instrumentation-client.ts`, `apps/web/lib/sentryPrivacy.ts`. 테스트: `apps/web/lib/sentryPrivacy.test.ts`; package.json에는 전용 테스트 명령만 추가했다. 이 로그 외 문서/방침 변경 없음.
- 오류 감지·성능20% 유지. Replay integration 제거/두 비율0, sendDefaultPii=false, 로그OFF. 오류/transaction/span/breadcrumb 개인정보·원문·첨부 필터 유지. SDK 파일은 검증된 원본과 동일해야 한다.
- 회원 탈퇴503·이메일 요청 안내, 로그인, 관리자 권한 보호, 신규 가입 통계, SEO, 기존 통계/Expo는 운영과 동일하게 유지한다. GA4 코드·개인정보처리방침 전체 개정안·DB/SQL/Cron 변경을 포함하지 않는다.

## 승인 후 운영 적용

1. 현재 Production SHA와 변경 파일 제한, 승인된 코드 SHA를 다시 대조한다. 기존 운영 배포 ID와 환경변수 이름/상태를 비밀값 없이 보존한다.
2. **Sentry 계정 수동 설정은 별도 승인:** Settings → Projects → posterlink-web → Security & Privacy → Data Scrubbing → Prevent Storing of IP Addresses ON → Save Changes. Data Scrubber/Default Scrubbers ON 유지. sendDefaultPii=false는 네트워크 IP의 서버 저장 방지를 대신하지 않는다. 설정 저장 후 새 이벤트로 IP/geo 저장 여부 확인. 과거 기록은 자동 삭제되지 않는다.
3. 운영 배포 승인 후 전용 SHA를 Production 환경변수로 새 빌드한다. 테스트 DB/`privacy-preview` 환경의 Preview를 그대로 승격하지 않는다. 운영 환경변수·DB·RLS·계정 역할·GA 상태는 변경하지 않는다.
4. 운영 홈/목록/로그인/문의, 비로그인 API 인증 보호, 탈퇴 안전 차단 및 관리자 통계/SEO를 점검한다. 실제 회원 삭제·OAuth 연결 해제·테스트 데이터 저장은 하지 않는다. 승인된 합성 오류만으로 수집/필터/Replay 없음 및 신규 오류 로그를 확인한다. 실계정 검증 불가 항목은 미검증으로 남긴다.

## 복구

- 이전 운영 eb5ddef는 회원 탈퇴 안전 차단은 있지만 Replay/개인정보 최소화 이전이므로 기본 복구 대상으로 사용하지 않는다.
- 정상 확인된 이번 Sentry 전용 Production 배포를 이후 안전 복구 대상으로 보존한다. 첫 적용 실패 시 같은 전용 SHA를 운영 환경변수로 재빌드/재배포하는 전진 복구를 우선한다.
- 안전한 재배포가 불가능하면 추가 변경 중단·보고. Sentry 수집 일시 중지(DSN 비우기 및 재빌드 등)는 오류 감지 손실을 수반하므로 별도 승인 대상으로 남긴다. 계정 IP 저장 방지나 탈퇴 차단을 자동 해제하지 않는다.
- 운영 게시·DB 변경/삭제·Cron·GA 활성화·Git push는 이번 준비 단계에서 실행하지 않는다. Preview/시험 결과는 아래 완료 기록으로 추가한다.

## 로컬 검증

- Sentry 파일4개는 eb8e532와 Git diff 없음. 운영 기준 대비 app/middleware/Supabase/모바일/lockfile 변경 없음.
- Sentry5건·Auth 가입 통계9건·문의처3건·탈퇴 안전 차단1건·격리 관리자 보안 시험을 합해 **109/109 PASS**. 운영 DB 대신 가상 스텁/메모리 PostgreSQL을 사용했다.
- Node20 Build, TypeScript, Lint, diff check PASS. 기존 Browserslist 갱신 권고와 edge 정적 생성 안내만 있으며 관련 없는 패키지는 갱신하지 않았다.
- Preview 배포·실제 수신 결과는 완료 후 기록한다.
