export interface UserProfile {
  id: string;
  nickname: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  age_band: string;
}

export interface Poster {
  id: string;
  title: string;
  source_org_name: string;
  application_end_at: string | null;
  status: 'draft' | 'published' | 'expired';
}
