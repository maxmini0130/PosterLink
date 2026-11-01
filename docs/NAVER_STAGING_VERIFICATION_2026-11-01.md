# 네이버 로그인 스테이징 확인 절차 (2026-11-01)

대상: `feat/naver-identity-b-20261101`의 마이그레이션 `20261101030000_add_naver_identity.sql`과 `/auth/naver/*` 경로. 설계는 [NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md](NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md)를 따릅니다.

로컬 PGlite는 연결이 하나뿐이라 잠금 대기·교착·한도 경합을 실제로 일으킬 수 없습니다. 이 문서는 그 확인을 **운영과 분리된 스테이징 Supabase**에서 하는 절차입니다.

> **운영 프로젝트에서 실행하지 않습니다.** Preview 배포도 운영 DB를 쓰므로 이 절차에 쓰지 않습니다. 각 세션을 열면 0-2의 확인부터 합니다.

## 0. 준비

### 0-1. 스테이징 프로젝트

1. 운영과 다른 Supabase 프로젝트를 만듭니다.
2. 저장소의 마이그레이션을 순서대로 적용합니다. 이 브랜치 기준 마지막 세 개는 다음과 같습니다.
   - `20261101010000_add_favorite_user_status.sql`
   - `20261101020000_add_user_visit_state.sql`
   - `20261101030000_add_naver_identity.sql`
3. 대시보드 Authentication → Users에서 이메일 확인을 마친 시험 계정 2개(A, B)를 만듭니다. 이메일·비밀번호로 만들면 `auth.identities` 행이 생겨 연결 해제 조건(다른 로그인 수단)을 만족합니다.
4. 해시 키 버전 1을 등록합니다. 키 표는 반드시 잠근 뒤 바꿉니다.

   ```sql
   BEGIN;
   LOCK TABLE public.naver_hash_keys IN SHARE ROW EXCLUSIVE MODE;
   INSERT INTO public.naver_hash_keys (version, status) VALUES (1, 'active');
   COMMIT;
   ```

### 0-2. 세션을 열 때마다

동시 실행 시험은 **터미널 두 개에서 `psql`로** 합니다(대시보드 SQL 편집기는 문장마다 트랜잭션을 끝내므로 잠금을 붙잡아 둘 수 없습니다). 접속 문자열은 스테이징 프로젝트의 Settings → Database에서 가져오고, 문서·로그에 남기지 않습니다.

```sql
-- 스테이징인지 확인: 운영 프로젝트 ref가 아니어야 합니다.
SELECT current_database(), current_user, now();
```

```sql
-- 시험 값(가짜 해시)과 시험 계정. A, B는 0-1에서 만든 계정 id로 바꿉니다.
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
SELECT encode(sha256('stg-secret-1'::bytea), 'hex') AS sec,
       encode(sha256('stg-secret-2'::bytea), 'hex') AS sec2,
       encode(sha256('stg-state-1'::bytea), 'hex')  AS st,
       encode(sha256('stg-client-1'::bytea), 'hex') AS cli,
       encode(sha256('stg-client-2'::bytea), 'hex') AS cli2,
       encode(sha256('stg-naver-x'::bytea), 'hex')  AS hx
\gset
```

서버가 쓰는 권한과 같게 `service_role`로 실행합니다. 세션마다 한 번:

```sql
SET ROLE service_role;
```

`SET ROLE`이 거부되면 그 결과를 보고하고, `postgres`로 이어서 실행합니다. 그 경우 2장의 잠금 동작 확인은 유효하지만 1-3의 권한 결과는 별도로 봐야 합니다.

같은 클라이언트 키(`cli`)로 10분에 20번 넘게 시작하면 `naver_tx_start`가 `NULL`을 돌려줍니다(시작 한도). 준비를 여러 번 반복하다 `NULL`이 나오면 `\set cli` 값을 바꾸거나 10분 기다립니다.

## 1. 권한 확인

### 1-1. 계정 행 잠금 권한 (가장 먼저)

