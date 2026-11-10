#!/usr/bin/env node
// Manual-only smoke check. Do not schedule/import/run as part of build or tests.
const TIME_ZONE = "Asia/Seoul";
const URL_TO_CHECK = "https://www.posterlink.kr/posters";
function day(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function ordinal(value) {
  const [year, month, date] = value.split(/[-.]/).map(Number);
  const instant = new Date(Date.UTC(year, month - 1, date));
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== date
  )
    return null;
  return Math.floor(instant.getTime() / 86_400_000);
}
async function main() {
  const today = day(new Date());
  const response = await fetch(URL_TO_CHECK, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { "User-Agent": "PosterLinkDateSmoke/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (day(new Date()) !== today)
    throw new Error("KST midnight crossed during fetch; rerun manually");
  const articles = [
    ...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi),
  ].map((match) => match[0]);
  const checks = [];
  for (const article of articles) {
    const text = article
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");
    for (const match of text.matchAll(
      /(20\d{2}[.-]\d{2}[.-]\d{2})\s*까지\s*·\s*D\s*-\s*(\d+)/g,
    )) {
      const end = ordinal(match[1]);
      const expected = end === null ? null : end - ordinal(today);
      checks.push({
        deadline: match[1],
        displayedDays: Number(match[2]),
        expectedDays: expected,
        pass: expected !== null && expected === Number(match[2]),
      });
    }
  }
  const failures = checks.filter((check) => !check.pass);
  const report = {
    url: URL_TO_CHECK,
    todayKst: today,
    timeZone: TIME_ZONE,
    articles: articles.length,
    checkedDateDdayPairs: checks.length,
    checks,
    failures: failures.length,
    scope:
      "SSR article date+D labels only; ongoing/today/closed labels without a displayed date+D pair are not certified by this check",
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = checks.length === 0 ? 2 : failures.length ? 1 : 0;
}
main().catch((error) => {
  console.error(
    JSON.stringify({ status: "inconclusive", error: error.message }),
  );
  process.exitCode = 2;
});
