# 네이버 로그인 스테이징 확인 절차 (2026-11-01)

대상: `feat/naver-identity-b-20261101`의 마이그레이션 `20261101030000_add_naver_identity.sql`과 `/auth/naver/*` 경로. 설계는 [NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md](NAVER_LOGIN_SECURITY_DESIGN_2026-11-01.md)를 따릅니다.

로컬 PGlite는 연결이 하나뿐이라 잠금 대기·교착·한도 경합을 실제로 일으킬 수 없습니다. 이 문서는 그 확인을 **운영과 분리된 스테이징 Supabase**에서 `psql` 두 개로 하는 절차입니다.

> **운영 프로젝트에서 실행하지 않습니다.** Preview 배포도 운영 DB를 쓰므로 쓰지 않습니다.
>
> - 쓰기는 모두 [check_target.sql](../scripts/staging/naver/check_target.sql)로 **바로 그 순간의 접속**을 다시 확인한 뒤 `\if :target_ok` 안에서만 실행합니다. 이전 확인 결과는 믿지 않습니다.
> - psql 안에서 `\connect`로 다른 DB에 다시 붙지 않습니다. 다른 곳에 붙어야 하면 psql을 끝내고 새로 엽니다.

## 0. 세션 규칙

### 0-1. 접속

- **연결 방식:** 직접 연결(`db.<ref>.supabase.co:5432`) 또는 세션 풀러(사용자 `postgres.<ref>`, 포트 5432)만 씁니다. 트랜잭션 풀러(6543)는 세션 상태와 잠금을 붙잡지 못해 쓰지 않습니다. session.sql도 6543이면 멈춥니다.
- **접속 문자열:** 스테이징 Settings → Database에서 가져오고, 문서·로그·화면 공유에 남기지 않습니다.
- **두 세션:** 두 터미널에서 같은 값으로 엽니다(`RUN`도 같게).

```bash
psql "$STAGING_DSN" -v STAGING_REF=<스테이징 ref> -v PROD_REF=<운영 ref> \
     -v A=<시험 계정 A id> -v B=<시험 계정 B id> -v RUN=<이번 실행 이름, 예: run1>
```

```sql
\i scripts/staging/naver/session.sql
```

session.sql이 하는 일:

- **접속 대상 확인(check_target.sql):** psql이 지금 쓰는 접속 호스트·사용자·포트로 프로젝트를 확인합니다(`current_database()`는 모든 프로젝트에서 `postgres`라 근거가 되지 않습니다).
  - 기대한 스테이징 ref와 맞지 않거나, 운영 ref가 보이거나, 트랜잭션 풀러이거나, 값이 빠졌거나 A·B가 자리표시 값이면 `target_ok`가 거짓이 되고, 오류로 스크립트를 멈춥니다. 아무것도 쓰지 않습니다.
  - 통과하면 `target OK: <호스트> <사용자> <포트>`가 나옵니다. 이 줄이 안 보이면 진행하지 않고 psql을 끝냅니다.
  - psql은 `\i`로 실행한 파일 안의 `\quit`을 그 파일만 끝내는 것으로 처리하므로, 이 확인은 `\quit`에 기대지 않고 `\if :target_ok`로 쓰기를 막습니다.
- **시간 제한:** `statement_timeout`과 `lock_timeout`을 설정합니다. 아래 "멈춤" 단계는 상대 세션에서 **2분 안에** 커밋해야 합니다.
- **시험 계정 확인:** A·B가 이메일 확인을 마친 계정인지 보고, 이메일을 보여 줍니다. 시험 계정이 맞는지 눈으로 확인합니다.
- **이번 실행 값:** 거래 state 해시 `:st`, 네이버 ID 해시 `:hx`, 단계별 비밀값 `:s1`~`:s6`, 클라이언트 키 `:c1`~`:c6`를 만듭니다.
- **연결 번호:** `backend` 번호를 보여 줍니다. 두 세션의 번호가 달라야 서로 다른 연결입니다.

### 0-2. 역할과 오류

- **기본 역할:** 세션은 `postgres`로 둡니다. 조회·정리는 이 역할로 합니다.
- **API 호출:** 서버와 같은 권한인 `service_role`로 실행하되, 항상 트랜잭션 안에서만 바꿉니다.

  ```sql
  BEGIN; SET LOCAL ROLE service_role; <함수 호출>; COMMIT;
  ```

  `SET LOCAL ROLE`이 거부되면 결과를 보고하고 멈춥니다(`postgres`로 대신 실행한 결과는 API 역할 시험으로 인정하지 않습니다).

