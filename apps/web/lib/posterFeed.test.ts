import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPosterImage,
  readImageDimensions,
} from "../../../packages/lib/posterImagePolicy.cjs";
import { POSTER_THEMES, posterTitleLines, posterTheme } from "./defaultPoster";
import {
  buildPosterFeed,
  interestPromptVisible,
  FEED_DISMISS_KEY,
  mixFeedImages,
} from "./posterFeed";
import { optimizablePosterImage, imageMetadata } from "./feedImages";
import type { HomeItem } from "./homeSections";

test("image policy preserves exact 400px and 1.9 boundaries, never approves unknown", () => {
  assert.equal(assessPosterImage({ url: "x", width: 400, height: 400 }), "ok");
  assert.equal(assessPosterImage({ url: "x", width: 760, height: 400 }), "ok");
  assert.equal(
    assessPosterImage({ url: "x", width: 761, height: 400 }),
    "unsuitable",
  );
  assert.equal(
    assessPosterImage({ url: "x", width: 399, height: 800 }),
    "unsuitable",
  );
  assert.equal(assessPosterImage({ url: "x", width: 800, height: 3000 }), "ok");
  assert.equal(assessPosterImage({ url: "x" }), null);
  assert.equal(assessPosterImage({ url: "x", isPoster: false }), "unsuitable");
  assert.equal(assessPosterImage({ url: "x", broken: true }), "broken");
  assert.deepEqual(
    imageMetadata({ image_width: 800, image_height: 1200, image_status: null }),
    { imageWidth: null, imageHeight: null, imageStatus: null },
  );
  assert.equal(imageMetadata({ width: 800, height: 1200 }).imageWidth, 800);
});
test("eight reference colors keep white text above 4.5:1; title never exceeds five lines", () => {
  const linear = (n: number) => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  for (const t of POSTER_THEMES) {
    const [r, g, b] = [1, 3, 5].map((i) =>
      linear(parseInt(t.color.slice(i, i + 2), 16)),
    );
    assert.ok(
      1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) >= 4.5,
      t.label,
    );
  }
  assert.equal(POSTER_THEMES.length, 8);
  assert.equal(posterTheme("교육강좌").label, "교육/취업");
  const lines = posterTitleLines("가".repeat(200));
  assert.equal(lines.length, 5);
  assert.ok(lines[4].endsWith("…"));
});
test("prompt dismisses for seven days, including blocked or future storage", () => {
  const now = Date.now();
  const store = (at: string | null) => ({
    getItem: (key: string) => (key === FEED_DISMISS_KEY ? at : null),
  });
  assert.equal(
    interestPromptVisible(store(String(now - 7 * 86400000 + 1)), now),
    false,
  );
  assert.equal(
    interestPromptVisible(store(String(now - 7 * 86400000)), now),
    true,
  );
  assert.equal(interestPromptVisible(store(String(now + 1)), now), true);
});
test("feed excludes ended events and keeps regional groups, new counts require member interest", () => {
  const now = new Date("2026-11-02T00:00:00+09:00");
  const items: HomeItem<{ image?: string }>[] = [
    {
      id: "own",
      publishedAt: now.getTime() - 1000,
      institutionIds: [],
      regionIds: ["s"],
      application: { deadlineType: "fixed", applicationEndAt: "2026-11-05" },
      data: {},
    },
    {
      id: "ended",
      publishedAt: now.getTime(),
      institutionIds: [],
      regionIds: ["s"],
      application: {
        deadlineType: "until_exhausted",
        eventEndAt: "2026-10-25",
      },
      data: {},
    },
    {
      id: "wide",
      publishedAt: now.getTime(),
      institutionIds: [],
      regionIds: ["n"],
      application: { deadlineType: "ongoing" },
      data: {},
    },
  ];
  const input = {
    items,
    favoriteIds: new Set<string>(),
    regionId: "s",
    regions: [
      { id: "s", name: "서울", level: "sido", parent_id: null },
      { id: "n", name: "전국", level: "nation", parent_id: null },
    ],
    baselineAt: now.getTime() - 86400000,
    memberInterest: false,
    now,
  };
  const guest = buildPosterFeed(input);
  assert.deepEqual(
    guest.own.map((i) => i.id),
    ["own"],
  );
  assert.equal(guest.wider.length, 1);
  assert.equal(guest.fresh.length, 0);
  assert.equal(guest.closing.length, 1);
  assert.equal(
    buildPosterFeed({ ...input, memberInterest: true }).fresh.length,
    1,
  );
});
test("default images are interleaved without dropping entries or changing publication-day rank", () => {
  const base = {
    publishedAt: Date.parse("2026-11-01"),
    institutionIds: [],
    application: {},
    display: {} as any,
    favorite: false,
  };
  const rows = Array.from({ length: 9 }, (_, i) => ({
    ...base,
    id: String(i),
    data: {
      image:
        i % 3 === 0
          ? "https://abc.supabase.co/storage/v1/object/public/poster/a.jpg"
          : undefined,
    },
  }));
  const mixed = mixFeedImages(rows);
  assert.equal(new Set(mixed.map((i) => i.id)).size, 9);
  let defaults = 0;
  for (const r of mixed) {
    defaults = optimizablePosterImage(r.data.image) ? 0 : defaults + 1;
    assert.ok(defaults <= 2);
  }
  const png = Buffer.alloc(24);
  png.write("PNG", 1);
  png.writeUInt32BE(500, 16);
  png.writeUInt32BE(700, 20);
  assert.deepEqual(readImageDimensions(png), { width: 500, height: 700 });
});