`complete_naver_link`는 `auth.users` 행을 `FOR SHARE`로 잠그지 못하면 연결을 거절합니다(설계 5-8). 이 권한이 없으면 B 방식으로는 재개할 수 없습니다.

```sql
RESET ROLE;
SELECT pg_get_userbyid(proowner) AS owner
  FROM pg_proc WHERE proname = 'complete_naver_link';
-- 'postgres' 자리에 위에서 나온 owner를 넣습니다(보통 postgres):
SELECT has_table_privilege('postgres', 'auth.users', 'UPDATE') AS can_lock;
SET ROLE service_role;
```

- 기대: `can_lock = true`.
- `false`이면 여기서 멈추고 보고합니다. 연결이 모두 거절되므로 재개할 수 없고, 다른 원자적 방법을 찾아야 합니다.

### 1-2. 실제 연결 한 번 (권한 확인의 대조)

```sql
SELECT naver_tx_start('link_session', :'sec', :'st', :'cli', :'A') AS tx \gset
SELECT * FROM naver_tx_callback(:'tx', :'sec', :'st', jsonb_build_object('1', :'hx'));
SELECT complete_naver_link(:'tx', :'sec', :'A', now());
```

- 기대: 마지막 결과가 A의 id.
- `NULL`이고 거래 상태가 `failed`라면 잠금 권한 문제를 의심합니다. 상태는 `RESET ROLE` 뒤 `SELECT state FROM naver_auth_transactions WHERE id = :'tx';`로 봅니다.
- 다음 시험을 위해 연결을 지웁니다: `SELECT naver_unlink(:'A');` → `true`.

### 1-3. API 역할 권한

```sql
RESET ROLE;
SELECT r.role, t.tbl,
       has_table_privilege(r.role, t.tbl, 'SELECT,INSERT,UPDATE,DELETE') AS any_table_right
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role),
       (VALUES ('public.naver_hash_keys'), ('public.naver_subjects'), ('public.naver_subject_hashes'),
               ('public.naver_identity_events'), ('public.naver_auth_transactions')) t(tbl);
SELECT has_sequence_privilege('service_role', 'public.naver_identity_events_id_seq', 'USAGE');
SELECT f, has_function_privilege('service_role', f, 'EXECUTE')
  FROM unnest(ARRAY[
    'public._naver_active_versions()', 'public._naver_resolve(jsonb, smallint[])',
    'public._naver_lock_subjects(jsonb, uuid, boolean)',
    'public.naver_tx_start(text, text, text, text, uuid, uuid)',
    'public.complete_naver_link(uuid, text, uuid, timestamptz)',
    'public.naver_unlink(uuid)']) f;
SELECT has_function_privilege('authenticated', 'public.my_login_methods()', 'EXECUTE');
SET ROLE service_role;
```

기대:

- 표 권한은 15줄 모두 `false`이고, 시퀀스 권한도 `false`입니다.
- 함수 실행 권한은 `_naver_*` 내부 함수 3개가 `false`, 나머지는 `true`입니다.
- `my_login_methods`는 `true`입니다.

## 2. 동시 실행 시험

각 시험은 **세션 1**과 **세션 2**를 번갈아 실행합니다. 공통 기대는 다음과 같습니다.

- `deadlock detected` 오류가 한 번도 나오지 않습니다.
- 기다리는 쪽은 상대가 `COMMIT`할 때까지 멈춰 있다가 이어서 끝납니다.

### 시험용 연결·로그인 만들기 (각 시험 전, 세션 1)

```sql
-- X를 A에 연결
SELECT naver_tx_start('link_session', :'sec', :'st', :'cli', :'A') AS ltx \gset
SELECT * FROM naver_tx_callback(:'ltx', :'sec', :'st', jsonb_build_object('1', :'hx'));
SELECT complete_naver_link(:'ltx', :'sec', :'A', now());            -- A
-- X로 로그인 거래를 A까지 해석
SELECT naver_tx_start('login', :'sec', :'st', :'cli') AS tx \gset
SELECT * FROM naver_tx_callback(:'tx', :'sec', :'st', jsonb_build_object('1', :'hx'));  -- target A
```

