export const SITEMAP_PAGE_SIZE = 1000;
export function escapeXml(value: string) {
  return value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
}
export function sitemapXml(
  entries: { url: string; updatedAt?: string | null }[],
  index = false,
) {
  const root = index ? "sitemapindex" : "urlset";
  const tag = index ? "sitemap" : "url";
  return `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<${tag}><loc>${escapeXml(entry.url)}</loc>${entry.updatedAt && !Number.isNaN(Date.parse(entry.updatedAt)) ? `<lastmod>${new Date(entry.updatedAt).toISOString()}</lastmod>` : ""}</${tag}>`).join("")}</${root}>`;
}
export function sitemapResponse(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
