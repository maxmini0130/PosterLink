/**
 * The v6.1 deadline verification columns (supabase/migrations/
 * 20261110010000_add_deadline_verification_fields.sql) as read by the poster
 * lists, and the mapping to getDeadlinePresentation's input.
 */
import type { DeadlineInput, DeadlineStatus } from "./deadlinePresentation";

/** Appended to explicit poster column lists. */
export const DEADLINE_VERIFICATION_COLUMNS =
  "deadline_status,deadline_time_verified,reception_verified,session_rule_text,session_rule_verified,last_session_deadline_date,deadline_label,deadline_note";

type ColumnProbeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (
        count: number,
      ) => PromiseLike<{ error: { code?: string; message?: string } | null }>;
    };
  };
};

let probed: { value: boolean; at: number } | null = null;
const RECHECK_MS = 5 * 60 * 1000;

function isMissingColumn(error: { code?: string; message?: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist|could not find .* column/i.test(
      error.message ?? "",
    )
  );
}

/**
 * Whether 20261110010000 is applied where `client` reads. A "yes" is kept;
 * a "no" is checked again after five minutes, so lists start reading the
 * columns soon after the migration without a redeploy.
 */
export async function deadlineColumnsAvailable(client: ColumnProbeClient) {
  if (probed && (probed.value || Date.now() - probed.at < RECHECK_MS))
    return probed.value;
  try {
    const { error } = await client
      .from("posters")
      .select("deadline_status")
      .limit(1);
    probed = { value: !error || !isMissingColumn(error), at: Date.now() };
  } catch {
    probed = { value: false, at: Date.now() };
  }
  return probed.value;
}

/** `base` plus the confirmation columns when they exist. */
export async function withDeadlineColumns(
  client: ColumnProbeClient,
  base: string,
) {
  return (await deadlineColumnsAvailable(client))
    ? `${base},${DEADLINE_VERIFICATION_COLUMNS}`
    : base;
}

export type DeadlineVerificationRow = {
  deadline_status?: string | null;
  deadline_time_verified?: boolean | null;
  reception_verified?: boolean | null;
  session_rule_text?: string | null;
  session_rule_verified?: boolean | null;
  last_session_deadline_date?: string | null;
  deadline_label?: string | null;
  deadline_note?: string | null;
};

export type DeadlineVerification = Pick<
  DeadlineInput,
  | "deadlineStatus"
  | "deadlineTimeVerified"
  | "receptionVerified"
  | "sessionRuleText"
  | "sessionRuleVerified"
  | "lastSessionDeadlineDate"
  | "deadlineLabel"
  | "deadlineNote"
>;

const STATUSES = new Set<DeadlineStatus>([
  "verified",
  "unverified",
  "conflict",
]);

/** Missing columns claim nothing (unverified, false), as the migration's defaults do. */
export function deadlineVerificationFromRow(
  row: DeadlineVerificationRow | null | undefined,
): DeadlineVerification {
  const status = row?.deadline_status as DeadlineStatus | undefined;
  return {
    deadlineStatus: status && STATUSES.has(status) ? status : "unverified",
    deadlineTimeVerified: row?.deadline_time_verified === true,
    receptionVerified: row?.reception_verified === true,
    sessionRuleText: row?.session_rule_text ?? null,
    sessionRuleVerified: row?.session_rule_verified === true,
    lastSessionDeadlineDate: row?.last_session_deadline_date ?? null,
    deadlineLabel: row?.deadline_label ?? null,
    deadlineNote: row?.deadline_note ?? null,
  };
}

export type DeadlineCardFields = {
  applicationStartAt?: string | null;
  deadline?: string | null;
  deadlineType?: string | null;
  eventEndAt?: string | null;
  posterStatus?: string | null;
  contentState?: "closed" | "information";
  deadlineVerification?: DeadlineVerification;
  applied?: boolean | null;
};

/** getDeadlinePresentation input for a poster card. */
export function cardDeadlineInput(
  card: DeadlineCardFields,
  now?: Date,
): DeadlineInput {
  return {
    ...(card.deadlineVerification ?? deadlineVerificationFromRow(null)),
    deadlineType: card.deadlineType,
    applicationStartAt: card.applicationStartAt,
    applicationEndAt: card.deadline,
    eventEndAt: card.eventEndAt,
    posterStatus:
      card.posterStatus ?? (card.contentState === "closed" ? "closed" : null),
    applied: card.applied ?? false,
    now,
  };
}