- **오류가 나면:** 그 세션에서 `ROLLBACK;`부터 실행합니다. 열린 트랜잭션을 남기지 않습니다.

### 0-3. 정리

- 이번 실행이 만든 데이터만 지웁니다: [cleanup.sql](../scripts/staging/naver/cleanup.sql)은 `:st`가 붙은 거래와 A·B의 연결·이력만 삭제합니다. 다른 사람의 스테이징 데이터는 건드리지 않습니다.
- cleanup.sql도 삭제 직전에 check_target.sql로 현재 접속을 다시 확인하고, `\if :target_ok` 안에서만 지웁니다.
- 각 시험 전에 정리합니다.

  ```sql
  \i scripts/staging/naver/cleanup.sql
  ```

## 1. 준비와 권한

### 1-1. 마이그레이션과 키 (한 번)

1. 세션 1에서 session.sql 통과(`target OK` 줄)를 확인한 **뒤에** 같은 `$STAGING_DSN`으로 마이그레이션을 적용합니다. 예: `supabase db push --db-url "$STAGING_DSN"`. 이 브랜치 기준 마지막 세 개는 다음과 같습니다.
   - `20261101010000_add_favorite_user_status.sql`
   - `20261101020000_add_user_visit_state.sql`
   - `20261101030000_add_naver_identity.sql`
2. 키 버전 1을 등록합니다(세션 1, postgres).

   ```sql
   \i scripts/staging/naver/check_target.sql
   \if :target_ok
   BEGIN;
   LOCK TABLE public.naver_hash_keys IN SHARE ROW EXCLUSIVE MODE;
   INSERT INTO public.naver_hash_keys (version, status) VALUES (1, 'active') ON CONFLICT (version) DO NOTHING;
   COMMIT;
   \endif
   SELECT * FROM public.naver_hash_keys;
   ```

### 1-2. 계정 행 잠금 (참고값)

`complete_naver_link`는 `auth.users` 행을 `FOR SHARE`로 잠그지 못하면 연결을 거절합니다(설계 5-8). 잠금에는 SELECT 권한과 **한 컬럼 이상**의 UPDATE 권한이면 충분하므로, 테이블 UPDATE 권한만 보고 판단하지 않습니다. 아래는 참고값이고, **진행 여부는 1-3의 실제 연결로 정합니다.**

```sql
SELECT pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p
 WHERE p.oid = 'public.complete_naver_link(uuid, text, uuid, timestamptz)'::regprocedure
\gset
SELECT :'owner' AS owner,
       has_table_privilege(:'owner', 'auth.users', 'SELECT') AS can_select,
       has_table_privilege(:'owner', 'auth.users', 'UPDATE') AS table_update,
       has_any_column_privilege(:'owner', 'auth.users', 'UPDATE') AS any_column_update;
```

### 1-3. 실제 연결 (진행 여부 판정)

```sql
\i scripts/staging/naver/cleanup.sql
\if :target_ok
BEGIN; SET LOCAL ROLE service_role;
SELECT naver_tx_start('link_session', :'s1', :'st', :'c1', :'A') AS ltx \gset
SELECT * FROM naver_tx_callback(:'ltx', :'s1', :'st', jsonb_build_object('1', :'hx'));
SELECT complete_naver_link(:'ltx', :'s1', :'A', now()) AS linked \gset
COMMIT;
\endif
\echo linked = :linked
SELECT state FROM naver_auth_transactions WHERE id = :'ltx';
```

| 결과                                | 판단                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `linked`가 A의 id, 상태 `completed` | 잠금·연결 정상. 다음으로                                                                                                        |
| `linked`가 비어 있고 상태 `failed`  | A가 이메일 확인·변경 없음 상태인지 다시 본다(session.sql이 확인함). 그래도 실패면 **잠금 불가로 보고 멈춤**(1-2 값을 함께 보고) |

### 1-4. API 역할 권한

postgres로 조회합니다(역할 이름을 지정해 묻는 것이라 이 조회 자체는 유효합니다).

