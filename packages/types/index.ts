export type UserRole = 'user' | 'operator' | 'admin' | 'super_admin';
export type PosterStatus = 'draft' | 'review' | 'published' | 'hidden' | 'rejected' | 'closed' | 'archived';
export type CommentStatus = 'normal' | 'hidden' | 'deleted' | 'blocked';
export type ReportStatus = 'received' | 'reviewing' | 'actioned' | 'dismissed';

export interface UserProfile {
  id: string;
  nickname?: string;
  avatar_url?: string;
  role: UserRole;
  gender?: string;
  age_band?: string;
  primary_region_id?: string;
  is_notified?: boolean;
}

export interface Poster {
  id: string;
  title: string;
  source_org_name?: string;
  summary_short?: string;
  summary_long?: string;
  poster_status: PosterStatus;
  application_start_at?: string;
  application_end_at?: string;
  created_by?: string;
  published_at?: string;
  created_at?: string;
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
