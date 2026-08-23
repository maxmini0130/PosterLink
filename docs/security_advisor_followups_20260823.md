# Supabase security advisor 후속 정리

기준일: 2026-08-23

운영 DB RLS 재확인 결과 앱 사용 테이블의 RLS는 모두 활성화되어 있고 핵심 정책도 존재한다. 이 문서는 RLS와 별개로 Supabase security advisor가 보고한 함수/권한/Auth 설정 경고의 처리 방침을 기록한다.

## 1차 migration

`supabase/migrations/20260823010000_harden_security_advisor_warnings.sql`

- 오래된 `SECURITY DEFINER` 함수의 `search_path`를 `public`으로 고정한다.
  - `get_popular_keywords`
  - `get_popular_regions`
  - `get_recommended_posters`
  - `get_recommended_posters_v2`
  - `log_search`
  - `match_posters_by_embedding`
  - `notify_poster_owner_on_comment`
  - `search_posters_with_synonyms`
- 트리거 전용 함수의 직접 RPC 실행 권한을 `anon`, `authenticated`, `PUBLIC`에서 회수한다.
- 내부 유지보수/기관 해석 함수의 직접 RPC 실행 권한을 `anon`, `authenticated`, `PUBLIC`에서 회수한다.
- 관리자 트래픽 집계 RPC와 semantic embedding match RPC는 service role 실행만 남긴다.

## 의도적으로 1차 범위에서 제외

- 공개 검색/추천 RPC 전체 폐쇄
  - `get_popular_keywords`, `search_posters_with_synonyms`, `get_recommended_posters_v2`, `log_search`는 현재 브라우저 클라이언트가 직접 호출한다.
  - 권한을 더 줄이려면 API route 경유로 구조를 바꾸거나 `SECURITY INVOKER` 전환 검증이 필요하다.
- `increment_points`
  - 관리자 화면이 직접 호출하지만 함수 내부에서 `auth.uid()`의 `admin`/`super_admin` 역할을 확인한다.
  - 장기적으로는 관리자 API route로 옮겨 service role만 호출하게 정리하는 편이 낫다.
- `pg_net`, `vector` extension의 public schema 경고
  - extension schema 이동은 의존 SQL과 타입 참조 영향이 커서 별도 migration으로 다룬다.
- Auth leaked password protection
  - Supabase Auth 대시보드 설정 항목이다. 코드 migration으로 처리하지 않는다.

## 운영 적용 전 확인

- migration SQL은 운영 DB 쓰기를 수반하므로 적용 전 별도 승인이 필요하다.
- 적용 후 확인:
  - `pnpm dlx supabase db push --linked`
  - `pnpm dlx supabase db advisors --linked --type security`
  - `pnpm --filter web lint`
  - `pnpm --filter web exec tsc --noEmit --pretty false`
  - 관리자 트래픽 API와 semantic search 운영 smoke test
