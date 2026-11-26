export interface Requirement {
  text: string;
  priority: string; // "required" | "preferred"
}

export interface Enrichment {
  summary?: string;
  work_mode?: string;
  employment_type?: string;
  relocation?: string;
  visa_sponsorship?: boolean;
  regions?: string[];
  countries?: string[];
  cities?: string[];
  timezone_note?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  seniority?: string;
  experience_years_min?: number;
  english_level?: string;
  education_level?: string;
  skills?: string[];
  category?: string;
  domains?: string[];
  posting_language?: string;
  company_type?: string;
  company_size?: string;
  requirements?: Requirement[];
}

export interface Ghost {
  level: string;
  criteria: string[];
  criteria_total: number;
  contributors?: number;
  ats_checked_at?: string;
}

export interface Reality {
  class?: string;
  age_days?: number;
  repost_count?: number;
  mass_posting_count?: number;
  fake_freshness?: boolean;
}

export interface Job {
  public_slug: string;
  source?: string;
  manually_added?: boolean;
  external_id?: string;
  url: string;
  source_url?: string;
  title: string;
  company: string;
  company_slug?: string;
  location?: string;
  description?: string;
  direct_apply?: boolean;
  countries?: string[];
  regions?: string[];
  work_mode?: string;
  skills?: string[];
  cities?: string[];
  metros?: string[];
  collections?: string[];
  perks?: string[];
  engagement?: string[];
  ai_interview_reports?: number;
  is_tech?: string;
  requires_clearance?: boolean;
  enrichment?: Enrichment;
  reality?: Reality;
  ghost?: Ghost;
  apply_questions?: unknown;
  created_at?: string;
  posted_at?: string;
  updated_at?: string;
  view_count?: number;
  applied_count?: number;
  upvote_count?: number;
  downvote_count?: number;
  my_vote?: number;
}

export interface Slice<T> {
  items: T[];
  total?: number;
  hasMore: boolean;
  error?: string;
}

export interface JobCopy {
  public_slug: string;
  location?: string;
  apply_url?: string;
  posted_at?: string | null;
}

export interface FacetsData {
  total: number;
  facets: {
    category?: Record<string, number>;
    work_mode?: Record<string, number>;
    countries?: Record<string, number>;
    skills?: Record<string, number>;
  };
}
