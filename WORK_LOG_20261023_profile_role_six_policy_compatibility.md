# 운영 profiles 정책 6개와 최종 보호 SQL 호환성 검증

운영 DB 보호 SQL과 테스트 계정 정리는 실행하지 않았다. 작업 시작 git fetch origin 및 git status --short --branch 확인, 기준 HEAD 1387ffd, clean 상태. CLAUDE/README·기존 SQL/검증/운영 배포 기록·관리자 역할 API를 읽었다.

운영 SQL Editor에서 SELECT만 수행해 정책 6개, public.user_role 라벨, guard 부재, 관련 public DEFINER 함수 ACL·해시, DB 역할 상속을 재확인했다. admin_can_update_profiles 및 기존 updated_at 트리거를 enum 격리 fixture에 추가하고 정책 정의/정상 관리자 non-role 수정/직접 role 수정 거부 회귀를 보강했다. 운영 increment_points 본문도 읽기 전용으로 대조했다. 개인정보·Auth ID는 로그/Git에 넣지 않았다. 점검 쿼리는 저장하지 않고 폐기했다.

최종 [검토 결과와 SQL 원문 링크](docs/profile_role_db_approval.md)에 정책별 영향, 역할 API와 service_role 호환성, 읽기 전용 postflight 기대값, 안전 복구 및 실계정 미검증 한계를 정리했다. 마이그레이션은 9510f96 기준과 내용 동일하며 Git blob SHA-256 597fc708cab7bd656af6a42a55ee5d0f798c5f4901470af46b8b511281196c01 일치. 운영 상태는 패치 미적용이며 실제 관리자/테스트 계정에 이번 작업의 변경은 없다.

검증: 보안 93/93, 전체 자동 테스트 163/163 통과. 운영 실계정/OAuth/실제 PostgREST 쓰기는 수행하지 않았다. 앱 소스·SQL 변경 없음, 테스트와 문서만 변경. build/lint/Preview 재배포는 앱 변경이 없어 재실행하지 않았다. Prettier, UTF-8/상대 링크 및 git diff --check 확인. Git push·운영 배포·DB/계정/세션 변경 없음.
