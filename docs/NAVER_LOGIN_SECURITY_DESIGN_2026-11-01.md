# 네이버 로그인 재개 보안 설계안 (2026-11-01)

상태: 4차안, 설계 검토 통과(Codex, 2026-11-01). 운영 재개 승인 아님 — 실제 RPC 동시성·스테이징 잠금 권한 검증 필요. 작성 Claude, 검토 Codex. 코드·DB·운영 설정 변경 없음. 검토 기록: [WORK_LOG_20261101_naver_login_security_design_review.md](../WORK_LOG_20261101_naver_login_security_design_review.md)

## 0. 요약

- 네이버 로그인은 2026-10-25부터 운영의 모든 네이버 경로가 503이다([WORK_LOG_20261025_naver_emergency_release.md](../WORK_LOG_20261025_naver_emergency_release.md)). UI 개편 브랜치에서는 버튼도 숨겼다.
- 다시 켜는 조건:
  - 계정은 **네이버 고유 ID**로만 찾는다. 키 버전이 달라도 같은 네이버 ID는 하나의 신원이다.
  - 이메일이 같다는 이유로 계정을 잇지 않는다.
  - 기존 계정과의 연결은 **한 거래 안에서 같은 사람이 두 수단을 증명**한 뒤 명시적 POST로만 한다.
  - 연결을 확정하는 DB 트랜잭션 안에서 **증명이 아직 유효한지**(계정의 현재 이메일·상태)를 다시 검사한다.
  - 모든 단계는 서버의 거래 기록을 **조건부로 한 번만 소비**한다.
  - 세션은 **매핑된 회원 ID와 일치할 때만** 내보낸다.
- 방식:
  - Supabase 공식 문서는 같은 이메일의 신원을 **자동 연결**한다고 밝힌다. 그래서 A(Supabase 커스텀 제공자)는 스테이징에서 자동 연결이 일어나지 않음을 입증할 때만 쓴다.
  - **기본 추천은 B**(서버 신원 테이블 + 거래 상태 기계)다.
  - B는 콜백에서 서비스 역할 키를 쓰므로 CLAUDE.md 7장 예외 승인이 필요하다(5-11에 범위 명시).
- **공용 콜백의 URL 토큰 수신(로그인 CSRF)은 네이버와 별개로 먼저 고친다(7장).**

### 검토 반영

| 차수     | 지적                                                                      | 반영 위치                                                                                            |
| -------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1차 P1   | 메일 확인과 네이버 인증의 주체 결합                                       | 5-4 거래·브라우저 바인딩, 5-7 다른 브라우저는 네이버 재인증, GET은 화면만                            |
| 1차 P2   | 세션 대상 검증                                                            | 5-6 `getUserById` → 발급·검증 결과 ID 2중 확인                                                       |
| 1차 P2   | 일회 소비·부분 실패                                                       | 5-4 조건부 UPDATE, 5-9 상태 전이 표, 5-10 실패 복구                                                  |
| 1차 P2   | 레거시 4개 단정                                                           | 1장·6장                                                                                              |
| 2차 P1   | 최종 연결 시 이메일 재검사 누락                                           | 5-8 `complete_naver_link` 트랜잭션 안 재검사·계정 행 잠금                                            |
| 3차 P1   | 잠금 불가 시 사후 보상 경로                                               | 5-8: 원자적 검증이 불가능하면 연결 자체를 거절. 커밋 후 재확인·되돌리기 경로 삭제                    |
| 2차 P2   | 키 손실 후 복구가 기본키 충돌로 막힘                                      | 5-1 신원(`naver_subjects`)과 해시(`naver_subject_hashes`) 분리, 5-8 복구 모드(조건부 교체·이력·알림) |
| 2차 P2   | 키 교체 중 같은 네이버 ID가 두 계정에 연결                                | 5-2 "활성 키 전부의 해시를 함께 기록" 규칙 + DB가 활성 키 집합을 강제, 키 표 잠금으로 회전과 직렬화  |
| 2차 보완 | OAuth state 열, 쿠키 경로, 이메일 조회 RPC, 키 제거 후 표시, 상태 전이 표 | 5-1, 5-3, 5-5, 5-2, 5-9                                                                              |

## 1. 현재 상태

| 구분        | 내용                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 확인된 사실 | 시작·콜백·앱·옛 `naver_at`/`naver_rt` 경로 503, 인증 쿠키·세션 발급 없음([naver-emergency-stop.test.ts](../scripts/security/naver-emergency-stop.test.ts)) |
| 확인된 사실 | 옛 콜백 코드는 네이버 이메일로 기존 계정을 찾아 비밀번호를 덮어썼다(소스 확인)                                                                             |
| 확인된 사실 | 네이버 ID는 어디에도 저장되지 않았다. `user_metadata.provider='naver'`만 남겼고 회원이 수정할 수 있다                                                      |
| 조사 후보   | 운영 12개 계정 중 4개에 네이버 메타데이터, 그중 2개에 이메일/비밀번호 표식(2026-10-25 감사)                                                                |
| 미확인      | 이 4개가 실제 피해 계정인지, 지금도 파생 비밀번호가 걸려 있는지, 남은 세션이 있는지                                                                        |
| 남은 위험   | 옛 배포(`3c71e3a`, `eb5ddef`, `19db3c39` 등)에 취약 코드가 있음. Vercel 보호로 익명 접근만 막힘                                                            |
| 제공자      | Supabase 내장 목록에 네이버 없음. 커스텀 OAuth2/OIDC 제공자 기능은 공식 지원(이 프로젝트 노출 여부는 미확인)                                               |

