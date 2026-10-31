import assert from "node:assert/strict";
import test from "node:test";
import * as cheerio from "cheerio";
import { extractYouthSchedule } from "./youth-seoul-schedule.js";

function page(
  category,
  noTime = "",
  start = "2026-11-04 00:00:00",
  end = "2026-11-30",
) {
  return cheerio.load(`<div id="prgrsSchdl"></div><script>
var hrChck = "${noTime}";
if(hrChck == "Y"){prgrsSchdlTm += "";}else{
prgrsSchdlTm += "19";prgrsSchdlTm += "시 ";prgrsSchdlTm += "0";prgrsSchdlTm += "분 ~ ";
prgrsSchdlTm += "21";prgrsSchdlTm += "시 ";prgrsSchdlTm += "30";prgrsSchdlTm += "분 ";}
var prgrsSchdlCtgry = "${category}";
if(prgrsSchdlCtgry == "001"){prgrsSchdl += "${start}";}
else if(prgrsSchdlCtgry == "002"){prgrsSchdl += "${start}";prgrsSchdl += " ~ ";prgrsSchdl += "${end}";}
</script>`);
}
test("dynamic single-day schedule uses separate hours, not date placeholder midnight", () => {
  assert.equal(extractYouthSchedule(page("001")), "2026-11-04 19:00 ~ 21:30");
});
test("range selects only its active branch and preserves no-time setting", () => {
  assert.equal(
    extractYouthSchedule(page("002", "Y")),
    "2026-11-04 ~ 2026-11-30",
  );
});
test("unknown and incomplete schedules are not fabricated", () => {
  assert.equal(extractYouthSchedule(page("003")), "");
  assert.equal(extractYouthSchedule(page("002", "Y", "2026-11-04", "")), "");
  assert.equal(
    extractYouthSchedule(cheerio.load("<div id='prgrsSchdl'></div>")),
    "",
  );
});
test("already rendered schedule is retained", () => {
  assert.equal(
    extractYouthSchedule(
      cheerio.load("<div id='prgrsSchdl'>매주 수요일 19시</div>"),
    ),
    "매주 수요일 19시",
  );
});
