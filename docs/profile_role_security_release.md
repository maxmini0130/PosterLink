# 관리자 역할 보안 전용 릴리스

2026-10-23. 기준 운영 코드 `b3519d2fa5bec73be9f9f13d56c44c4bf1cba9f2`, 패치 출처 `0e964e8`, 계획 출처 `c478c74`.

## 범위

브랜치 `release/security-profile-role-20261023`는 운영 SHA에서 생성했다. 미배포 기능 브랜치를 merge/cherry-pick하지 않고 역할 쓰기 제거만 이식했다. 아래 5개 파일 외의 애플리케이션 런타임은 기준 운영 코드와 같다.

- `apps/web/app/signup/page.tsx`: 이메일 가입 프로필 upsert에서 role:user 제거.
- `apps/web/app/auth/callback/route.ts`: 공통 OAuth 프로필 보완 upsert에서 role:user 제거.
- `apps/web/app/api/auth/naver/callback/route.ts`: 네이버 프로필 보완 upsert에서 role:user 제거.
- `apps/web/app/mypage/edit/page.tsx`: 프로필 수정 upsert에서 role:user 제거.
- `apps/web/app/api/onboarding/complete/route.ts`: 기존 role 조회와 재저장 제거. 검증된 사용자 id와 기존 허용 필드만 저장.

제외: GA4 태그·동의 UI·신규 이벤트·UTM·개인정보 페이지 개정·신규 가입 통계 API/UI 및 관련 의존 코드. 기존 운영 Vercel Analytics·자체 방문 통계·SEO·필터·인증·관리자 역할 API는 변경하지 않았다. `scripts/security/profile-role-release.test.ts`가 런타임 변경 파일 목록, 5곳의 정확한 변경 범위, 주요 미승인 기능 부재를 검사한다.

지원 파일:

- [보호 migration](../supabase/migrations/20261023010000_protect_profile_role_writes.sql): `0e964e8`와 같은 SQL. 운영 미적용.
- [사전 확인](../scripts/security/profile-role-preflight.sql), [ACL 백업](../scripts/security/profile-role-acl-backup.sql): 기존 읽기 전용 SQL. 회원 행을 출력하지 않는다.
- [격리 SQL 검증](../scripts/security/profile-role.test.ts): 기존 보안 테스트와 서비스 역할의 관리자 부여/해제·기존 관리자 보존 검사.
- [릴리스 범위 검사](../scripts/security/profile-role-release.test.ts).
- `apps/web/playwright.profile-role.config.ts`, `apps/web/e2e/security/profile-role-fixture.mjs`, `apps/web/e2e/security/profile-role.spec.ts`: 가입 통계 대역 없이 합성 Auth/프로필만 사용하는 전용 검증.
- root `package.json`, `pnpm-lock.yaml`: 보안 테스트 명령 및 개발 전용 `@electric-sql/pglite@0.5.11` 하나 추가. 웹 코드에서 import하지 않는다. 기존 패키지 업그레이드 없음.
- README와 이 문서·작업 기록. 실제 릴리스 SHA/Preview URL/검증 결과는 작업 기록에 보존한다.

## DB 보안 효과와 한계

기존 정책은 자기 행 소유만 검사하며 role 값을 제한하지 않는다. 일반 쓰기 권한이 함께 있을 때 역할 상승이 가능한 조합을 격리 PostgreSQL에서 재현했다. 운영의 실제 정책/권한/함수와 같다는 증거는 아직 없으며, 운영에서 공격 UPDATE를 실행하지 않는다.

SQL은 RLS 활성화·user 기본값을 전제로 PUBLIC/anon/authenticated의 테이블/칼럼 INSERT·UPDATE를 회수한 뒤 authenticated의 기존 non-role 쓰기 권한만 복원한다. 기존 service_role 유효 권한은 보존한다. INVOKER trigger는 실제 SET ROLE을 기준으로 일반 회원의 관리자 역할 INSERT·역할 변경을 차단한다. RLS 정책·Auth 트리거·회원 행·기존 role 값은 수정하지 않는다. 관리자 권한 보존과 service_role의 부여/해제, 일반 프로필 및 모바일 푸시 칼럼 쓰기, 기존 관리자 RPC를 격리 검증한다.

재실행 시 효과적 칼럼 권한과 정책이 같음을 검사한다. 예상 밖 기본값/RLS 비활성/상속 권한이 있으면 SQL 전체 transaction이 중단된다. anon 쓰기나 custom DB 역할의 PUBLIC 의존 권한이 있는 운영 환경은 별도 호환성 검토가 필요하다. 같은 이름의 기존 guard를 무조건 덮어쓰지 않는다. 일반 role 필드를 제거한 앱만 배포하는 것은 직접 REST 공격 차단을 완성하지 못한다.

운영 사전 확인에는 모든 정책·직접/상속 권한·역할 전환·관련 트리거·SECURITY DEFINER·노출 view/rule/함수 검토가 필요하다. 제공 쿼리의 `public`/본문 profiles 검색만으로 간접 호출·다른 스키마 전체를 검증했다고 판단하지 않는다. Auth 프로필 생성 경로와 함수 본문은 보호된 관리 환경에서 별도 확인한다. 서비스 키 유출이나 이미 부당하게 부여된 역할은 이번 SQL만으로 해결되지 않는다.

## 관리자 역할 변경

