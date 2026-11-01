# 네이버 로그인 재개 1차 구현: 연결된 계정 로그인·계정 화면 연결 (2026-11-01)

상태: 검토 완료·수정 필요 (구현 Claude, 검토 Codex; b9eb89e, P1 1건·P2 2건, WORK_LOG_20261101_naver_identity_b_review.md 참조). 브랜치 `feat/naver-identity-b-20261101`(UI 5단계 `35ce551` 위). **마이그레이션 미적용, 스위치 꺼짐(모든 경로 503).** push·배포·운영 DB 없음.

기준: [보안 설계안 v4](docs/NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md)(Codex 설계 검토 통과), 사용자 승인(2026-11-01): 방식 B, 서비스 역할 키 예외 5-11 범위. 스테이징 Supabase는 준비 예정.

## 이번 범위

- 포함: 마이그레이션(전체 상태 기계·연결·복구·해제·정리 함수), **회원이 계정 화면에서 네이버 연결(link_session)**, **연결된 네이버로 로그인**, 연결 해제, 연결된 로그인 표시.
- 제외(메일 발송 수단 필요): 네이버로 새로 가입(signup), 같은 이메일 기존 계정 메일 확인 연결(link_email), 다른 브라우저 재인증 화면, 연결·해제 알림 메일. 저장소에 메일 발송 수단(Resend·SMTP 등)이 없다. DB 함수(`naver_tx_email_sent`·`confirm_email`·`reauth_swap`·`creating_user`·`user_created`)는 이미 들어 있고 테스트했다.
- 레거시 조사 후보 4개: 원래 로그인 수단(또는 비밀번호 재설정)으로 들어온 뒤 계정 화면에서 연결하면 된다(자동 연결 없음).

## 변경

- 마이그레이션 [20261101030000_add_naver_identity.sql](supabase/migrations/20261101030000_add_naver_identity.sql)(**적용 안 함**, 롤백 주석 포함). 설계 5-1~5-9, 5-14 그대로:
  - `naver_hash_keys`·`naver_subjects`·`naver_subject_hashes`·`naver_identity_events`·`naver_auth_transactions`. RLS 켬, 권한 없음.
  - 모든 쓰기는 SECURITY DEFINER 함수, 실행은 `service_role`만. 회원은 `my_login_methods()`로 자기 상태만 읽는다.
  - 활성 키 버전 전부의 해시를 요구하고 키 표를 잠가 회전과 직렬화. `complete_naver_link`는 계정 행을 `FOR SHARE`로 잠그고 재검사하며, **잠금 실패 시 연결 거절**.
  - 보안 고정 허용 목록에 `afc931a`로 고정(`e0ac236`).
- 서버 모듈:
  - [naverAuthAdmin.ts](apps/web/lib/server/naverAuthAdmin.ts): 서비스 역할 키를 쓰는 유일한 곳. `naver_*` 함수와 Auth `getUserById`·`generateLink`(magiclink, 발송 없음)만 쓴다. 로그에 이메일·네이버 ID·해시·토큰 없음.
  - [naverProvider.ts](apps/web/lib/server/naverProvider.ts): 네이버 토큰·프로필 요청, 각 10초 제한. 이메일은 요청·사용하지 않는다.
  - [naverAuthCore.ts](apps/web/lib/naverAuthCore.ts): 키 버전별 HMAC 해시, 거래 쿠키, 최근 로그인(`amr`), 같은 출처 검사.
- 경로(모두 `NAVER_LOGIN_ENABLED=true`일 때만, 아니면 503):
  - `POST /auth/naver/start`: 같은 출처만. 거래 생성(비밀값·state는 해시만 저장), HttpOnly·SameSite=Lax·Path=`/auth/naver` 쿠키, 네이버로 이동. 연결은 10분 안에 로그인한 회원만.
  - `GET /auth/naver/callback`: 네이버 ID 해시로만 계정을 찾는다. 로그인은 **거래를 먼저 소비한 뒤** 그 계정의 일회용 토큰을 이 요청의 세션 클라이언트에서 검증하고, 결과 회원 ID가 다르면 즉시 로그아웃·실패. 연결 안 된 네이버면 안내만(계정 존재 여부 노출 없음).
  - `GET /auth/naver/link`: 연결 확인 화면. `POST /auth/naver/finalize`: 같은 출처, 10분 안 로그인, DB 최종 재검사.
  - `POST /auth/naver/unlink`: 다른 로그인 수단이 있을 때만.
  - 옛 `/api/auth/naver*`는 그대로 503(고정 검사 유지).