```sql
SELECT r.role, t.tbl,
       has_table_privilege(r.role, t.tbl, 'SELECT,INSERT,UPDATE,DELETE') AS any_table_right
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role),
       (VALUES ('public.naver_hash_keys'), ('public.naver_subjects'), ('public.naver_subject_hashes'),
               ('public.naver_identity_events'), ('public.naver_auth_transactions')) t(tbl);
SELECT has_sequence_privilege('service_role', 'public.naver_identity_events_id_seq', 'USAGE') AS seq_right;
SELECT f, has_function_privilege('service_role', f, 'EXECUTE') AS can_execute
  FROM unnest(ARRAY[
    'public._naver_active_versions()', 'public._naver_resolve(jsonb, smallint[])',
    'public._naver_lock_subjects(jsonb, uuid, boolean)',
    'public.naver_tx_start(text, text, text, text, uuid, uuid)',
    'public.complete_naver_link(uuid, text, uuid, timestamptz)',
    'public.naver_unlink(uuid)']) f;
SELECT has_function_privilege('authenticated', 'public.my_login_methods()', 'EXECUTE') AS members_read;
```

기대:

- 표 권한은 15줄 모두 `false`이고, `seq_right`도 `false`입니다.
- `_naver_*` 3개는 `false`, 나머지 3개는 `true`입니다.
- `members_read`는 `true`입니다.

실제 역할로도 한 번 확인합니다(거절되어야 정상).

```sql
BEGIN; SET LOCAL ROLE service_role; SELECT count(*) FROM naver_subjects; ROLLBACK;
```

`permission denied`가 나오면 정상입니다. 오류 뒤에는 `ROLLBACK;`이 이미 실행된 상태인지 확인합니다.

## 2. 동시 실행 시험

공통:

- 각 시험은 **세션 1**과 **세션 2**를 표 순서대로 번갈아 실행합니다.
- `deadlock detected` 오류가 한 번도 나오지 않아야 합니다.
- "멈춤"은 상대가 커밋하면 이어서 끝나야 합니다. 2분이 넘어 `lock timeout`이 나면 그 세션에서 `ROLLBACK;` 후 시험을 처음부터 다시 합니다.
- 각 시험 시작 전 세션 1에서 `\i scripts/staging/naver/cleanup.sql`(이때 접속을 다시 확인하고 `target_ok`를 정합니다). 준비 블록의 쓰기는 `\if :target_ok` 안에 있습니다.
- 세션 2는 시험을 시작하기 전에 `\i scripts/staging/naver/check_target.sql`로 `target OK`를 확인합니다.
- 표의 단계는 같은 psql에서 이어서 실행합니다. 그사이 `\connect`하지 않습니다.

### 2-1. 로그인 완료가 먼저 잠근 경우 → 해제는 기다림

준비(세션 1): X를 A에 연결하고, X 로그인 거래를 A까지 해석합니다.

```sql
\i scripts/staging/naver/cleanup.sql
\if :target_ok
BEGIN; SET LOCAL ROLE service_role;
SELECT naver_tx_start('link_session', :'s1', :'st', :'c1', :'A') AS ltx \gset
SELECT * FROM naver_tx_callback(:'ltx', :'s1', :'st', jsonb_build_object('1', :'hx'));
SELECT complete_naver_link(:'ltx', :'s1', :'A', now());
SELECT naver_tx_start('login', :'s2', :'st', :'c2') AS tx \gset
SELECT target_user_id FROM naver_tx_callback(:'tx', :'s2', :'st', jsonb_build_object('1', :'hx'));
COMMIT;
\endif
```