기존 `/api/admin/users/[id]` PATCH는 서버 getUser와 profiles.role=super_admin을 확인하고, 허용 역할·자기 역할 변경 금지를 검사한 후 service_role로 갱신한다. 이 경로를 변경하지 않았다. 부여/해제 전 대상과 변경 전후 역할을 담당자가 승인하며 다른 정당한 최고 관리자가 남아 있어야 한다. 감사 기록 INSERT는 역할 갱신과 원자적이지 않고 오류 처리가 보장되지 않으므로 별도 확인한다.

초기 최고 관리자 설정은 승인된 계정을 DB 담당자가 신뢰한 연결로 확인한 뒤 수행하는 별도 관리 작업이다. 공개 가입·OAuth metadata로 부여하지 않는다. 기존 최고 관리자가 존재한다는 이전 관측만으로 초기화를 다시 실행하지 않는다.

## 미완료 운영 검증과 필수 승인

- **관리자 명부 대조 미완료**: 승인 명부란 실제 관리자로 지정한 계정 목록이다. 담당자가 보호된 관리 화면에서 각 관리자/최고 관리자 계정이 승인된 사람인지 확인해야 한다. 현재 DB role 값만으로 정당성을 판정하지 않는다. 회원 식별정보를 문서/로그에 넣지 않는다.
- **운영 카탈로그 미확인**: 이전 확인에서는 DB 연결/관리 토큰이 없고 Supabase 대시보드가 로그인 화면이었다. 이번에도 인증된 관리 연결 또는 담당자의 읽기 전용 SQL 결과가 필요하다. 운영에서 테스트 UPDATE나 새 RPC로 우회하지 않는다.
- **운영 DB 백업 미확인**: Vercel 배포 보존과 DB 백업은 별개다. 담당자가 실제 Supabase 백업/PITR 제공 여부·최근 성공 시각·복원 권한/절차를 확인하고, 적용 직전 관련 ACL/정책/함수/트리거 정의를 접근 통제된 위치에 보존한다. 현재 백업이 존재하거나 복원이 성공한다고 보증하지 않는다.
- 실제 격리 Supabase의 Auth/PostgREST 통합 검증과 실계정 OAuth·정상 회원 저장은 로컬 대역 테스트/Preview 익명 검증과 구분한다. 운영 계정이나 운영 회원 데이터로 시험하지 않는다.
- 정확한 보안 전용 코드 SHA 및 Preview 결과, 지정 SQL 한 파일의 적용 시간·실행자·잠금/실행 제한·이력 기록, 구버전 클라이언트 대응·사후 검수 범위·복구 책임자 승인이 필요하다.

## 적용 순서 및 단계별 복구

1. **사전 검토**: 운영 카탈로그·관리자 정당성·실제 백업·정의 snapshot·정확한 운영 배포 SHA 확인. 격리 Supabase에서 운영과 같은 권한으로 실제 PostgREST 검증. 불일치/접근 부족이면 중단한다.
2. **웹 우선**: 승인된 보안 전용 SHA만 웹에 배포하고 이메일 가입/공통 OAuth/네이버/프로필/온보딩에서 role 없는 payload와 정상 저장을 확인한다. DB 적용 전 앱 장애면 기존 배포로 복구할 수 있지만 보안 문제는 아직 해결되지 않았음을 기록한다.
3. **클라이언트 전환**: role:user를 보내는 옛 탭/앱도 DB 보호 후 거부될 수 있다. 새로고침/버전 전환을 준비한다. 정상 확인한 role 없는 웹 배포 ID/SHA를 DB 적용 후의 안전한 복구 지점으로 보존한다.
4. **DB 별도 승인**: 지정 migration 전체를 하나의 transaction으로 적용한다. 무관한 대기 migration 전체를 db push하지 않는다. 실제 세션 역할·기본값·권한과 잠금 제한을 점검한다. 실패하면 ROLLBACK 후 카탈로그 상태를 확인하고 부분 재개하지 않는다.
5. **사후 검증**: role INSERT/UPDATE 거부 권한·guard 활성·기존 RLS 동일성 확인, 정상 회원 기능/관리자 역할 경로/42501·403·5xx 로그 확인. 실제 회원 역할 변경 등 운영 쓰기 검수는 별도 승인 범위에서만 시행한다. 미검증을 성공으로 표시하지 않는다.

**안전한 복구:** DB guard와 role 차단을 유지하고 role을 보내지 않는 정상 앱으로 복구한다. 필요하면 승인된 최소 non-role 권한만 snapshot과 대조해 복원한다. 옛 앱 배포로 되돌리는 것만으로는 DB와 호환된다고 보증할 수 없다. 환경변수·DB는 Vercel 배포 롤백으로 복원되지 않는다.

**보안 롤백:** guard 제거와 옛 ACL 복원은 권한 상승을 재노출할 수 있으므로 별도 비상 승인 사항이다. 사전 snapshot 기반의 정확한 GRANT 복원을 검토하며 GRANT ALL이나 RLS 비활성화로 우회하지 않는다. 이번 릴리스에 자동 운영 롤백 실행기를 포함하지 않는다. 회원 role 값을 임의 정정하지 않는다.

## 검증 명령

```bash
pnpm test
pnpm test:security:roles
pnpm --filter web exec playwright test --config playwright.profile-role.config.ts
pnpm --filter web lint
pnpm --filter web build
pnpm --filter web exec tsc --noEmit
```

원격 Preview는 `E2E_BASE_URL`, 필요한 경우 보호된 임시 `RELEASE_STORAGE_STATE`를 사용한다. 원격에서는 합성 세션 양성 테스트를 skip한다. 실제 운영 프로젝트에 회원을 생성하거나 역할을 쓰지 않는다. 로컬 Next dev와 build/tsc는 `.next/types`를 공유하므로 동시에 실행하지 않는다.