- 화면: 로그인 화면 네이버 버튼과 계정 화면 "연결된 로그인"은 `NEXT_PUBLIC_NAVER_LOGIN_ENABLED=true`일 때만 보인다. 가입 화면은 "네이버로 새로 가입은 준비 중, 가입 후 연결 가능" 안내.
- `.env.example`: 두 스위치(false)와 `NAVER_ID_HASH_KEY_V1` 자리.

## 설계와 다르게 한 부분

- 세션 발급: 설계 5-6은 별도 공개키 클라이언트로 검증한 뒤 쿠키에 담는 방식이었다. 공용 콜백 수정(`b7b4670`)이 웹 코드의 `setSession`을 금지하므로, **요청의 세션 클라이언트에서 직접 `verifyOtp`** 하고 결과 ID가 다르면 쿠키를 내보내지 않고 로그아웃한다. 확인 항목(발급 ID·검증 ID 두 번)은 같다.
- CSRF: 별도 토큰 대신 같은 출처(Origin/Referer) 검사 + SameSite=Lax HttpOnly 거래 쿠키.
- 최근 인증: 세션 토큰의 `amr` 시각으로 판단(토큰 갱신은 로그인으로 치지 않음).
- 해제 조건 "다른 로그인 수단": `auth.identities`에 행이 하나 이상(이메일·Google·카카오).

## 검증

- PGlite `naver-identity-migration` 9건: 가입(이 거래가 만든 계정만), 브라우저 바인딩·재인증 일치/불일치, 최종 재검사 6가지, **잠금 권한 없음 → 거절·흔적 없음(권한 주면 성공하는 대조 포함)**, 키 회전(V2 없는 요청 거절, 두 계정 동시 연결 1건만, V1만 가진 신원만 재연결 대상, 복구 시 신원 행 유지), 공통 버전 없는 재인증 재시작, 권한, 이메일 조회, 해제·정리.
- 경로 `naver-routes` 7건(esbuild 번들 + 가짜): 스위치 꺼짐 503·호출 0, 시작(출처·쿠키 속성·해시만 저장·안전한 next), 연결 시작의 최근 로그인, 콜백 성공 순서(소비 → 토큰 → 검증)와 네이버 ID 원문 미전달, 실패 6가지(다른 회원 토큰 포함)에서 세션 쿠키 0, 확정·해제, 서비스 역할 모듈 사용 범위.
- 단위 `naverAuthCore` 6건.
- `pnpm test` 300/302, `scripts/security/*` 120/123. 실패는 모두 **기존 실패**.
- lint·`tsc`·build 통과. 로컬 빌드 서버(스위치 꺼짐): 새 경로 4개와 옛 경로 모두 503. UI 브라우저 검사 25/25.

## 남은 일 (승인·사용자 작업 포함)

1. Codex 검토.
2. 스테이징 Supabase: 마이그레이션 적용, **`auth.users` 행 잠금 권한 확인**(없으면 연결이 모두 거절됨, 설계 5-8), 실제 네이버 연결·로그인·해제, 앱 WebView.
3. 네이버 개발자센터: 콜백 주소 `/auth/naver/callback` 등록, Client Secret 교체(설계 6장). 해시 키 생성·보관.
4. 메일 발송 수단 결정 → 가입·이메일 확인 연결 구현.
5. 운영: 레거시 감사 → 옛 배포 정리 → 마이그레이션 적용·`naver_hash_keys`에 V1 등록 → 배포 → 스위치 켜기(단계별 승인). 거래 정리 함수 `naver_purge_transactions()` 예약 실행도 이때 정한다.
