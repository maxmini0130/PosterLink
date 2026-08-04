import assert from "node:assert/strict";
import test from "node:test";

import {
  inferSpecificTitle,
  shouldUseExternalNoticeDetail,
} from "./adapters/youth-seoul.js";

test("application forms are links only, not canonical notice content", () => {
  assert.equal(
    shouldUseExternalNoticeDetail({
      url: "https://forms.gle/example",
      title: "전체 프로그램 신청",
      content: "다른 프로그램이 함께 섞인 신청서 본문",
      images: ["https://example.com/form-header.png"],
    }),
    false,
  );
  assert.equal(
    shouldUseExternalNoticeDetail({
      url: "https://example.org/notices/123",
      title: "공식 공고",
    }),
    true,
  );
});

test("generic provider title is enriched from a quoted program name", () => {
  assert.equal(
    inferSpecificTitle(
      "\uC11C\uC6B8\uACBD\uC81C\uC9C4\uD765\uC6D0 \uBAA8\uC9D1",
      "\uAE00\uB85C\uBC8C \uC2A4\uD0C0\uD2B8\uC5C5 \uB300\uCD95\uC81C 'Try Everything 2026'\uC744 \uC18C\uAC1C\uD569\uB2C8\uB2E4. \uACF5\uC2DD \uD648\uD398\uC774\uC9C0\uC5D0\uC11C \uC628\uB77C\uC778 \uC0AC\uC804\uB4F1\uB85D",
    ),
    "\uC11C\uC6B8\uACBD\uC81C\uC9C4\uD765\uC6D0 <Try Everything 2026> \uC0AC\uC804\uB4F1\uB85D \uC548\uB0B4",
  );
});

test("generic title is preserved without a grounded program name", () => {
  assert.equal(
    inferSpecificTitle(
      "\uC608\uC2DC\uAE30\uAD00 \uC548\uB0B4",
      "\uC0C1\uC138 \uB0B4\uC6A9\uC744 \uD655\uC778\uD558\uC138\uC694.",
    ),
    "\uC608\uC2DC\uAE30\uAD00 \uC548\uB0B4",
  );
});

test("Korean program name is used only with an explicit name label", () => {
  assert.equal(
    inferSpecificTitle(
      "\uC608\uC2DC\uAE30\uAD00 \uBAA8\uC9D1",
      "\uD504\uB85C\uADF8\uB7A8\uBA85: \u300C\uB9C8\uC74C\uCC59\uAE40 \uC0B0\uCC45\u300D \uCC38\uC5EC\uC790 \uBAA8\uC9D1",
    ),
    "\uC608\uC2DC\uAE30\uAD00 <\uB9C8\uC74C\uCC59\uAE40 \uC0B0\uCC45> \uBAA8\uC9D1",
  );
  assert.equal(
    inferSpecificTitle(
      "\uC608\uC2DC\uAE30\uAD00 \uBAA8\uC9D1",
      "\uB2F4\uB2F9\uC790\uB294 '\uB9CE\uC740 \uCC38\uC5EC \uBC14\uB78D\uB2C8\uB2E4'\uB77C\uACE0 \uC804\uD588\uB2E4.",
    ),
    "\uC608\uC2DC\uAE30\uAD00 \uBAA8\uC9D1",
  );
});

test("already specific title is not enriched a second time", () => {
  const title =
    "\uC11C\uC6B8\uCCAD\uB144\uC13C\uD130 \uB3C4\uBD09 <8\uC6D4 \uD2F0\uD1A1 '\uB2E4\uB3C4\uAD04\uC0AC \uC140\uD504\uCF00\uC5B4'> \uCC38\uC5EC\uC790 \uBAA8\uC9D1";
  assert.equal(
    inferSpecificTitle(
      title,
      "\uD504\uB85C\uADF8\uB7A8 '\uB2E4\uB3C4\uAD04\uC0AC \uC140\uD504\uCF00\uC5B4' \uC2E0\uCCAD",
    ),
    title,
  );
});