## 2. 이전 방식의 결함

1. 네이버 이메일로 기존 계정을 찾아 비밀번호를 덮어씀 → 이메일 충돌로 계정 탈취 가능
2. 네이버 이메일을 우리가 소유 확인한 주소처럼 취급(네이버 명세상 식별자는 앱별 `response.id`, 이메일은 연락처 속성)
3. `HMAC(Client Secret, naverId)` 결정론적 비밀번호 → Secret 하나로 모든 네이버 계정 비밀번호 계산 가능
4. 세션 토큰을 URL로 전달(웹 쿼리, 앱 커스텀 스킴 프래그먼트)
5. 오류 원문을 `?msg=`로 노출, 외부 요청 타임아웃 없음

## 3. 공통 조건

- 식별은 네이버 ID 해시로만 한다. 이메일·이름·`user_metadata`는 식별에 쓰지 않는다.
- 이메일로 찾은 계정에 자동 연결하지 않는다. 실패·경합 경로에서도 마찬가지다.
- 비밀번호를 만들거나 바꾸지 않는다.
- 세션 토큰·로그인 링크·OTP를 URL·로그·응답 본문에 싣지 않는다.
- 네이버 신원 1개 ↔ 계정 1개. 키 버전과 무관하게 DB가 보장한다(5-2).
- 상태를 바꾸는 동작(연결 확정, 가입 확정, 연결 해제, 메일 재발송)은 CSRF 토큰이 있는 **명시적 POST**만. 메일 링크 GET은 확인 화면만 보여준다(메일 스캐너 대비).
- 연결·해제는 최근 인증(10분 이내 로그인 또는 네이버 재인증)을 요구한다. 최종 확정 요청에서 다시 검사한다.
- `next`는 기존 `safeNextPath` 규칙(같은 origin, `/`로 시작, `//`·`\` 금지)으로 정규화한다.
- 이메일 충돌 여부가 응답으로 드러나지 않게 한다(5-5).
- 요청 제한: 시작(IP당), 메일 발송(이메일·IP당), 확인 POST(거래당 시도 수).
- 모든 응답 `Cache-Control: private, no-store`. 거래 쿠키·토큰은 로그에서 가린다.
- 네이버 토큰·프로필 요청은 각 10초 타임아웃, 실패 시 일반 문구.

## 4. 방식 비교

|                | A. Supabase 커스텀 제공자                                                                                                       | B. 서버 신원 테이블               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 신원 저장      | `auth.identities`(provider subject)                                                                                             | `naver_subjects` + 키 버전별 해시 |
| 같은 이메일    | 공식 문서상 **자동 연결**. 수동 연결(`linkIdentity`) 설정은 자동 연결 차단과 다르다                                             | 연결하지 않음(직접 통제)          |
| 서비스 역할 키 | 불필요                                                                                                                          | 필요(예외 승인 대상)              |
| 채택 조건      | 스테이징에서 ① `response.id`를 subject로 읽음 ② 같은 이메일 계정에 자동 연결 0건 ③ 플래그로 authorize 직접 진입까지 막힘을 입증 | 5장 전체 구현과 10장 검사 통과    |

- A는 운영 Supabase에서 시험 삼아 켜지 않는다.
- 이메일을 요청하지 않는 A 구성(자동 연결 근거를 없애는 방법)도 스테이징 입증 대상에 넣는다.
- 입증이 안 되면 B로 간다.

## 5. 방식 B 상세

### 5-1. 테이블 (마이그레이션 SQL만 작성, 적용은 승인 후)

```sql
-- DB가 아는 해시 키 버전. 키 값은 서버 환경변수에만 있다.
create table public.naver_hash_keys (
  version smallint primary key,
  status text not null check (status in ('active', 'retired')),
  activated_at timestamptz not null default now(),
  retired_at timestamptz
);

-- 네이버 신원 하나 = 행 하나. 계정과 1:1.
create table public.naver_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_via text not null check (linked_via in ('signup', 'link_session', 'link_email', 'recover')),
  last_login_at timestamptz
);

-- 같은 신원의 키 버전별 해시. 해시는 전역 유일.
create table public.naver_subject_hashes (
  hash text primary key,
  key_version smallint not null references public.naver_hash_keys(version),
  subject_id uuid not null references public.naver_subjects(id) on delete cascade,
  unique (subject_id, key_version)
);

-- 연결·복구·해제 이력(해시·이메일 없음).
create table public.naver_identity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  event text not null check (event in ('linked', 'recovered', 'unlinked', 'hash_added')),
  key_versions smallint[] not null default '{}',
  transaction_id uuid,
  created_at timestamptz not null default now()
);

