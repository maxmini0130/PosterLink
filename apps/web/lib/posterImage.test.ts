import assert from "node:assert/strict";
import test from "node:test";
import { resolvePosterImageUrl } from "./posterImage";

test("Google Forms images use the image proxy to avoid cross-origin blocking", () => {
  const source = "https://docs.google.com/forms-images-rt/example=w740";
  assert.equal(resolvePosterImageUrl(source), `/api/image-proxy?url=${encodeURIComponent(source)}`);
});

test("ordinary HTTPS images remain direct and HTTP images use the proxy", () => {
  assert.equal(resolvePosterImageUrl("https://example.com/poster.jpg"), "https://example.com/poster.jpg");
  assert.equal(
    resolvePosterImageUrl("http://example.com/poster.jpg"),
    `/api/image-proxy?url=${encodeURIComponent("http://example.com/poster.jpg")}`,
  );
});
