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

## 미실행

- `deno check`: 현재 로컬 환경에 `deno` 명령이 없어 실행하지 못했다.
- Edge Function 수동 호출: 운영 알림 레코드 생성 또는 실제 push 발송이 발생할 수 있어 이번 변경에서는 호출하지 않았다.
