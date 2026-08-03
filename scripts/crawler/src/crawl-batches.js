function readIntegerOption(args, name, fallback) {
  const index = args.indexOf(name);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  const raw = index >= 0 ? args[index + 1] : inline?.slice(name.length + 1);

  if (raw == null) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return Number(raw);
}

export function parseBatchOptions(args = []) {
  const batchCount = readIntegerOption(args, "--batch-count", 1);
  const batchIndex = readIntegerOption(args, "--batch-index", 0);

  if (batchCount < 1) {
    throw new Error("--batch-count must be at least 1");
  }
  if (batchIndex >= batchCount) {
    throw new Error("--batch-index must be smaller than --batch-count");
  }

  return { batchCount, batchIndex };
}

export function parseExcludedSiteIds(args = []) {
  const index = args.indexOf("--exclude-site");
  const inline = args.find((arg) => arg.startsWith("--exclude-site="));
  const raw =
    index >= 0 ? args[index + 1] : inline?.slice("--exclude-site=".length);

  return new Set(
    String(raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function selectCrawlBatch(items, options = {}) {
  const { batchCount = 1, batchIndex = 0 } = options;

  if (!Number.isInteger(batchCount) || batchCount < 1) {
    throw new Error("batchCount must be a positive integer");
  }
  if (
    !Number.isInteger(batchIndex) ||
    batchIndex < 0 ||
    batchIndex >= batchCount
  ) {
    throw new Error("batchIndex must be a valid zero-based batch index");
  }

  return items.filter((_, index) => index % batchCount === batchIndex);
}

export function buildBatchSummaryPath(date, options = {}) {
  const { batchCount = 1, batchIndex = 0 } = options;
  const dateLabel =
    date instanceof Date ? date.toISOString().slice(0, 10) : String(date);
  const batchSuffix =
    batchCount > 1 ? `_batch-${batchIndex + 1}-of-${batchCount}` : "";

  return `data/results/all_${dateLabel}${batchSuffix}.json`;
}
