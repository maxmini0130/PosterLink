# 2026-08-28 알림 자동화 보강

## 목적

- 사용자 알림 설정(`profiles.is_notified`)을 자동 알림 발송 흐름에 반영한다.
- 마감 알림에서 만료된 Expo push token을 정리한다.
- 알림 센터의 읽음 처리 쿼리에 사용자 조건을 명시해 클라이언트 경로를 보강한다.

## 변경

- `supabase/functions/notify-new-match/index.ts`
  - 신규 매칭 푸시 대상 프로필 조회에 `is_notified = true` 조건을 추가했다.
  - 기존 user_id별 알림 묶음과 `DeviceNotRegistered` token 정리 흐름은 유지했다.
- `supabase/functions/check-deadlines/index.ts`
  - 찜한 공고 마감 임박 알림 생성 전에 연결 프로필의 `is_notified`를 확인한다.
  - `is_notified !== true` 사용자는 마감 알림 레코드와 push 발송에서 제외한다.
  - Expo 응답에 `DeviceNotRegistered`가 있으면 해당 사용자의 `expo_push_token`을 `null`로 정리한다.
- `apps/web/app/notifications/page.tsx`
  - 단건 읽음 처리 시 `id`와 함께 현재 `user_id` 조건을 붙였다.

## 검증

- `pnpm --filter web lint`
- `git diff --check`
- `pnpm dlx supabase functions list --project-ref zxndgzsfrgwahwsdbjdj`
  - `check-deadlines`: ACTIVE v7, `verify_jwt=false`
  - `notify-new-match`: ACTIVE v5, `verify_jwt=true`

## 운영 배포

- `pnpm dlx supabase functions deploy check-deadlines --project-ref zxndgzsfrgwahwsdbjdj --no-verify-jwt --use-api`
- `pnpm dlx supabase functions deploy notify-new-match --project-ref zxndgzsfrgwahwsdbjdj --use-api`

## 추가 감사 도구

- `scripts/crawler/src/audit-notifications.js`를 추가했다.
- `pnpm --filter posterlink-crawler audit:notifications`로 운영 알림 push 대기 상태를 읽기 전용으로 확인할 수 있다.
- 2026-08-28 실행 결과:
  - `new_match`: 대기 19,197건, 대상 사용자 10명, 대상 공고 2,296건, 발송 가능 1,254건, push token 없음 17,943건, 알림 OFF 0건
  - `favorite_deadline`: 대기 5건, 대상 사용자 2명, 대상 공고 2건, 발송 가능 0건, push token 없음 5건, 알림 OFF 0건

## 미실행

- `deno check`: 현재 로컬 환경에 `deno` 명령이 없어 실행하지 못했다.
- Edge Function 수동 호출: 운영 알림 레코드 생성 또는 실제 push 발송이 발생할 수 있어 이번 변경에서는 호출하지 않았다.
