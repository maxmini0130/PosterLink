/**
 * Institution follow prompt (UI plan 3-4 C 「기관 팔로우 제안」, instruction 9).
 * Offered for the actual organiser only, at most once per visit, and never
 * again for an institution the person followed or turned down.
 */
import { PROMPT_ID } from "./guestStore";

type Store = Pick<Storage, "getItem" | "setItem">;

export const FOLLOW_PROMPT_KEY = "pl.follow_prompt.v1";
export const FOLLOW_PROMPT_VISIT_KEY = "pl.follow_prompt.visit.v1";
const MAX_DECISIONS = 200;

export type FollowTrigger = "favorite" | "dwell" | "scroll_end";
export type FollowDecision = "followed" | "dismissed";

function readDecisions(store: Store): Record<string, FollowDecision> {
  try {
    const value = JSON.parse(store.getItem(FOLLOW_PROMPT_KEY) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, FollowDecision> = {};
    for (const [id, decision] of Object.entries(value))
      if (decision === "followed" || decision === "dismissed")
        out[id] = decision;
    return out;
  } catch {
    return {};
  }
}

export function canOfferFollow(input: {
  institutionId: string | null | undefined;
  /** Institutions the member already follows. */
  followedIds?: ReadonlySet<string>;
  local: Store;
  session: Store;
}) {
  const { institutionId } = input;
  if (!institutionId) return false;
  if (input.followedIds?.has(institutionId)) return false;
  if (readDecisions(input.local)[institutionId]) return false;
  try {
    return !input.session.getItem(FOLLOW_PROMPT_VISIT_KEY);
  } catch {
    // Without session storage the once-per-visit rule cannot hold: stay quiet.
    return false;
  }
}

/** Claims this visit's single prompt; false when it could not be recorded. */
export function markFollowPromptShown(session: Store, promptId: string) {
  try {
    session.setItem(FOLLOW_PROMPT_VISIT_KEY, promptId);
    return true;
  } catch {
    return false;
  }
}

export function rememberFollowDecision(
  local: Store,
  institutionId: string,
  decision: FollowDecision,
) {
  const decisions = readDecisions(local);
  delete decisions[institutionId];
  const entries = [...Object.entries(decisions), [institutionId, decision]];
  try {
    local.setItem(
      FOLLOW_PROMPT_KEY,
      JSON.stringify(Object.fromEntries(entries.slice(-MAX_DECISIONS))),
    );
  } catch {
    /* storage blocked: the prompt may be offered again next visit */
  }
}

export function newFollowPromptId(random: () => number = Math.random) {
  const id = `fp_${Date.now().toString(36)}${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0")}`;
  return PROMPT_ID.test(id) ? id : "fp_unknown0";
}
