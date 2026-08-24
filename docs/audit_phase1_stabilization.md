# Audit Phase 1 Stabilization

`AUDIT_REPORT.md`의 `Phase 1: 안정화`를 반복 실행 가능한 검증 명령으로 묶은 문서다.

## 실행

```bash
pnpm audit:phase1
```

이 명령은 다음을 순서대로 확인한다.

1. 로컬 Supabase DB reset으로 전체 마이그레이션과 seed 적용 확인
2. 웹 타입체크
3. 웹 lint
4. 웹 production build
5. Playwright Phase 1 smoke flow

Playwright smoke flow에는 다음 범위가 포함된다.

- 로그인/회원가입/접근 제어
- 홈
- 공고 목록/상세
- 로그인 사용자 기본 접근, 찜, 포스터 요청
- 관리자 대시보드/검수/신고/기준정보/공지 API
- 운영자 포스터 목록/등록 화면

인증 플로우는 `apps/web/e2e/global-setup.ts`를 따른다. 아래 환경변수가 있으면 실제 세션으로 실행하고, 없으면 해당 인증 프로젝트는 skip된다.

```bash
E2E_USER_EMAIL
E2E_USER_PASSWORD
E2E_ADMIN_EMAIL
E2E_ADMIN_PASSWORD
E2E_OPERATOR_EMAIL
E2E_OPERATOR_PASSWORD
```

## 선택 실행

로컬 Docker/Supabase가 없고 웹 검증만 돌릴 때:

```bash
pnpm audit:phase1 -- --skip-db-reset
```

E2E 없이 마이그레이션과 빌드만 확인할 때:

```bash
pnpm audit:phase1 -- --skip-e2e
```

## 결과

실행 결과 요약은 아래 파일에 JSON으로 저장된다.

```text
data/results/audit-phase1-report.json
```

## 주의

- `supabase db reset`은 로컬 Supabase 데이터베이스를 초기화한다. 운영 DB에는 적용하지 않는다.
- 운영 DB 쓰기, linked DB push/reset, 대량 수정은 이 Phase 1 스크립트 범위가 아니다.
