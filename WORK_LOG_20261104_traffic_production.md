# 2026-11-04 자체 방문 통계 운영 반영

사용자가 통계 수정의 운영 반영을 명시 요청했다.

## 배포 범위

- 이전 운영: `dpl_6tHom4snCDiERuisDLyrTm27NuBJ`, 소스
  `ff70547a381d5de6f65e2cf9507c50e9144aab09`, READY.
- 원 작업 브랜치 전체가 아닌 위 운영 커밋을 기준으로 별도
  `release/traffic-20261104` 브랜치를 생성하고 통계 수정 `e9b11fd`만 적용했다.
- 충돌 해결에서 운영의 `visitorIdentity` 공통 식별자 사용과 90일 조회 UI를 보존했다.
  기존 운영은 보관기간에 맞춰 1년 조회 선택지를 제공하지 않으므로 이를 되살리지 않았다.
- 통계 화면·API·테스트 표시 및 직접 관련 문서/검증만 변경한다.
  DB·RLS·마이그레이션·환경변수·인증 정책 변경은 없다.
- Vercel 프로젝트 `poster-link-web`, rootDirectory `apps/web`.
  기존 운영 런타임 Node 24.x 설정을 변경하지 않는다.

## 검증 및 진행

- 운영 기준 적용본의 관련 단위/개인정보 테스트 18/18 및 웹 lint 통과.
- 운영 기준 적용본의 격리된 실제 API 및 모바일·데스크톱 Playwright 6/6 통과.
- Vercel Production 환경으로 먼저 도메인 미연결 후보를 빌드하고 READY 확인 후 승격한다.
  운영 데이터에 테스트 기록을 쓰거나 기존 로그를 소급 삭제하지 않는다.
- 이전 구현 검증 및 전체 회귀의 기존 실패 2건은
  [구현 작업 로그](WORK_LOG_20261104_traffic_criteria.md)에 기록되어 있다.
- 운영 후보 소스 `2e36dd5508028bc3fee905173c1fd4cba5878173`는 원격 release
  브랜치에 push했다. Production 후보 `dpl_9tx6Yc5EQQjrEQydpbEsJCZHYMig`
  (`poster-link-1otcztkfj-maxmini0130s-projects.vercel.app`)는 `--skip-domain`으로 생성했다.
- 첫 업로드는 종료 중인 Playwright 임시 경로의 ENOENT로 후보 생성 전에 중단됐다.
  검증 종료 후 재업로드는 성공했다.

## 운영 결과

- Vercel Production 빌드의 compile·lint·타입 검사 및 정적 생성 성공, 후보 READY 확인.
  승격 직전 운영이 여전히 이전 배포를 가리키는지 확인한 뒤 `vercel promote`를 수행했다.
- `www.posterlink.kr`의 배포 ID는 `dpl_9tx6Yc5EQQjrEQydpbEsJCZHYMig`,
  소스는 `2e36dd5508028bc3fee905173c1fd4cba5878173`, 상태 READY로 재확인했다.
- 운영 홈 GET 200, 비www 홈 307(정규 주소 전환), 비로그인 관리자 화면 307,
  관리자 통계 API 401. 권한 보호가 유지됐다.
- 실제 운영 홈페이지가 참조하는 JavaScript에서 새 테스트 브라우저 키와
  `manual-test` 전송 로직이 모두 제공되는 것을 읽기 전용으로 확인했다.
- 로그인된 실제 관리자 화면의 운영 수치 읽기는 브라우저 연결 문제로 검증하지 못했다.
  관리자 UI·API의 출처 분리, 제외 및 설정 지속은 격리 E2E에서 검증했다.
- 운영 기록 생성 테스트·DB 변경·환경변수 변경 없음. 사용자는 통계 페이지를 새로고침한 뒤
  사용하는 브라우저의 **이 브라우저 테스트 방문 제외**를 켜면 된다.

## 복구

애플리케이션 장애 시 기존 READY 배포 `dpl_6tHom4snCDiERuisDLyrTm27NuBJ`로
Vercel 승격/롤백한다. DB 변경이 없어 DB 복구는 필요하지 않다.
수집된 수동 테스트 표시는 기존 자동화 제외 로직과 호환된다.