세션 2에서도 같은 `\set`·`\gset` 값을 쓰려면 `\set tx '<세션 1에서 나온 id>'`처럼 거래 id를 옮겨 적습니다.

### 2-1. 로그인 완료가 먼저 잠근 경우 → 해제는 기다림

| 순서 | 세션 1                                                          | 세션 2                                  |
| ---- | --------------------------------------------------------------- | --------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role;`                           |                                         |
| 2    | `SELECT naver_tx_complete_login(:'tx', :'sec', :'A');` → `true` |                                         |
| 3    |                                                                 | `SELECT naver_unlink(:'A');` → **멈춤** |
| 4    | `COMMIT;`                                                       | → `true`                                |
| 5    | `SELECT naver_tx_still_linked(:'tx', :'sec', :'A');` → `false`  |                                         |

마지막 줄은 "완료 뒤 해제되면 앱이 새 세션을 로그아웃한다"는 경로의 근거입니다.

### 2-2. 해제가 먼저 잠근 경우 → 로그인 완료는 기다렸다가 거절

연결·로그인을 다시 만든 뒤:

| 순서 | 세션 1                                                            | 세션 2                                |
| ---- | ----------------------------------------------------------------- | ------------------------------------- |
| 1    |                                                                   | `BEGIN; SET LOCAL ROLE service_role;` |
| 2    |                                                                   | `SELECT naver_unlink(:'A');` → `true` |
| 3    | `SELECT naver_tx_complete_login(:'tx', :'sec', :'A');` → **멈춤** |                                       |
| 4    |                                                                   | `COMMIT;`                             |
| 5    | → `false`                                                         |                                       |

확인: `RESET ROLE; SELECT state FROM naver_auth_transactions WHERE id = :'tx';` → `failed`.

### 2-3. 같은 네이버 ID를 두 계정에 동시에 연결 → 하나만 성공

연결이 없는 상태에서 거래 두 개를 만듭니다.

```sql
SELECT naver_tx_start('link_session', :'sec', :'st', :'cli', :'A') AS ta \gset
SELECT * FROM naver_tx_callback(:'ta', :'sec', :'st', jsonb_build_object('1', :'hx'));
SELECT naver_tx_start('link_session', :'sec2', :'st', :'cli2', :'B') AS tb \gset
SELECT * FROM naver_tx_callback(:'tb', :'sec2', :'st', jsonb_build_object('1', :'hx'));
```

| 순서 | 세션 1                                                        | 세션 2                                                                |
| ---- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role;`                         |                                                                       |
| 2    | `SELECT complete_naver_link(:'ta', :'sec', :'A', now());` → A |                                                                       |
| 3    |                                                               | `SELECT complete_naver_link(:'tb', :'sec2', :'B', now());` → **멈춤** |
| 4    | `COMMIT;`                                                     | → `NULL`                                                              |

확인: `naver_subjects`에 A 한 행만 있고, `tb`는 `failed`입니다.

### 2-4. 전체 시작 한도(1분 600건)가 서로 다른 주소에서도 정확함

```sql
RESET ROLE;
DELETE FROM naver_auth_transactions;   -- 스테이징 시험 데이터만
INSERT INTO naver_auth_transactions (purpose, browser_secret_hash, oauth_state_hash, expires_at)
SELECT 'login', :'sec', :'st', now() + interval '30 minutes' FROM generate_series(1, 599);
SET ROLE service_role;
```