| 순서 | 세션 1                                                                                                | 세션 2                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role;`                                                                 |                                                                             |
| 2    | `SELECT naver_tx_complete_login(:'tx', :'s2', :'A');` → `t`                                           |                                                                             |
| 3    |                                                                                                       | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_unlink(:'A');` → **멈춤** |
| 4    | `COMMIT;`                                                                                             | → `t`                                                                       |
| 5    |                                                                                                       | `COMMIT;`                                                                   |
| 6    | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_tx_still_linked(:'tx', :'s2', :'A'); COMMIT;` → `f` |                                                                             |

6번은 "완료 뒤 해제되면 앱이 새 세션을 로그아웃한다"는 경로의 근거입니다.

### 2-2. 해제가 먼저 잠근 경우 → 로그인 완료는 기다렸다가 거절

준비는 2-1과 같습니다(cleanup부터 다시).

| 순서 | 세션 1                                                                                               | 세션 2                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    |                                                                                                      | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_unlink(:'A');` → `t` |
| 2    | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_tx_complete_login(:'tx', :'s2', :'A');` → **멈춤** |                                                                        |
| 3    |                                                                                                      | `COMMIT;`                                                              |
| 4    | → `f`                                                                                                |                                                                        |
| 5    | `COMMIT;`                                                                                            |                                                                        |
| 6    | `SELECT state FROM naver_auth_transactions WHERE id = :'tx';` → `failed`                             |                                                                        |

### 2-3. 같은 네이버 ID를 두 계정에 동시에 연결 → 하나만 성공

준비(세션 1): cleanup 뒤 연결 없이 거래 두 개를 만듭니다.

```sql
\i scripts/staging/naver/cleanup.sql
SELECT count(*) AS x_links FROM naver_subject_hashes WHERE hash = :'hx';   -- 0이어야 함
\if :target_ok
BEGIN; SET LOCAL ROLE service_role;
SELECT naver_tx_start('link_session', :'s3', :'st', :'c3', :'A') AS ta \gset
SELECT * FROM naver_tx_callback(:'ta', :'s3', :'st', jsonb_build_object('1', :'hx'));
SELECT naver_tx_start('link_session', :'s4', :'st', :'c4', :'B') AS tb \gset
SELECT * FROM naver_tx_callback(:'tb', :'s4', :'st', jsonb_build_object('1', :'hx'));
COMMIT;
\endif
```

세션 2는 B의 거래 id를 조회해 받습니다(postgres로):

```sql
SELECT id AS tb FROM naver_auth_transactions WHERE browser_secret_hash = :'s4' AND oauth_state_hash = :'st' \gset
```

| 순서 | 세션 1                                                                                                                    | 세션 2                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role; SELECT complete_naver_link(:'ta', :'s3', :'A', now());` → A                          |                                                                                                         |
| 2    |                                                                                                                           | `BEGIN; SET LOCAL ROLE service_role; SELECT complete_naver_link(:'tb', :'s4', :'B', now());` → **멈춤** |
| 3    | `COMMIT;`                                                                                                                 | → 빈 값(NULL)                                                                                           |
| 4    |                                                                                                                           | `COMMIT;`                                                                                               |
| 5    | `SELECT user_id FROM naver_subjects s JOIN naver_subject_hashes h ON h.subject_id = s.id WHERE h.hash = :'hx';` → A 한 행 |                                                                                                         |

### 2-4. 전체 시작 한도(1분 600건)가 서로 다른 클라이언트에서도 정확함

- 이 시험은 스테이징 전체의 로그인 시작을 1분 동안 막으므로, 다른 사람이 스테이징을 쓰지 않을 때 합니다.
- 1분 시간창 안에 끝내야 합니다. 그래서 준비 직후 세션 1의 1번까지 바로 이어서 실행합니다.

준비(세션 1, postgres):

```sql
\i scripts/staging/naver/cleanup.sql
SELECT count(*) AS others FROM naver_auth_transactions WHERE created_at > now() - interval '1 minute';  -- 0이어야 함
\if :target_ok
INSERT INTO naver_auth_transactions (purpose, browser_secret_hash, oauth_state_hash, expires_at)
SELECT 'login', :'s5', :'st', now() + interval '30 minutes' FROM generate_series(1, 599);
\endif
```

