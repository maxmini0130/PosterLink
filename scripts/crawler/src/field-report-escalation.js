export const FIELD_REPORT_THRESHOLD = 2;

export function groupFieldReports(reports = []) {
  const groups = new Map();
  for (const report of reports) {
    if (!report?.poster_id || !report?.field_key) continue;
    const key = `${report.poster_id}:${report.field_key}`;
    const existing = groups.get(key) ?? {
      poster_id: report.poster_id,
      field_key: report.field_key,
      report_count: 0,
      report_ids: [],
      latest_reported_at: null,
      notes: [],
    };
    existing.report_count += 1;
    if (report.id) existing.report_ids.push(report.id);
    if (report.note) existing.notes.push(String(report.note).slice(0, 300));
    if (!existing.latest_reported_at || String(report.created_at ?? "") > existing.latest_reported_at) {
      existing.latest_reported_at = report.created_at ?? null;
    }
    groups.set(key, existing);
  }
  return [...groups.values()];
}

export function buildFieldReportEscalationPlans({ reports = [], posters = [], threshold = FIELD_REPORT_THRESHOLD } = {}) {
  const posterMap = new Map(posters.map((poster) => [poster.id, poster]));
  return groupFieldReports(reports)
    .filter((group) => group.report_count >= threshold)
    .map((group) => {
      const poster = posterMap.get(group.poster_id) ?? null;
      return {
        ...group,
        title: poster?.title ?? null,
        poster_status: poster?.poster_status ?? null,
        should_move_to_review: poster?.poster_status === "published",
        should_zero_evidence: true,
        action_reason: `field_report_threshold_${group.report_count}`,
      };
    });
}
