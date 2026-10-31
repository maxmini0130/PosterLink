# 릴리스 고정 검사 허용 범위 검토

상태: 검토 대기 (구현 Claude, 검토 Codex) — 대상 `4e3f38b`, 수정 필요 2건. 다음 수정본 대기

## 범위와 결론

`4e3f38b7f5351a2a190c565da9609f66237ab375`의 검사 파일 2개를 검토했다. fetch/status, 커밋 diff, 기존 고정 비교, README·지시서·구현 로그를 확인했다. 이 커밋은 검사와 로그만 바꾸며 실제 앱·보안·DB·의존성 파일을 바꾸지는 않는다.

**판정: 검사 범위 확대는 재검토 미통과.** 현재 코드의 보호 파일이 훼손된 것은 아니지만, 아래 두 가상 변경을 허용해 의도한 제한을 충분히 보증하지 못한다. 앞서 통과한 측정 기능 코드와는 별도 변경에 대한 판정이다. 구현·검사 코드는 수정하지 않았다.

## P2-1. 테스트 추가 허용이 실행 명령 전체 교체까지 허용

- 위치: `scripts/security/naver-emergency-stop.test.ts:193-204`, `withoutTestScript`.
- 양쪽 package.json에서 `scripts.test`를 지우고 비교하므로 이 값에는 아무 제약이 없다. 의존성·다른 스크립트 고정은 유지하지만 기존 검사 삭제·실패 무시도 구분하지 못한다.
- 재현: `scripts.test`만 `node -e "process.exit(0)"`로 바꾸는 가상 입력을 원본 검사 callback에 전달하면 두 파일의 고정 검사가 모두 통과한다. 실제 package.json을 바꾸거나 no-op 명령을 실행한 것은 아니다.
- 수정 방향: 기존 실행기·검사 목록을 보존하면서 승인된 테스트 경로 추가만 허용하거나, 자유로운 셸 명령 대신 검증 가능한 별도 manifest를 사용한다. no-op·기존 검사 삭제·실패 무시 사례가 실패하는 음성 회귀 테스트를 먼저 추가해야 한다.

## P2-2. 최소 연령 차단이 식별자 블랙리스트에만 의존

- 위치: `scripts/security/ga4-naver-safe-release.test.ts:58-81`.
- 온보딩 전체 고정 대신 특정 식별자/문구 부재와 `desc: "13~18세"`의 존재만 확인한다. 알려진 minimum-age 브랜치의 특정 구현은 잡지만 같은 기능을 다른 이름으로 넣으면 통과한다.
- 재현 A: 기존 문구를 유지하고 실제 `handleComplete` 시작에 다음 조건만 추가하는 가상 입력에서도 두 고정 검사가 모두 통과했다.

  ```ts
  if (
    Number(window.prompt("출생연도를 입력하세요")) >
    new Date().getFullYear() - 14
  )
    return;
  ```

- 재현 B: 신규 `20261031020000_enrollment.sql`에 `birth_date` 컬럼과 `CHECK (birth_date IS NULL OR birth_date <= (CURRENT_DATE - INTERVAL '14 years')::date)`를 추가하는 가상 입력도 통과했다. 파일명 형식은 맞고 금지된 식별자가 없지만 연령 제한을 도입한다. SQL이나 온보딩 동작은 실행하지 않았다.
- 수정 방향: 이번에 검토·승인된 온보딩 계측 변경과 신규 migration을 명시적 범위/기준으로 제한하고, 이름과 무관하게 기존 청소년 가입 흐름을 막지 않는 행동 검사도 추가한다. 블랙리스트 단어를 더하는 것만으로 해결됐다고 보지 않는다.

## 유지된 보호와 직접 검증

- 현재 두 검사 파일 **8/8 PASS**. 정상 입력의 성공과 위 변형 입력을 거부하는 능력은 구분한다.
- 가상 middleware 파일 변경은 두 검사 모두 거부했다. 기준 커밋에 있던 migration의 M·D 상태도 모두 거부했다. root devDependency 변경은 naver 검사에서 거부하므로 두 파일을 함께 실행하면 차단된다.
- 기존 migration의 이름 변경도 `--no-renames`에서 삭제/추가로 표시돼 삭제 상태에서 거부된다. 보안 파일·admin API·api/onboarding·mobile·lockfile 보호를 제거한 변경은 확인하지 못했다.
- ‘적용된 migration’ 보호는 고정 base에 있던 파일 기준이다. 나중에 추가된 migration이 실제 운영에 적용되면 기준/manifest 갱신도 필요하다. 파일 추가 상태만으로 SQL 내용의 안전성이나 적용 승인이 증명되지는 않는다.
- 변형 검사는 원본 테스트를 메모리에 읽고 Git/fs 의존성만 가짜 diff·내용으로 대체해 실제 검사 callback을 실행했다. 실제 앱·package.json·보안 파일·migration은 수정하지 않았다. 정상 기준이 두 callback을 통과하는 것도 확인했다.
- 스크립트와 결과는 Git 제외 `data/results/release-freeze-review/`에 보관했다. 변경된 검사 파일 Prettier와 `git diff --check` PASS. 이번에는 전체 앱 lint/build·전체 회귀·브라우저 시연을 반복하지 않았다.
- 운영 DB 조회/쓰기·마이그레이션 적용·push·배포 없음. 검토 기록과 상태만 같은 브랜치에 로컬 커밋한다. 두 음성 사례를 회귀 테스트로 고정하고 허용 범위를 좁힌 뒤 재검토한다.
