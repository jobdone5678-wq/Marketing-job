export interface WorkExperience {
  id: string;
  company: string;
  role: string;
  location?: string;
  start?: string;
  end?: string;
  current?: boolean;
  achievements: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  link?: string;
  start?: string;
  end?: string;
  description?: string;
}

export interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  year?: string;
  month?: string;
  yearOnly?: boolean;
}

export interface ScreeningAnswers {
  authorized_countries: string[];
  visa_sponsorship_needed: 'yes' | 'no' | '';
  willing_to_relocate: 'yes' | 'no' | '';
  age_18_or_older: 'yes' | 'no' | '';
  privacy_consent: 'yes' | 'no' | '';
  notice_period_days: string;
  desired_salary_amount: string;
  desired_salary_currency: string;
  desired_salary_period: 'year' | 'month' | 'day' | 'hour' | '';
  country_specific_answers: Record<string, string>;
}

export interface CandidateContacts {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface CandidateLocation {
  workFormat: string[];
  whereBased: string;
  timezone: string;
}

export interface CandidateProfileState {
  photoUrl: string | null;
  cv: {
    filename: string;
    uploadedAt: string | null;
    rawText: string;
    sizeFormatted: string;
    atsReadable: boolean;
    yearsExperience: number;
  } | null;
  roles: string[];
  seniorities: string[];
  jobLanguages: string[];
  contacts: CandidateContacts;
  location: CandidateLocation;
  skills: string[];
  excludedSkills: string[];
  excludedSources: string[];
  excludedCompanies: string[];
  workHistory: WorkExperience[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  languages: string[];
  certifications: string[];
  screeningAnswers: ScreeningAnswers;
}
