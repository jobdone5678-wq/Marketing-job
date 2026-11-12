import type { ResumeExtraction } from '@/lib/ai/schemas';

// Server-side standalone resume extraction - mirrors the browser extension's local parsing
// No AI, no network calls, fully deterministic - uses only npm packages

export interface LocalCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  current_city: string | null;
  current_state: string | null;
  current_job_title: string | null;
  total_experience_years: string | null;
  primary_skills: string;
  secondary_skills: string | null;
  employment_history: Array<{ employer: string | null; title: string | null; start: string | null; end: string | null; bullets: string[] }>;
  education_history: Array<{ degree: string | null; institution: string | null; start: string | null; end: string | null }>;
  source_text: string;
  all_skills: string[];
}

function extractCandidateFromText(source: string, filename = ''): LocalCandidate {
  const raw = source.replace(/\r\n/g, '\n').trim();
  if (raw.length < 30) throw new Error('Resume text too short');

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const nameLines = lines.slice(0, 5).map(line => line.replace(/^(?:full[_ ]?name|candidate[_ ]?name|name)\s*:\s*/i, ''));
  const name = nameLines.find(line => /^[A-Za-z][A-Za-z .\'-]{2,70}$/i.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 5 && !/resume|summary|experience|curriculum|engineer|developer|skills|education|accountant/i.test(line.replace(/\s+/g, ''))) || '';
  if (!name) throw new Error('Candidate name could not be identified. Put the candidate name on its own line at the top of the resume.');

  const email = raw.match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || null;
  const phone = raw.match(/(?:\+\d{1,3}[ -]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/)?.[0] || null;
  const linkedin = raw.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] || null;

  // Skills extraction
  const skillsSection = raw.match(/(?:professional\s+)?skills[\s:]*\n([\s\S]*?)(?=\n\n|[A-Z])/i);
  const skills = skillsSection ? skillsSection[1].split(/[,;|·•]/).map((s: string) => s.trim()).filter((s: string) => s && s.length > 1 && !/@|https?:/.test(s)) : [];

  // Experience extraction
  const employmentHistory: LocalCandidate['employment_history'] = [];
  const experienceSection = raw.match(/(?:experience|employment)[\s:]*\n([\s\S]*?)(?=\n\n[A-Z]|\nSkills|\nEducation|$)/i);
  if (experienceSection) {
    const blocks = experienceSection[1].split(/\n\s*\n/).slice(0, 60);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const titleLine = lines[0] || '';
      const titleMatch = titleLine.match(/^(.+?)\s+[–—-]?\s+(.+)$/);
      if (titleMatch && titleMatch[2].length > 2) {
        employmentHistory.push({
          employer: titleMatch[2].trim(),
          title: titleMatch[1].trim(),
          start: null,
          end: null,
          bullets: lines.slice(1).map(b => b.replace(/^[-•*]\s*/, '')).filter(b => b.length > 10)
        });
      }
    }
  }

  // Estimate experience years from dates in employment history
  let experienceYears: number | null = null;
  if (employmentHistory.length > 0) {
    experienceYears = employmentHistory.length * 2; // Rough estimate
  }

  const sourceText = raw;

  return {
    id: 'local-' + Date.now(),
    full_name: name,
    email: email || null,
    phone: phone || null,
    linkedin_url: linkedin || null,
    current_city: null,
    current_state: null,
    current_job_title: employmentHistory[0]?.title || null,
    total_experience_years: experienceYears ? String(experienceYears) : null,
    primary_skills: skills.join(', '),
    secondary_skills: null,
    employment_history: employmentHistory,
    education_history: [],
    source_text: sourceText,
    all_skills: skills
  };
}

function estimateExperienceFromEntries(entries: Array<{ start: string | null; end: string | null }>): number | null {
  if (!entries.length) return null;
  const yearRegex = /\b(19|20)\d{2}\b/g;
  const years: number[] = [];
  for (const e of entries) {
    if (e.start) { const m = e.start.match(yearRegex); if (m) years.push(parseInt(m[0], 10)); }
    if (e.end) { const m = e.end.match(yearRegex); if (m) years.push(parseInt(m[0], 10)); }
  }
  if (years.length < 2) return entries.length * 2;
  years.sort((a, b) => a - b);
  return Math.round((years[years.length - 1] - years[0]) * 1.2);
}

export function extractResumeLocal(text: string, filename: string): ResumeExtraction {
  const candidate = extractCandidateFromText(text, filename);

  const fields: Record<string, unknown> = {
    full_name: candidate.full_name,
    email: candidate.email,
    phone: candidate.phone,
    linkedin_url: candidate.linkedin_url,
    current_city: null,
    current_state: null,
    current_job_title: candidate.current_job_title,
    total_experience_years: null,
    primary_skills: candidate.primary_skills,
    secondary_skills: candidate.secondary_skills,
    employment_types: null,
    authorized_in_usa: null,
    need_sponsorship_now: null,
    need_sponsorship_future: null,
    open_to_relocation: null,
    certifications: null
  };

  // Calculate total experience from history
  const historyEntries = candidate.employment_history.map(e => ({ start: e.start, end: e.end }));
  const expYears = estimateExperienceFromEntries(historyEntries);
  if (expYears !== null) {
    fields.total_experience_years = String(expYears);
  }

  // Generate evidence from source text
  const evidence: { field: string; snippet: string; page: number | null }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (!value || (typeof value === 'string' && !value.trim())) continue;
    const strVal = String(value);
    const idx = text.toLowerCase().indexOf(strVal.toLowerCase().slice(0, 50));
    if (idx >= 0) {
      evidence.push({
        field,
        snippet: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 80)).replace(/\n/g, ' ').trim(),
        page: 1
      });
    }
  }

  return {
    fields: fields as any,
    employmentHistory: candidate.employment_history.map(e => ({
      employer: e.employer,
      title: e.title,
      start: e.start,
      end: e.end,
      location: null,
      evidence: (e.bullets.length > 0 ? e.bullets[0] : [e.employer, e.title].filter(Boolean).join(' at ') || 'employment') + ' (extracted)'
    })),
    educationHistory: candidate.education_history.map(e => ({
      degree: e.degree,
      institution: e.institution,
      start: e.start,
      end: e.end,
      evidence: [e.degree, e.institution].filter(Boolean).join(' at ') || 'education'
    })),
    evidence,
    warnings: [
      'Extracted using deterministic text parser (no AI). Review all evidence before saving.',
      'This method does not use AI - all extraction is done via regex pattern matching.'
    ]
  } as ResumeExtraction;
}