create table public.naver_auth_transactions (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('login', 'link_session', 'reauth')),
  browser_secret_hash text not null,
  oauth_state_hash text not null,      -- 네이버 state 파라미터 해시(상태 기계 state와 별개)
  state text not null check (state in (
    'started', 'naver_verified', 'email_sent', 'email_verified',
    'creating_user', 'user_created', 'completed', 'failed', 'expired')),
  naver_hashes jsonb,                  -- {"1": "...", "2": "..."} 콜백 당시 활성 키 전부
  flow text check (flow in ('login', 'signup', 'link_email', 'link_session')),
  email text,                          -- 정규화. signup·link_email만
  email_token_hash text,
  target_user_id uuid references auth.users(id) on delete cascade,
  created_user_id uuid,
  session_user_id uuid,                -- link_session 시작 회원
  parent_id uuid references public.naver_auth_transactions(id), -- reauth
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
```

- 모든 테이블 RLS 켜고 회원·익명 권한 없음.
- 연결된 로그인 목록은 `my_login_methods()` SECURITY DEFINER 읽기 함수로 본인 것만 돌려준다.
  - 돌려주는 값: 연결 여부, 연결 시각, `needs_relink`(활성 키 해시가 하나도 없음, 5-2)
- 쓰기는 5-8·5-9의 SECURITY DEFINER 함수로만 한다. EXECUTE 권한은 `service_role`에만 준다.
- 완료·실패 거래는 7일, 만료 거래는 1일 뒤 삭제한다(기존 보존 정리 작업에 추가). 이력은 계정 삭제 시 함께 지운다.

### 5-2. 해시 키와 1:1 보장

- 해시: `HMAC(NAVER_ID_HASH_KEY_V{n}, response.id)`. Client Secret과 별개의 서버 환경변수이고, 원문 ID는 저장하지 않는다.
- **규칙: 서버는 가진 키 전부로 해시를 계산해 함께 보낸다. DB 함수는 보낸 버전 집합이 `active` 버전 전부를 포함할 때만 처리한다.**
  - 함수는 시작할 때 `naver_hash_keys`의 active 행을 `FOR SHARE`로 잠근다. 키 활성화·은퇴 SQL은 `FOR UPDATE`로 잠그므로 회전과 연결 처리가 직렬화된다.
  - 새 신원을 만들 때는 활성 버전마다 해시 행을 **모두** 넣는다. 같은 네이버 ID로 동시에 두 계정에 연결하려 하면 같은 버전의 해시가 충돌해 한쪽만 성공한다.
  - 활성 키가 빠진 요청(그 키가 없는 옛 배포·회전 전 시작한 요청)은 거절되고, 사용자는 처음부터 다시 시작한다.
- 조회(`naver_resolve`): 보낸 해시 중 하나라도 찾으면 그 신원이다.
  - 보낸 해시들이 서로 다른 신원을 가리키면 무결성 오류로 보고 처리를 멈춘다(세션 없음, 감사 대상).
  - 찾은 신원에 빠진 활성 버전 해시가 있으면 같은 트랜잭션에서 추가한다(`hash_added` 이력). 그 해시가 다른 신원에 있으면 역시 멈춘다.
- 회전 절차(운영 작업, 승인 후):
  1. V2 키를 환경변수에 추가하고 배포한다(아직 DB에는 없음 → 계산은 하지만 강제되지 않음).
  2. `naver_hash_keys`에 V2를 active로 넣는다. 이 시점부터 V2 없는 요청은 거절된다.
  3. 로그인하는 회원마다 V2 해시가 채워진다.
  4. 회전 기간 뒤 V1을 `retired`로 바꾸고, 그다음 V1 환경변수를 뺀다.
  5. 그때까지 로그인하지 않아 활성 해시가 없는 신원은 `needs_relink`가 된다. 계정 관리 화면에 "네이버 다시 연결 필요"로 표시되고 5-8 복구로 다시 잇는다.
- 키를 잃은 경우도 그 버전을 `retired`로 바꾸면 위와 같은 상태가 된다.
- 키는 사용자가 비밀 보관소에 따로 백업한다(값은 문서·로그에 남기지 않음).

### 5-3. 경로와 쿠키

- 새 경로는 모두 `/auth/naver/` 아래에 둔다. 거래 쿠키는 이 경로에만 보낸다.

| 경로                   | 메서드 | 용도                                                                 |
| ---------------------- | ------ | -------------------------------------------------------------------- |
| `/auth/naver/start`    | POST   | 로그인·연결 시작(`purpose`, `next`). 거래 생성 후 네이버로 이동      |
| `/auth/naver/callback` | GET    | 네이버 리다이렉트 URI(네이버 개발자센터 등록 변경 필요, 사용자 작업) |
| `/auth/naver/confirm`  | GET    | 메일 링크. 확인 화면만                                               |
| `/auth/naver/confirm`  | POST   | 메일 증명 소비                                                       |
| `/auth/naver/reauth`   | POST   | 다른 브라우저에서 재인증 시작                                        |
| `/auth/naver/resend`   | POST   | 메일 다시 보내기                                                     |
| `/auth/naver/finalize` | POST   | 가입·연결 확정                                                       |
| `/auth/naver/unlink`   | POST   | 연결 해제                                                            |

- 옛 `/api/auth/naver`, `/api/auth/naver/callback`은 계속 503이다.
- 거래 쿠키 `pl_naver_tx`:
  - 값: `거래 id.비밀값`
  - 속성: HttpOnly, Secure, SameSite=Lax, Path=`/auth/naver`, 만료 30분
- 서버에는 비밀값과 네이버 `state`의 해시만 저장한다(`browser_secret_hash`, `oauth_state_hash`).

### 5-4. 거래와 일회 소비

- 시작할 때마다 거래 행을 만든다.
- 모든 상태 변경은 SECURITY DEFINER 함수 안에서 아래 한 문장으로 한다. 결과 행이 없으면(다른 요청이 먼저 소비, 만료, 비밀값 불일치) 그 요청은 아무것도 하지 않고 일반 오류로 끝난다.

  ```sql
  update ... set state = :next
  where id = :id and state = :expected and expires_at > now()
    and browser_secret_hash = :hash
  returning *
  ```

- 콜백 소비는 여기에 `oauth_state_hash = :state_hash` 조건을 더한다.
- 쿠키를 지우는 것은 보조 조치다. 일회성은 이 조건부 UPDATE가 보장한다.

### 5-5. 네이버 콜백 (`started` → `naver_verified`)

1. 거래 쿠키 비밀값·네이버 `state`·예상 상태를 함께 확인하고 `naver_verified`로 소비한다. 활성 키 전부의 해시를 `naver_hashes`에 기록한다.
2. 목적별 처리:
   - **login, 신원 있음**(`naver_resolve`): `flow='login'`, `target_user_id` = 매핑된 회원. 세션 발급(5-6) 후 `completed`.
   - **login, 신원 없음**: 네이버 이메일이 없으면 가입 불가 안내 후 `failed`. 있으면 서버 전용 RPC `naver_find_user_by_email`(5-11)로 그 주소의 기존 계정 여부를 본다.
     - 없으면 `flow='signup'`.
     - 있으면 `flow='link_email'`, `target_user_id` = 그 계정. 그 계정에 이미 네이버 신원이 있으면 확정 단계에서 복구 모드 여부가 갈린다(5-8).
     - 어느 쪽이든 메일을 보내고 `email_sent`가 된다. 화면에는 똑같이 "네이버 계정의 이메일로 확인 메일을 보냈어요. 이 브라우저에서 메일을 열어 주세요"만 보여준다(열거 방지).
     - 메일 본문은 가입 확인 / 기존 계정 연결 요청으로 다르게 보내고, "직접 요청하지 않았다면 무시하세요"를 넣는다.
   - **link_session**: 시작 시 기록한 `session_user_id`와 현재 세션 회원이 같아야 한다. 다르거나 로그아웃 상태면 `failed`. 같으면 확인 화면으로 보내고 확정은 `/auth/naver/finalize`에서 한다.
   - **reauth**: 5-7 참고.

### 5-6. 세션 발급 (매핑된 회원 ID 확인)

1. `auth.admin.getUserById(target_user_id)`로 현재 계정을 읽는다.
   - 계정이 없거나, 정지(`banned_until`) 중이거나, 이메일이 없거나 미확인이거나, 이메일 변경 대기(`new_email`) 중이면 중단한다.
2. 그 계정의 **현재 이메일**로 로그인 링크를 서버 안에서만 만든다(메일 발송 없음). 네이버 응답이나 요청 파라미터의 이메일은 쓰지 않는다.
   - 발급 결과의 `user.id`가 `target_user_id`와 다르면 중단한다. 이 경합으로 계정이 새로 만들어졌다면 거래를 `failed`로 두고 5-10의 감사 대상으로 남긴다.
3. 세션을 저장하지 않는 별도 공개키 클라이언트로 `verifyOtp(token_hash)`를 한다.
   - 결과 세션의 `user.id`가 `target_user_id`와 다르면 그 세션을 즉시 로그아웃(revoke)하고 중단한다.
4. 두 확인을 통과한 경우에만, Google·카카오 콜백과 같은 방식으로 세션을 응답 쿠키에 담는다.
5. 관리자 클라이언트(서비스 역할)와 세션 검증 클라이언트(공개키)는 다른 인스턴스로 만들고, 둘 다 세션을 저장하지 않는다.

### 5-7. 메일 확인 (주체 결합)

- 메일 링크 `GET /auth/naver/confirm?t=...`는 확인 화면만 보여준다. 상태를 바꾸지 않는다.
- 화면의 "확인" 버튼이 `POST /auth/naver/confirm`을 보낸다. POST는 다음을 모두 만족해야 한다.
  - 거래 쿠키가 있고, 비밀값이 거래의 `browser_secret_hash`와 일치한다. 즉 네이버 인증을 한 그 브라우저여야 한다.
  - 메일 토큰 해시가 일치한다.
  - 지금 세션이 있다면 그 회원이 `target_user_id`와 같다(signup이면 세션이 없어야 한다). 다르면 중단한다.
  - 만족하면 `email_sent → email_verified`로 조건부 소비한다.
- **다른 브라우저에서 연 경우**(거래 쿠키 없음 또는 불일치)에는 "이 브라우저에서 네이버로 다시 인증" 버튼만 보여준다.
  - 누르면 `POST /auth/naver/reauth`가 `purpose='reauth'`, `parent_id` = 원래 거래로 자식 거래를 시작하고, 자식 비밀값을 쿠키로 준다.
  - 콜백에서 자식의 해시와 부모의 `naver_hashes`를 **같은 키 버전끼리** 비교한다. 공통 버전이 하나 이상 있고 그 버전들이 모두 같아야 일치다.
    - 공통 버전이 없으면(사이에 회전이 끝남) 부모를 `failed`로 두고 처음부터 다시 시작하게 한다.
    - 불일치면 부모를 `failed`로 둔다.
  - 일치하면 한 트랜잭션에서 부모의 `browser_secret_hash`를 새 비밀값 해시로 바꾸고(부모 상태가 `email_sent`일 때만) 자식을 `completed`로 둔다. 응답 쿠키를 `부모 id.새 비밀값`으로 바꾼다. 그다음 같은 POST 확인을 거친다.
- 효과: 공격자가 자기 네이버로 피해자 이메일을 지정해 시작해도, 피해자 브라우저에는 공격자 거래의 비밀값이 없다. 피해자가 재인증하면 피해자 네이버 ID라서 불일치하므로 연결되지 않는다.

### 5-8. 확정 (`/auth/naver/finalize`, `complete_naver_link`)

- **signup**:
  1. `email_verified → creating_user`로 소비한다.
  2. `auth.admin.createUser({ email, email_confirm: true, app_metadata: { naver_tx: 거래 id } })`를 비밀번호 없이 부른다. 메일 소유는 방금 증명됐다.
     - 같은 이메일 계정이 그사이 생겼으면 생성이 실패한다. 이때는 `failed`로 두고 "이미 계정이 있어요. 원래 방법으로 로그인한 뒤 연결해 주세요"라고 안내한다. 그 계정에 연결하지 않는다.
  3. 성공하면 `creating_user → user_created`로 바꾸고 `created_user_id`를 기록한다.
  4. `complete_naver_link`(아래)로 연결한 뒤 세션 발급(5-6).
- **link_email / link_session**: "이 계정에 네이버를 연결할까요?" 화면에서 POST로 확정하면 `complete_naver_link`를 부른다. link_email은 이어서 세션 발급(5-6), link_session은 세션이 이미 있다.

**`complete_naver_link(거래 id, 브라우저 비밀값 해시, 검증된 세션 회원 id 또는 null, 최근 인증 시각 또는 null)` — 한 DB 트랜잭션**

1. `naver_hash_keys` active 행 `FOR SHARE`. 거래의 `naver_hashes`가 active 버전 전부를 포함해야 한다.
2. 거래 행 `FOR UPDATE`. 비밀값 해시, 예상 상태(signup은 `user_created`, link_email은 `email_verified`, link_session은 `naver_verified`), 만료를 확인한다.
3. 대상 계정 확인(**최종 재검사, 2차 P1**):
   - 대상: signup은 `created_user_id`, 나머지는 `target_user_id`.
   - `auth.users` 대상 행을 `FOR SHARE`로 잠근 뒤 확인한다.
     - 삭제·정지 아님, `email_confirmed_at` 있음, 이메일 변경 대기(`email_change`) 없음.
     - signup·link_email: 현재 `email`(소문자)이 거래 `email`과 같다.
     - signup: `raw_app_meta_data->>'naver_tx'`가 이 거래 id다.
     - link_session: 함수 인수의 세션 회원 id가 `session_user_id`·대상과 같고, 최근 인증 시각이 10분 이내다(서버가 세션 JWT를 검증해 넘김).
   - 하나라도 어긋나면 거래를 `failed`로 두고 끝낸다. 연결 행도 세션도 없다.
4. 신원 처리:
   - 대상 계정에 신원이 없으면 **새 연결**: `naver_subjects` 행과 활성 버전 해시 행을 전부 넣는다. 해시 충돌(그 네이버 ID가 다른 계정에 있음)이면 롤백, `failed`.
   - 대상 계정에 신원이 있고 활성 버전 해시가 하나라도 있으면 거절(이미 네이버가 연결됨, 해제 후 다시 연결).
   - 대상 계정 신원에 활성 해시가 없으면(`needs_relink`) **복구**(2차 P2-1):
     - 그 신원 행을 `FOR UPDATE`로 잠근다.
     - 새 해시들이 다른 신원에 없어야 한다.
     - 은퇴 버전 해시 행을 지우고 새 활성 해시 행을 넣는다. 신원 행은 유지하고 `linked_via='recover'`로 바꾼다.
     - 경합한 복구 두 건은 신원 행 잠금으로 순서가 정해지고, 뒤에 온 쪽은 "활성 해시 있음"으로 거절된다.
     - 실패하면 롤백으로 기존 행이 그대로 남는다.
5. 이력(`linked` 또는 `recovered`)을 남기고 거래를 `completed`로 바꾼다.
6. 트랜잭션 밖에서 계정 이메일로 연결·복구 알림을 보낸다.

- **원자적 검증이 불가능하면 연결하지 않는다(3차 P1).**
  - 3단계의 `auth.users` 행 `FOR SHARE` 잠금을 이 함수가 얻을 수 없으면 함수는 거래를 `failed`로 두고 연결 행을 만들지 않는다. 커밋 후 다시 읽어 되돌리는 방식은 쓰지 않는다(커밋과 재검사 사이에 다른 로그인이 그 연결을 쓸 수 있고, 서버 중단·되돌리기 실패 시 잘못된 연결이 남기 때문).
  - 잠금 권한은 스테이징에서 확인한다. 권한이 없으면 signup·link_email·link_session 확정이 모두 거절되므로 B로는 네이버를 재개할 수 없다. 그때는 다른 원자적 방법(예: Supabase가 제공하는 권한 범위 안의 잠금 수단)을 찾기 전까지 재개를 보류한다.

### 5-9. 상태 전이 표

| 목적(purpose) | 흐름(flow)   | 전이                                                                                              | 필수 필드                                                        |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| login         | login        | started → naver_verified → completed                                                              | naver_hashes, target_user_id                                     |
| login         | signup       | started → naver_verified → email_sent → email_verified → creating_user → user_created → completed | naver_hashes, email, email_token_hash, created_user_id           |
| login         | link_email   | started → naver_verified → email_sent → email_verified → completed                                | naver_hashes, email, email_token_hash, target_user_id            |
| link_session  | link_session | started → naver_verified → completed                                                              | naver_hashes, session_user_id, target_user_id(= session_user_id) |
| reauth        | —            | started → completed(부모 비밀값 교체)                                                             | parent_id, naver_hashes                                          |

- 모든 미완료 상태 → `failed`(검사 실패) 또는 `expired`(정리 작업).
- 표에 없는 전이는 함수가 거절한다. 필수 필드는 해당 상태에 들어갈 때 CHECK 제약 또는 함수 검사로 강제한다.

### 5-10. 실패 복구

| 끊긴 지점                 | 상태                                    | 재시도                                                                                                                                                                                   |
| ------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 메일 발송 실패            | `naver_verified`                        | 같은 브라우저에서 `/auth/naver/resend`(요청 제한)                                                                                                                                        |
| `createUser` 호출 중 끊김 | `creating_user`, `created_user_id` 없음 | 같은 거래 재시도 시 `naver_find_user_by_email`로 조회한다. 반환된 `naver_tx`가 **이 거래 id**일 때만 그 계정을 이 거래 결과로 인정하고 `user_created`로 진행한다. 다른 계정이면 `failed` |
| 연결 실패                 | `user_created`                          | 재시도 시 `complete_naver_link`만 다시 실행                                                                                                                                              |
| 세션 발급 실패            | `completed`                             | 일반 네이버 로그인으로 다시 들어오면 된다                                                                                                                                                |
| 만료                      | 미완료 상태                             | 정리 작업이 `expired`로 바꿈                                                                                                                                                             |

- 감사 스크립트(읽기 전용)는 다음을 나열한다. 자동 삭제하지 않고 사람이 판단한다.
  - `app_metadata.naver_tx`가 있으나 신원이 없는 계정
  - 5-6에서 ID 불일치로 실패한 거래
  - `needs_relink` 신원 수

### 5-11. 서비스 역할 키 예외 범위 (승인 요청)

- 모듈 하나(`apps/web/lib/server/naverAuthAdmin.ts` 예정)만 서비스 역할 클라이언트를 만든다.
  - `/auth/naver/*` 라우트만 이 모듈을 가져올 수 있다. 소스 검사 테스트로 강제한다.
- 허용 Auth 작업은 `getUserById`, `createUser`(5-8 조건), `generateLink`(magiclink, 5-6 조건)뿐이다. `listUsers` 같은 넓은 조회는 쓰지 않는다.
- 허용 DB 작업은 아래 SECURITY DEFINER 함수 호출뿐이다. 테이블 직접 쓰기와 다른 테이블 접근은 하지 않는다. 모두 EXECUTE는 `service_role`에만 준다.
  - 거래: `naver_tx_start`, `naver_tx_advance`(5-4 조건부 전이), `naver_tx_reauth_swap`
  - 신원: `naver_resolve`, `complete_naver_link`, `naver_unlink`
  - 조회: `naver_find_user_by_email(email)` → `user_id`, `naver_tx`만 반환(이메일 정확히 일치 1건, 다른 필드 없음)
- 로그에는 거래 id와 상태 전이만 남긴다. 이메일, 네이버 ID, 해시, 토큰, 링크, 비밀값은 남기지 않는다.

### 5-12. 앱

- 풀스크린 웹뷰 안에서 같은 웹 흐름을 탄다. 앱으로는 기존 세션 브릿지로 전달한다. 커스텀 스킴으로 토큰을 보내는 길은 만들지 않는다.
- 메일 확인을 앱 밖 브라우저에서 열면 "다른 브라우저" 경로(5-7 재인증)로 처리된다.
- 네이버의 웹뷰 로그인 허용 여부는 실기기에서 확인한다.

### 5-13. 세션 저장

- "URL로 토큰 전달 금지"와 "HttpOnly 세션"은 다르다.
- 지금 웹은 `@supabase/ssr` 쿠키를 브라우저 JS가 읽는 구조이고, 네이버도 Google·카카오와 같은 구조를 쓴다.
- 거래 쿠키(`pl_naver_tx`)만 HttpOnly다. 세션을 HttpOnly 전용으로 바꾸는 것은 이 범위 밖이다(BFF 전환·앱 브릿지 변경 필요).

### 5-14. 연결 해제

- `POST /auth/naver/unlink`. 최근 인증과 CSRF 토큰을 요구하고, 다른 로그인 방법이 하나 이상 남을 때만 허용한다.
- `naver_unlink`가 신원 행과 해시 행을 지우고 `unlinked` 이력을 남긴다. 계정 이메일로 알림을 보낸다.

## 6. 레거시 조사 후보 4개

- 4개는 **조사 후보**다. 피해 여부와 지금도 파생 비밀번호가 걸려 있는지는 확인되지 않았다.
- 파생값을 계산하거나 현재 비밀번호와 대조하는 절차는 만들지 않는다.
- 자동 연결하지 않는다. `user_metadata`는 근거가 못 된다.
- 조치 순서(모두 운영 작업, 단계별 승인):
  1. 승인된 Auth 감사로 계정별 비밀번호 변경 시각·세션 잔존을 확인한다(사용 가능한 공식 로그 범위 안에서).
  2. 감사로 의심이 확인된 계정만, 원래 로그인 수단으로 소유를 증명받은 뒤 계정별 조치(해당 세션 종료, 정상 비밀번호 재설정 안내)를 정한다. 일괄 비밀번호 변경은 하지 않는다.
  3. 네이버 Client Secret 교체:
     - 옛 배포는 빌드 당시 환경값을 쓰므로, 교체하면 옛 배포가 네이버 토큰 교환을 끝내지 못하게 된다.
     - 이미 설정된 Auth 비밀번호나 발급된 세션은 무효화하지 않는다.
     - 이전 Secret은 과거 배포·보관본에 남을 수 있으므로 비밀번호 무효화 수단으로 기대하지 않는다.
- 재개 후 이 회원들은 네이버 로그인 시 `link_email`(5-7·5-8)로 메일 소유와 네이버를 같은 거래에서 증명해 연결한다.

## 7. 공용 콜백 URL 토큰 수신 — 네이버와 별개로 우선 수정

- 대상 코드: [auth/callback/route.ts](../apps/web/app/auth/callback/route.ts)의 `access_token`/`refresh_token` → `setSession` 분기.
- 위험: 공격자가 자기 토큰 쌍을 넣은 주소를 열게 하면 피해자 브라우저가 공격자 계정으로 로그인된다(로그인 CSRF).
- 제안(별도 브랜치·별도 승인):
  1. 이 분기를 누가 부르는지 확인한다(웹·앱 현재 버전·구버전).
  2. 웹은 PKCE `code` 교환만 남기고 URL 토큰 수신을 제거한다.
  3. 앱 호환이 필요하면 앱이 시작한 거래와 결합한 일회 코드 교환으로 바꾼다. User-Agent나 경로 제한으로 대신하지 않는다. 지원하지 않는 구버전은 업데이트 안내로 처리한다.
  4. 같은 수정에서 `?msg=` 오류 원문 노출도 일반 문구로 바꾼다.
  5. 계정이 바뀌는 경우 대기 중인 행동(PendingActionRunner)이 다른 계정으로 실행되지 않는지 검사한다.

## 8. 기능 플래그

- B:
  - 서버 환경변수 `NAVER_LOGIN_ENABLED`(기본 꺼짐)를 모든 `/auth/naver/*` 라우트가 매 요청 확인한다.
  - 꺼져 있으면 지금과 같은 503을 낸다. 진행 중인 거래도 다음 단계에서 503으로 멈춘다.
  - 기존 세션은 플래그와 무관하다.
  - 적용 지연은 Vercel 환경변수 변경 후 재배포까지다(즉시 차단이 필요하면 재배포).
- A: 웹 플래그만으로는 Supabase authorize 직접 진입을 막지 못한다. 차단은 Supabase 대시보드에서 제공자를 끄는 것이고, 이는 사용자 작업이다.
- 옛 배포는 플래그를 따르지 않는다. 재개 전 정리 또는 Client Secret 교체(6장)가 필요하다.

## 9. 진행 단계

| 단계 | 내용                                                                                                                    | 누가                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 0    | 7장 공용 콜백 수정 착수 여부 결정                                                                                       | 사용자               |
| 1    | 운영과 분리된 스테이징 Supabase 준비(Preview는 운영 DB 사용)                                                            | 사용자               |
| 2    | 스테이징에서 A 입증 시험(4장 조건), `auth.users` 잠금 권한 확인(5-8, 없으면 B 재개 보류) → A/B 결정                     | 사용자 + Claude 정리 |
| 3    | 마이그레이션 SQL(미적용), PGlite 테스트                                                                                 | Claude               |
| 4    | 구현(플래그 꺼짐), 계정 관리 "연결된 로그인"                                                                            | Claude, Codex 검토   |
| 5    | 네이버 개발자센터에 새 콜백 주소 등록, 스테이징에서 실제 네이버 계정·웹뷰·메일 흐름 확인                                | 사용자               |
| 6    | 레거시 감사·조치(6장) → Client Secret 교체·옛 배포 정리 → 마이그레이션 적용·V1 키 등록 → 배포 → 플래그 켜기 → 운영 확인 | 사용자(단계별 승인)  |

되돌리기: 플래그를 끄면 503 상태로 돌아간다. 테이블은 남아도 쓰이지 않는다.

## 10. 검사 항목

- **주체 결합**: 공격자 브라우저에서 시작한 가입·연결 메일을 피해자 브라우저에서 열어도 공격자 네이버가 연결되지 않음
  - 링크 전달
  - 재인증 불일치, 재인증 사이 키 회전(공통 버전 없음 → 재시작)
  - 세션 전환(다른 회원으로 로그인된 브라우저)
  - 메일 스캐너 GET(상태 변화 0건)
  - 만료·재사용
- **최종 재검사(2차 P1)**: 아래 상황에서 연결 행·세션 0건
  - 확인 화면을 연 뒤 계정 이메일 변경 완료
  - 확인 POST와 이메일 변경 동시 진행
  - 확인 화면 이후 정지·이메일 미확인 상태로 바뀜
  - link_session에서 최종 요청 시 세션 회원 변경, 최근 인증 만료
  - 잠금을 얻지 못하는 구성: 모든 확정이 거절되고 연결 행 0건
- **세션 대상**: 아래 상황에서 잘못된 계정의 세션 쿠키 0건
  - 계정 이메일 변경 대기
  - 이메일 변경 후 옛 이메일이 다른 계정에 재사용됨
  - 계정 삭제
  - 발급 결과 ID 불일치
  - OTP 검증 ID 불일치
- **키 버전(2차 P2)**:
  - V1·V2 활성 중 같은 네이버 ID로 두 계정 동시 연결 → 1건만 성공
  - V2 활성화 후 V1만 보낸 요청 → 거절
  - V1 해시만 있는 신원으로 로그인 → V2 해시 추가, 다른 신원과 충돌 시 멈춤
  - V1 은퇴 후 `needs_relink` 신원의 link_email 복구 → 성공, 신원 행 유지, 은퇴 해시 제거
  - 복구 대상이 아닌 계정(활성 해시 있음) → 거절, 다른 계정 연결 덮어쓰기 0건
  - 경합한 복구 2건 → 1건만 성공, 실패 시 기존 행 보존
  - 오래된 거래 재개(회전 전 시작) → 거절
- **일회 소비**: 같은 거래의 동시 요청 2건 → 1건만 진행
- **부분 실패**: 5-10 각 지점에서 끊고 재시도 → 중복 연결·잘못된 세션 0건, `naver_tx` 불일치 계정 미채택
- **이메일 충돌**: 세션 발급 0건, 비밀번호·메타데이터 변경 0건, 화면 응답 동일(열거 방지)
- **state·거래 쿠키**: 누락·불일치·만료 → 거절, 쿠키가 `/auth/naver/*` 밖으로 전송되지 않음
- **연결 해제**: 유일한 로그인 수단이면 거절, GET으로는 불가
- **외부 요청**: 네이버 지연 시 10초 후 일반 오류
- **노출 점검**: 응답·리다이렉트·로그에 토큰·링크·해시·오류 원문 0건, `no-store`
- **플래그**: 꺼지면 모든 경로 503(기존 [naver-emergency-stop.test.ts](../scripts/security/naver-emergency-stop.test.ts) 유지), 진행 중 거래 중단
- **모듈 경계**: 서비스 역할 모듈을 `/auth/naver/*` 밖에서 가져오면 실패
- **로그인 이후 흐름**: 네이버 가입 후 찜 합치기·하려던 행동 이어서 하기 동작

## 11. 결정이 필요한 것

1. 7장 공용 콜백 수정을 먼저 별도 작업으로 진행할지.
2. 스테이징 Supabase 프로젝트 준비(A 입증, `auth.users` 잠금 권한, B 확인 모두 필요).
3. B로 갈 경우 5-11 범위의 서비스 역할 키 예외 승인.
4. 새 가입 시 메일 확인 단계 수용(빼면 남의 이메일 선점 위험).
5. 레거시 감사·Client Secret 교체·옛 배포 정리 시점.
