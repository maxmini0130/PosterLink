export const DEADLINE_OFFSETS = Object.freeze([7, 1]);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getKstDayBounds(offsetDays, now = new Date()) {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  const day = kstNow.getUTCDate();
  const start = Date.UTC(year, month, day + offsetDays) - KST_OFFSET_MS;
  const end = Date.UTC(year, month, day + offsetDays + 1) - KST_OFFSET_MS - 1;

  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

export function deadlineCopy(offsetDays, title) {
  if (offsetDays === 1) {
    return {
      title: "마감 임박 알림",
      body: `찜한 [${title}] 공고가 내일 마감됩니다. 놓치지 마세요.`,
    };
  }

  return {
    title: "마감 예정 알림",
    body: `찜한 [${title}] 공고가 7일 뒤 마감됩니다.`,
  };
}

/**
 * @param {boolean} responseOk
 * @param {any} payload
 * @returns {{
 *   status: "sent" | "failed",
 *   ticketId: string | null,
 *   errorCode: string | null,
 *   errorMessage: string | null,
 *   invalidToken: boolean,
 * }}
 */
export function parseExpoResult(responseOk, payload) {
  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const successfulTicket = tickets.find((ticket) => ticket?.status === "ok");
  const failedTicket = tickets.find((ticket) => ticket?.status === "error");

  if (responseOk && successfulTicket) {
    return {
      status: "sent",
      ticketId: successfulTicket.id ?? null,
      errorCode: null,
      errorMessage: null,
      invalidToken: false,
    };
  }

  return {
    status: "failed",
    ticketId: failedTicket?.id ?? null,
    errorCode:
      failedTicket?.details?.error ??
      (responseOk ? "missing_success_ticket" : "expo_http_error"),
    errorMessage:
      failedTicket?.message ?? payload?.errors?.[0]?.message ?? null,
    invalidToken: failedTicket?.details?.error === "DeviceNotRegistered",
  };
}
