# 2026-11-19 로그인·회원가입·비밀번호 재설정 폼 제출 방식 고정

## 문제

관리자 화면 점검 중 Playwright가 로그인 화면 스크립트가 다 뜨기 전에 Enter를 눌렀다. 그러자 로그인 폼이 브라우저 기본 방식(GET)으로 제출됐고, 이메일과 비밀번호가 `/login?email=…&password=…` URL에 실린 채 운영 서버로 전송됐다. 이번에 노출된 계정은 E2E 관리자 테스트 계정이다.

- 원인: `<form onSubmit={…}>`에 `method`가 없다. 스크립트가 붙기 전(느린 네트워크, 스크립트 실패, 차단)에는 브라우저 기본 GET 제출이 일어난다.
- 영향: 비밀번호가 접속 로그(Vercel 요청 로그), 브라우저 기록, Referer 등에 남을 수 있다.

## 변경

- `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`, `apps/web/app/reset-password/page.tsx`의 비밀번호 폼에 `method="post"`를 지정했다.
- 정상 동작(스크립트가 `preventDefault` 후 Supabase로 로그인)은 바뀌지 않는다.

## 검증

- `pnpm --filter web lint`, `pnpm --filter web build` 통과
- Playwright로 스크립트를 끄고 가짜 계정(`nobody@example.invalid`)으로 제출했다.

| 화면              | 운영(수정 전)                      | 로컬(수정 후)            |
| ----------------- | ---------------------------------- | ------------------------ |
| `/login`          | `GET /login?…`, URL에 값이 노출됨  | `POST /login`, 노출 없음 |
| `/signup`         | 제출되지 않음(필수 항목)           | 같음                     |
| `/reset-password` | 스크립트 없이는 비밀번호 칸이 없음 | 같음                     |

- 스크립트를 켠 정상 로그인(E2E 사용자, 모바일 390px)은 `/`로 이동했고, 쿼리 없이 인증 쿠키가 생겼다.

## 남은 작업

- E2E 관리자 테스트 계정 비밀번호를 바꿔야 한다(사용자 작업). 바꾼 뒤 `apps/web/.env.local`의 값도 갱신한다.
- 점검 스크립트는 화면이 다 뜬 뒤(`networkidle`) 로그인하도록 고쳤다(로컬 작업 파일).
