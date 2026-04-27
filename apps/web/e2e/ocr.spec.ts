import { test, expect } from "@playwright/test";

const SUPABASE_URL = "https://zxndgzsfrgwahwsdbjdj.supabase.co";

test.describe("OCR Edge Function", () => {
  test("process-ocr 엔드포인트 응답 확인 (인증 없이 401 또는 400 반환)", async ({ request }) => {
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/process-ocr`,
      {
        headers: { "Content-Type": "application/json" },
        data: {},
      }
    );
    // JWT 검증 활성화 상태이므로 401 또는 400 예상
    expect([400, 401, 403]).toContain(response.status());
  });

  test("check-deadlines 엔드포인트 응답 확인 (no-verify-jwt)", async ({ request }) => {
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/check-deadlines`,
      {
        headers: { "Content-Type": "application/json" },
        data: {},
      }
    );
    // no-verify-jwt로 배포되어 200 또는 400(데이터 없음) 예상
    expect([200, 400]).toContain(response.status());
  });
});
