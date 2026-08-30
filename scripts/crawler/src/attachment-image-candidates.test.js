import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAttachmentImageCandidates,
  mergeAttachmentImageCandidates,
} from "./attachment-image-candidates.js";
import { resolveImageContentType } from "./image-content-type.js";

test("named poster image attachments are promoted ahead of inline thumbnails", () => {
  const thumbnail = "https://youth.seoul.go.kr/atch/getImg.do?atchFileSn=2631371&ordr=1";
  const poster = "https://youth.seoul.go.kr/atch/fileDown.do?cnncSn=71102&ordr=3";
  const attachments = [
    { name: "교육 신청서.pdf", url: "https://example.com/form.pdf" },
    { name: "서울핀테크아카데미 포스터.png", url: poster },
  ];

  const result = mergeAttachmentImageCandidates(
    [thumbnail],
    attachments,
    "https://youth.seoul.go.kr/notice/71102",
  );

  assert.deepEqual(result.images, [poster, thumbnail]);
  assert.deepEqual(result.attachmentImageUrls, [poster]);
  assert.equal(result.attachmentCandidates[0].explicitlyPosterNamed, true);
});

test("all raster attachments are candidates but explicitly named posters sort first", () => {
  const candidates = collectAttachmentImageCandidates([
    { name: "현장사진.jpg", url: "/files/photo" },
    { name: "행사 포스터.webp", url: "/files/poster" },
    { name: "기관 로고", url: "/files/logo", contentType: "image/svg+xml" },
    { name: "신청양식.hwp", url: "/files/form" },
  ], "https://example.org/notice/1");

  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["행사 포스터.webp", "현장사진.jpg"],
  );
});

test("image bytes override generic attachment download MIME types", () => {
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  assert.equal(
    resolveImageContentType("application-download;charset=UTF-8", pngHeader),
    "image/png",
  );
  assert.equal(resolveImageContentType("application/pdf", Buffer.from("%PDF")), null);
});

test("rendered local attachment images are preserved as candidates", () => {
  const localPoster = "C:\\Users\\runner\\AppData\\Local\\Temp\\posterlink-pdf-render-1\\page-1.png";
  const result = mergeAttachmentImageCandidates(
    ["https://example.com/thumb.jpg"],
    [{ name: "notice PDF page 1", url: localPoster, contentType: "image/png" }],
    "https://example.org/notice/1",
  );

  assert.equal(result.images[0], localPoster);
  assert.equal(result.attachmentImageUrls[0], localPoster);
});
