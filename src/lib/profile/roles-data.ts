export interface RoleCategory {
  id: string;
  label: string;
}

export const POPULAR_ROLES: RoleCategory[] = [
  { id: 'software_engineering', label: 'Software Engineering' },
  { id: 'backend', label: 'Backend' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'fullstack', label: 'Full-Stack' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'devops', label: 'DevOps' },
];

export const ALL_ROLES: RoleCategory[] = [
  { id: 'software_engineering', label: 'Software Engineering' },
  { id: 'backend', label: 'Backend' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'fullstack', label: 'Full-Stack' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'devops', label: 'DevOps' },
  { id: 'sre', label: 'SRE' },
  { id: 'network_engineering', label: 'Network Engineering' },
  { id: 'system_administration', label: 'System Administration' },
  { id: 'telecommunications_engineering', label: 'Telecommunications Engineering' },
  { id: 'it_support', label: 'IT Support / Help Desk' },
  { id: 'data_engineering', label: 'Data Engineering' },
  { id: 'data_science', label: 'Data Science' },
  { id: 'data_analytics', label: 'Data Analytics' },
  { id: 'ml_ai', label: 'ML / AI' },
  { id: 'ai_engineering', label: 'AI Engineering' },
  { id: 'qa', label: 'QA' },
  { id: 'security', label: 'Security' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'embedded', label: 'Embedded' },
  { id: 'blockchain', label: 'Blockchain' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'design', label: 'Design' },
  { id: 'creative', label: 'Creative & Media' },
  { id: 'engineering_design', label: 'Engineering Design' },
  { id: 'industrial_engineering', label: 'Industrial Engineering' },
  { id: 'occupational_safety', label: 'Health & Safety (HSE)' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'skilled_trades', label: 'Skilled Trades' },
  { id: 'retail', label: 'Retail' },
  { id: 'hospitality', label: 'Hospitality' },
  { id: 'logistics', label: 'Logistics' },
  { id: 'education', label: 'Education' },
  { id: 'personal_services', label: 'Personal Services' },
  { id: 'administration', label: 'Administration' },
  { id: 'social_services', label: 'Social Services' },
  { id: 'science', label: 'Science & Lab' },
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'public_safety', label: 'Public Safety' },
  { id: 'product', label: 'Product' },
  { id: 'project_management', label: 'Project Management' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'support', label: 'Support' },
  { id: 'business_analysis', label: 'Business Analysis' },
  { id: 'solutions_engineering', label: 'Solutions Engineering' },
  { id: 'developer_relations', label: 'Developer Relations' },
  { id: 'technical_writing', label: 'Technical Writing' },
  { id: 'recruiting', label: 'Recruiting' },
  { id: 'hr', label: 'HR' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal' },
  { id: 'operations', label: 'Operations' },
  { id: 'customer_success', label: 'Customer Success' },
  { id: 'other', label: 'Other' },
];

export const SENIORITY_LEVELS = [
  'Intern',
  'Junior',
  'Middle',
  'Senior',
  'Lead',
  'Staff',
  'Principal',
  'C-level',
];

export const WORK_FORMAT_OPTIONS = ['Remote', 'Hybrid', 'On-site'];

export const POPULAR_JOB_LANGUAGES = [
  'English',
  'German',
  'French',
  'Spanish',
  'Hindi',
  'Mandarin',
  'Japanese',
  'Portuguese',
  'Arabic',
  'Russian',
  'Italian',
  'Dutch',
  'Polish',
];

export function getAllTimezones(): string[] {
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as any).supportedValuesOf === 'function') {
      const zones = (Intl as any).supportedValuesOf('timeZone');
      return ['UTC', ...new Set(zones)] as string[];
    }
  } catch {}
  return ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Asia/Calcutta', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney'];
}
