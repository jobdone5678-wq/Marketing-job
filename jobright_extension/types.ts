export interface YearMonth {
  year: number;
  month?: number;
}

export interface Work {
  title: string;
  company: string;
  location?: string;
  country?: string;
  start?: YearMonth;
  end?: YearMonth;
  current?: boolean;
  description?: string;
  highlights?: string[];
  bullets?: string[];
}

export interface Education {
  school: string;
  degree: string;
  degreeShort?: string;
  major?: string;
  gpa?: string;
  country?: string;
  city?: string;
  state?: string;
  start?: YearMonth;
  end?: YearMonth;
  current?: boolean;
}

export interface FieldReport {
  id: string;
  label: string;
  status: 'filled' | 'flagged' | 'skipped';
  confidence: number;
  value?: string;
  reason?: string;
  required?: boolean;
}

export interface FillReport {
  url: string;
  ats: string;
  page: number;
  fields: FieldReport[];
  done: boolean;
  message?: string;
  cancelled?: boolean;
  current?: string;
}

export interface Profile {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  work: Work[];
  education: Education[];
  skills: string[];
  [key: string]: any;
}

export interface Answer {
  pattern: string;
  answer: string;
  source: string;
}

