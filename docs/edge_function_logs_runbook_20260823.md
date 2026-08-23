# Supabase Edge Function 로그 조회 절차

기준일: 2026-08-23

운영 장애나 알림/OCR 실패가 의심될 때 Supabase Edge Function 배포 상태와 실행 로그를 확인하는 절차다.

## 현재 운영 함수

`pnpm dlx supabase functions list --project-ref zxndgzsfrgwahwsdbjdj` 기준:

| 함수 | 상태 | 버전 | JWT 검증 | 운영 주의 |
| --- | --- | ---: | --- | --- |
| `process-ocr` | ACTIVE | 11 | true | OCR 요청 본문과 `OPENAI_API_KEY`가 필요하다. 임의 호출하지 않는다. |
| `check-deadlines` | ACTIVE | 5 | false | 찜한 포스터 마감 알림을 생성하고 Expo push를 보낼 수 있다. 점검 호출은 승인 후 진행한다. |
| `notify-new-match` | ACTIVE | 4 | true | 승인된 포스터의 대기 푸시 알림을 발송한다. 운영 데이터로 임의 호출하지 않는다. |

## 조회 경로

1. Supabase Dashboard에서 프로젝트 `posterlink-dev`를 연다.
2. 좌측 `Logs` 또는 `Edge Functions` 화면으로 이동한다.
3. 함수별 로그 화면에서 필요한 함수 slug를 선택한다.
   - OCR 실패: `process-ocr`
   - 마감 알림: `check-deadlines`
   - 신규 매칭 푸시: `notify-new-match`
4. 시간 범위를 장애 발생 시각 전후 30분 이상으로 잡는다.
5. 필요하면 `error`, HTTP status, invocation id, request id로 필터링한다.

Supabase CLI는 현재 원격 Edge Function 로그 조회용 하위 명령을 제공하지 않는다. CLI는 배포 상태 확인용으로 사용하고, 실제 실행 로그는 대시보드에서 확인한다.

```bash
pnpm dlx supabase functions --help
pnpm dlx supabase functions list --project-ref zxndgzsfrgwahwsdbjdj
```

## 함수별 확인 포인트

### `process-ocr`

- 400 응답이면 `Missing imageBase64 data`, `OPENAI_API_KEY is not configured`, `OpenAI API error`, `AI 응답 파싱 실패` 메시지를 우선 확인한다.
- OpenAI API 오류가 보이면 Vercel이 아니라 Supabase Edge Function secret의 `OPENAI_API_KEY` 상태를 확인한다.
- OCR 결과가 이상하면 원본 이미지, 요청 본문, 반환 JSON을 함께 보존하고 자동 승인하지 않는다.

### `check-deadlines`

- 정상 무대상 응답은 `No posters expiring tomorrow.`다.
- 정상 완료 응답은 `Deadline check complete.`와 `sentCount`다.
- 로그에서 `Existing notification lookup error` 또는 `Notification insertion error`가 보이면 DB 권한/스키마와 중복 알림 여부를 확인한다.
- 이 함수는 `verify_jwt=false`지만 운영 호출 시 알림 레코드 생성과 Expo push 발송이 발생할 수 있다. 수동 smoke test는 사용자 승인 후 점검 시간대에만 수행한다.

### `notify-new-match`

- 401이면 Authorization header 또는 사용자 JWT 문제를 본다.
- 403이면 호출 사용자의 `profiles.role`이 `admin` 또는 `super_admin`인지 확인한다.
- `poster_id is required`는 요청 본문 누락이다.
- `Poster is not published.`나 `No pending push notifications found.`는 200 정상 응답일 수 있다.
- `DeviceNotRegistered`가 포함된 티켓은 push token 정리 대상이다.

## 장애 대응 기록

로그 확인 후 다음 정보를 작업 로그나 이슈에 남긴다.

- 발생 시각과 확인 시간대
- 함수명, invocation id 또는 request id
- HTTP status와 오류 메시지 요약
- 영향받은 poster id, user id는 필요한 범위만 기록하고 개인정보는 남기지 않는다.
- 조치 내용과 재발 방지 항목

