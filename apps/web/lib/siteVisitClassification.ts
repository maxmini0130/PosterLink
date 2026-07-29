export type VisitActorType =
  | "visitor"
  | "member"
  | "operator"
  | "admin"
  | "automation"
  | "bot";

export type VisitAutomation = {
  isAutomated: boolean;
  isBot: boolean;
  source: string | null;
};

const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|slurp|facebookexternalhit|kakaotalk-scrap|naverbot|googlebot/i;
const AUTOMATION_USER_AGENT_PATTERN =
  /headlesschrome|playwright|puppeteer|selenium|phantomjs|webdriver|codex|chatgpt|openai/i;

export function detectVisitAutomation({
  userAgent,
  webdriver = false,
  explicitSource,
}: {
  userAgent?: string | null;
  webdriver?: boolean;
  explicitSource?: string | null;
}): VisitAutomation {
  const ua = userAgent ?? "";
  const normalizedSource = explicitSource?.trim().slice(0, 80) || null;
  const isBot = BOT_USER_AGENT_PATTERN.test(ua);

  if (normalizedSource) {
    return { isAutomated: true, isBot, source: normalizedSource };
  }
  if (isBot) {
    return { isAutomated: true, isBot: true, source: "bot-user-agent" };
  }
  if (webdriver) {
    return { isAutomated: true, isBot: false, source: "webdriver" };
  }
  if (AUTOMATION_USER_AGENT_PATTERN.test(ua)) {
    return {
      isAutomated: true,
      isBot: false,
      source: "automation-user-agent",
    };
  }
  return { isAutomated: false, isBot: false, source: null };
}

export function classifyVisitActor({
  role,
  automation,
  storedActorType,
}: {
  role?: string | null;
  automation: VisitAutomation;
  storedActorType?: string | null;
}): VisitActorType {
  if (role === "admin" || role === "super_admin") return "admin";
  if (role === "operator") return "operator";
  if (role === "user") return "member";
  if (automation.isBot) return "bot";
  if (automation.isAutomated) return "automation";

  if (
    storedActorType === "visitor" ||
    storedActorType === "automation" ||
    storedActorType === "bot"
  ) {
    return storedActorType;
  }
  return "visitor";
}

export function getVisitActorLabel(
  actorType: VisitActorType,
  role?: string | null,
) {
  if (actorType === "admin") {
    return role === "super_admin" ? "최고 관리자" : "관리자";
  }
  if (actorType === "operator") return "운영자";
  if (actorType === "member") return "회원";
  if (actorType === "automation") return "자동 검사";
  if (actorType === "bot") return "검색/서비스 봇";
  return "일반 방문";
}

export function getVisitAutomationLabel(
  automationSource?: string | null,
  isBot = false,
) {
  const source = (automationSource ?? "").toLowerCase();
  if (isBot || source === "bot-user-agent") return "검색/서비스 봇";
  if (/ai|codex|openai|chatgpt/.test(source)) return "AI 검사";
  if (/e2e|playwright|test/.test(source)) return "E2E 자동검사";
  if (source) return "자동 브라우저";
  return null;
}