| 순서 | 세션 1                                                                                                   | 세션 2                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_tx_start('login', :'s5', :'st', :'c5');` → id(600번째) |                                                                                                       |
| 2    |                                                                                                          | `BEGIN; SET LOCAL ROLE service_role; SELECT naver_tx_start('login', :'s6', :'st', :'c6');` → **멈춤** |
| 3    | `COMMIT;`                                                                                                | → 빈 값(NULL)                                                                                         |
| 4    |                                                                                                          | `COMMIT;`                                                                                             |
| 5    | `SELECT count(*) FROM naver_auth_transactions WHERE oauth_state_hash = :'st';` → 600                     |                                                                                                       |
| 6    | `\i scripts/staging/naver/cleanup.sql`                                                                   |                                                                                                       |

3번에서 id가 나왔다면 준비에서 1분이 지난 것입니다(시간창이 지나 599건이 빠짐). 6번 정리 후 다시 합니다.

### 2-5. 키 회전은 진행 중인 처리를 기다리고, 이후 처리는 새 키를 요구함

준비(세션 1):

```sql
\i scripts/staging/naver/cleanup.sql
SELECT count(*) AS v2 FROM naver_hash_keys WHERE version = 2;   -- 0이어야 함
\if :target_ok
BEGIN; SET LOCAL ROLE service_role;
SELECT naver_tx_start('login', :'s1', :'st', :'c1') AS k1 \gset
SELECT naver_tx_start('login', :'s2', :'st', :'c2') AS k2 \gset
COMMIT;
\endif
```

| 순서 | 세션 1                                                                                                                                                          | 세션 2 (postgres)                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | `BEGIN; SET LOCAL ROLE service_role; SELECT * FROM naver_tx_callback(:'k1', :'s1', :'st', jsonb_build_object('1', :'hx'));` → 한 행(연결 없음이라 target 빈 값) |                                                                                      |
| 2    |                                                                                                                                                                 | `BEGIN; LOCK TABLE public.naver_hash_keys IN SHARE ROW EXCLUSIVE MODE;` → **멈춤**   |
| 3    | `COMMIT;`                                                                                                                                                       | → 잠금 획득                                                                          |
| 4    |                                                                                                                                                                 | `INSERT INTO public.naver_hash_keys (version, status) VALUES (2, 'active'); COMMIT;` |
| 5    | `BEGIN; SET LOCAL ROLE service_role; SELECT * FROM naver_tx_callback(:'k2', :'s2', :'st', jsonb_build_object('1', :'hx')); COMMIT;` → 결과 없음                 |                                                                                      |
| 6    | `SELECT state FROM naver_auth_transactions WHERE id = :'k2';` → `failed`                                                                                        |                                                                                      |

V2 키 제거(세션 1, postgres). V2 해시가 없어야 지울 수 있습니다.

```sql
SELECT count(*) AS v2_hashes FROM naver_subject_hashes WHERE key_version = 2;   -- 0이어야 함
\i scripts/staging/naver/check_target.sql
\if :target_ok
BEGIN;
LOCK TABLE public.naver_hash_keys IN SHARE ROW EXCLUSIVE MODE;
DELETE FROM public.naver_hash_keys WHERE version = 2;
COMMIT;
\endif
\i scripts/staging/naver/cleanup.sql
```

운영 키 회전은 별도 승인 절차를 따릅니다.

## 3. 앱 흐름 확인

스테이징 DB를 가리키는 앱에서 합니다(로컬 `next start` + 스테이징 환경값, 또는 스테이징 전용 배포).

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
| 앱(WebView)에서 위 연결·로그인                         | 웹과 같음, 앱으로 세션 전달                                      |

시작 한도(같은 주소 10분 20건)는 위 시험을 마친 뒤 **10분 기다렸다가** 확인합니다. 앞선 시험의 시작도 같은 주소로 세어지기 때문입니다.

```bash
for i in $(seq 1 21); do
  curl -s -o /dev/null -w "%{redirect_url}\n" -X POST \
    -H "Origin: <앱 주소>" -d "purpose=login" "<앱 주소>/auth/naver/start"
done
```

기대: 1~20번은 네이버 주소, 21번째는 `/login?error=naver_busy`. 앱 화면 시험과 curl로 생긴 거래는 이번 실행의 `:st`가 아니므로 cleanup.sql로 지워지지 않습니다. 30분 뒤 만료되고 `naver_purge_transactions()`가 정리합니다.

## 4. 보고

- **1-2:** `owner`, `can_select`, `table_update`, `any_column_update` 값
- **1-3:** `linked`와 상태
- **1-4:** 권한 결과와 실제 역할 거절 여부
- **2-1~2-5:** 각 결과, `deadlock detected`·`lock timeout` 발생 여부, 두 세션의 `backend` 번호
- **3:** 확인 표 결과
- 1-3이 실패하거나 2장에서 교착이 나오면 운영 재개 절차로 넘어가지 않습니다.
- 마지막으로 `\i scripts/staging/naver/cleanup.sql`.

## 이 문서의 한계

session.sql·check_target.sql·cleanup.sql과 위 명령은 로컬에 psql·Postgres가 없어 **실행해 보지 못했습니다**(문법 확인 포함). 스테이징에서 처음 쓸 때는 먼저 **일부러 틀린 `STAGING_REF`로** session.sql과 cleanup.sql을 실행해 `STOP`이 나오고 아무것도 지워지지 않는지 확인한 뒤 시작합니다. 첫 실행에서 psql 오류가 나면 그 줄을 보고해 주세요. SQL 함수 동작은 PGlite 테스트로 확인돼 있습니다.