| 순서 | 세션 1                                                                 | 세션 2                                                                |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role;`                                  |                                                                       |
| 2    | `SELECT naver_tx_start('login', :'sec', :'st', :'cli');` → id(600번째) |                                                                       |
| 3    |                                                                        | `SELECT naver_tx_start('login', :'sec2', :'st', :'cli2');` → **멈춤** |
| 4    | `COMMIT;`                                                              | → `NULL`                                                              |

확인: `SELECT count(*) FROM naver_auth_transactions WHERE created_at > now() - interval '1 minute';` → 600. 시험 후 `DELETE FROM naver_auth_transactions;`.

### 2-5. 키 회전은 진행 중인 처리를 기다리고, 이후 처리는 새 키를 요구함

| 순서 | 세션 1                                                               | 세션 2                                                                                                                                             |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role;`                                |                                                                                                                                                    |
| 2    | 새 로그인 거래로 `SELECT * FROM naver_tx_callback(...);`             |                                                                                                                                                    |
| 3    |                                                                      | `RESET ROLE; BEGIN; LOCK TABLE public.naver_hash_keys IN SHARE ROW EXCLUSIVE MODE;` → **멈춤** (`service_role`은 키 표 권한이 없으므로 postgres로) |
| 4    | `COMMIT;`                                                            | → 잠금 획득                                                                                                                                        |
| 5    |                                                                      | `INSERT INTO naver_hash_keys VALUES (2, 'active', now(), NULL); COMMIT;`                                                                           |
| 6    | V1 해시만으로 새 거래 `naver_tx_callback` → 결과 없음, 거래 `failed` |                                                                                                                                                    |

시험 후 V2 행을 지웁니다. 운영 키 회전은 별도 승인 절차를 따릅니다.

## 3. 앱 흐름 확인

스테이징 DB를 가리키는 앱(로컬 `next start` + 스테이징 환경값, 또는 스테이징 전용 배포)에서 합니다.

1. 환경값을 설정합니다.
   - `NAVER_LOGIN_ENABLED=true`, `NEXT_PUBLIC_NAVER_LOGIN_ENABLED=true`
   - `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET`: 시험용 네이버 앱 값
   - `NAVER_ID_HASH_KEY_V1`: 32자 이상, 운영과 다른 값
   - Supabase URL·키: 스테이징 값
2. 네이버 개발자센터 시험용 앱에 콜백 주소 `<앱 주소>/auth/naver/callback`을 등록합니다.
3. 차례대로 확인합니다.

| 항목                                                   | 기대                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| 계정 A로 로그인 후 10분 안에 프로필 수정 → 네이버 연결 | 네이버 → 연결 확인 화면 → "연결했어요", 연결된 로그인에 "연결됨" |
| 로그아웃 → 로그인 화면 "네이버로 로그인"               | A로 로그인, 원래 가려던 곳으로 이동                              |
| 연결 안 된 네이버 계정으로 로그인                      | "연결된 PosterLink 계정이 없습니다" 안내, 로그인 안 됨           |
| 로그인 11분 뒤 연결·해제 시도                          | "다시 로그인한 다음 10분 안에" 안내                              |
| 연결 해제 → 같은 네이버로 로그인                       | 연결 없음 안내                                                   |
| 같은 주소에서 시작 요청 21번(아래 명령)                | 21번째는 `/login?error=naver_busy`로 이동, 거래 20건             |
| 앱(WebView)에서 위 연결·로그인                         | 웹과 같음, 앱으로 세션 전달                                      |

```bash
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{redirect_url}\n" -X POST \
    -H "Origin: <앱 주소>" -d "purpose=login" "<앱 주소>/auth/naver/start"
done
```

## 4. 정리와 보고

- 시험 데이터를 지웁니다: `DELETE FROM naver_auth_transactions; DELETE FROM naver_subjects; DELETE FROM naver_identity_events;`(postgres로, 스테이징에서만).
- 보고에 넣을 것: 1-1 결과(`can_lock`), 1-3 권한 표, 2-1~2-5 각 결과와 `deadlock detected` 발생 여부, 3의 표.
- 1-1이 `false`이거나 2장에서 교착이 나오면 운영 재개 절차로 넘어가지 않습니다.
