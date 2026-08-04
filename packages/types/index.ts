export type UserRole = "user" | "operator" | "admin" | "super_admin";
export type PosterStatus =
  | "draft"
  | "review"
  | "published"
  | "hidden"
  | "rejected"
  | "closed"
  | "archived";
export type CommentStatus = "normal" | "hidden" | "deleted" | "blocked";
export type ReportStatus = "received" | "reviewing" | "actioned" | "dismissed";
export type PosterDeadlineType =
  | "fixed"
  | "ongoing"
  | "until_exhausted"
  | "scheduled"
  | "unknown";
export type PosterVerificationStatus =
  | "unverified"
  | "needs_review"
  | "verified"
  | "rejected";

export interface UserProfile {
  id: string;
  nickname?: string;
  avatar_url?: string;
  role: UserRole;
  gender?: string;
  age_band?: string;
  primary_region_id?: string;
  is_notified?: boolean;
  expo_push_token?: string;
}

export interface Poster {
  id: string;
  title: string;
  source_org_name?: string;
  summary_short?: string;
  summary_long?: string;
  poster_status: PosterStatus;
  thumbnail_url?: string;
  application_start_at?: string;
  application_end_at?: string;
  organizer_name?: string;
  application_organization_name?: string;
  deadline_type?: PosterDeadlineType;
  event_start_at?: string;
  event_end_at?: string;
  eligibility_summary?: string;
  target_age_min?: number;
  target_age_max?: number;
  participation_fee?: string;
  benefits_summary?: string;
  recruitment_count?: string;
  application_method?: string;
  required_documents?: string;
  contact_info?: string;
  event_location?: string;
  verified_at?: string;
  verification_status?: PosterVerificationStatus;
  data_confidence?: number;
  created_by?: string;
  published_at?: string;
  created_at?: string;
  field_verification?: {
    deadlineMatches?: boolean;
    correctedDeadline?: string | null;
    orgNameMatches?: boolean;
    correctedOrgName?: string | null;
    confidence?: number;
    decision?: string;
    reason?: string;
    organization?: {
      sourceOrgName?: string;
      organizerName?: string;
      operatorName?: string;
      displayOrgName?: string;
      confidence?: number;
      evidence?: string;
    };
    readableNotice?: {
      facts?: Record<string, string | null>;
      source?: string;
    };
    [key: string]: unknown;
  } | null;
}

export interface PosterCardData {
  id: string;
  title: string;
  org?: string;
  deadline?: string;
  image?: string;
  tags?: string[];
}

export interface Category {
  id: string;
  name: string;
  code: string;
  sort_order?: number;
}

export interface Region {
  id: string;
  name: string;
  code: string;
  level: string;
  full_name?: string;
}

export interface Comment {
  id: string;
  poster_id: string;
  user_id: string;
  parent_id?: string;
  body: string;
  status: CommentStatus;
  is_official?: boolean;
  created_at?: string;
}

export interface CommentReport {
  id: string;
  comment_id: string;
  reporter_user_id: string;
  reason_code: string;
  reason_detail?: string;
  report_status: ReportStatus;
  created_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type:
    | "favorite_deadline"
    | "new_match"
    | "comment_reply"
    | "comment_mention"
    | "system_notice";
  title: string;
  body: string;
  target_type?: "poster" | "comment" | "system";
  target_id?: string;
  is_read: boolean;
  created_at?: string;
}
