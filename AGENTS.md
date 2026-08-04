# PosterLink Agent Guide

이 파일은 Codex를 포함한 모든 코딩 에이전트의 저장소 작업 규칙이다. 세부 기준은 루트 `CLAUDE.md`와 함께 적용하며, 충돌하면 더 안전하고 구체적인 규칙을 따른다.

## 필수 순서

1. 작업 전 `git fetch origin`과 `git status --short --branch`로 기준 상태를 확인한다.
2. 관련 코드, 테스트, `README.md`, 관련 `docs/`, 최신 `WORK_LOG*.md`를 읽는다.
3. 기존 구현과 사용자 변경을 보존하면서 가장 좁은 범위로 수정한다.
4. 범위에 맞는 테스트, lint, build, dry-run 또는 시각 검증을 수행한다.
5. 작업 로그와 직접 관련된 문서를 갱신하고, 검증된 변경만 커밋한다.

## 절대 원칙

- PosterLink는 신뢰할 수 있는 공공 기회 발견·판단·신청 연결 서비스다. 속도나 수집량 때문에 정확성을 희생하지 않는다.
- 실제 주관기관, 수집 출처, 신청 기관을 구분한다.
- 원문 상세 URL과 신청 URL을 구분한다.
- 모집기간 미확인을 `상시모집`으로 바꾸지 않으며 날짜는 `Asia/Seoul` 기준으로 처리한다.
- 실제 포스터가 아닌 로고, 배너, 일반 사진, 지도, 장식 이미지를 대표 포스터로 노출하지 않는다.
- 원문 첨부파일의 포스터 후보도 조사하고 본문·OCR·파일 문맥과의 일치도를 검증한다.
- AI의 낮은 신뢰도와 오류를 자동 승인으로 처리하지 않는다. 사람 골든셋의 확정 판정을 우선한다.
- 원문, 추출 근거, 검수 상태를 보존하고 불확실한 데이터는 검수 대기로 보낸다.
- 운영 DB 쓰기, 마이그레이션 적용, 대량 수정·삭제는 사용자에게 해당 작업의 명시적 승인을 받은 뒤 수행한다.
- 스키마와 RLS 변경은 새 `supabase/migrations/` 파일로 기록하고, 사용자 요청 경로에서 서비스 역할 키로 RLS를 우회하지 않는다.
- 비밀값과 개인정보를 출력하거나 커밋하지 않는다.
- 직접 만들지 않은 변경을 되돌리지 않고, 파괴적 Git 명령과 강제 푸시를 사용하지 않는다.

## 저장소 기준

- Node.js 20, `pnpm@10.33.0`
- 웹: `apps/web`, Next.js App Router, 포트 4000
- 모바일: `apps/mobile`, Expo
- 운영 크롤러와 AI 도구: `scripts/crawler`
- 공유 코드: `packages/ui`, `packages/types`, `packages/lib`
- DB 변경: `supabase/migrations`

주요 검증 명령:

```bash
pnpm test
pnpm --filter web lint
pnpm --filter web build
pnpm --filter posterlink-crawler test
pnpm --filter posterlink-crawler ai:healthcheck
pnpm --dir apps/mobile typecheck
```

문서 전용 변경은 UTF-8, 링크와 명령, Prettier, `git diff --check`를 확인한다. 실행하지 못한 검증은 최종 보고에 분명히 남긴다.
