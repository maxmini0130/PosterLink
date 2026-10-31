export function assertPublicDiscoveryQuery(
  result: { error?: { code?: string } | null },
  operation: string,
) {
  if (!result.error) return;
  console.error("Public discovery lookup failed", {
    operation,
    code: result.error.code,
  });
  throw new Error(
    "공고 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}
