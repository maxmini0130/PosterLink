// Read the site's literal schedule data without executing remote JavaScript.
export function extractYouthSchedule($) {
  const rendered = $("#prgrsSchdl").text().trim();
  if (rendered) return rendered;
  const script = $("script")
    .map((_, el) => $(el).html() ?? "")
    .get()
    .find((text) => /var\s+prgrsSchdlCtgry\s*=/.test(text));
  if (!script) return "";
  const category = script.match(/var\s+prgrsSchdlCtgry\s*=\s*"(\d+)"/)?.[1];
  if (!["001", "002"].includes(category)) return "";
  const branch =
    script.match(
      new RegExp(
        `if\\s*\\(prgrsSchdlCtgry\\s*==\\s*"${category}"\\)\\s*\\{([\\s\\S]*?)\\}`,
      ),
    )?.[1] ?? "";
  const dates = [...branch.matchAll(/prgrsSchdl\s*\+=\s*"([^"\n]*)"/g)]
    .map((m) => m[1].trim())
    .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value))
    .map((value) => value.slice(0, 10));
  if (dates.length !== (category === "001" ? 1 : 2)) return "";
  let result = dates.join(" ~ ");
  const noTime = /var\s+hrChck\s*=\s*"Y"/.test(script);
  if (!noTime) {
    const timeBlock =
      script.match(
        /if\s*\(hrChck\s*==\s*"Y"\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\}/,
      )?.[1] ?? "";
    const parts = [
      ...timeBlock.matchAll(/prgrsSchdlTm\s*\+=\s*"([^"\n]*)"/g),
    ].map((m) => m[1]);
    const time = parts
      .join("")
      .match(/^(\d{1,2})시\s*(\d{1,2})분\s*~\s*(\d{1,2})시\s*(\d{1,2})분\s*$/);
    if (
      time &&
      Number(time[1]) < 24 &&
      Number(time[3]) < 24 &&
      Number(time[2]) < 60 &&
      Number(time[4]) < 60
    ) {
      result += ` ${time[1].padStart(2, "0")}:${time[2].padStart(2, "0")} ~ ${time[3].padStart(2, "0")}:${time[4].padStart(2, "0")}`;
    }
  }
  return result;
}
