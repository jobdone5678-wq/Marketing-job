import type { ResumeExtraction } from '@/lib/ai/schemas';

// Server-side standalone resume extraction - mirrors the browser extension's local parsing
// No AI, no network calls, fully deterministic - uses only npm packages
// Now uses parsing logic from resume-parser/server/resumeParser.ts

export interface LocalCandidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  current_city: string | null;
  current_state: string | null;
  current_job_title: string | null;
  total_experience_years: string | null;
  primary_skills: string;
  secondary_skills: string | null;
  employment_history: Array<{ employer: string | null; title: string | null; start: string | null; end: string | null; bullets: string[] }>;
  education_history: Array<{ degree: string | null; institution: string | null; field: string | null; dates: string | null }>;
  source_text: string;
  all_skills: string[];
}

// Skill taxonomy from resume-parser
const SKILL_TAXONOMY: Record<string, string[]> = {
  JavaScript: ["javascript", "js", "ecmascript"],
  TypeScript: ["typescript", "ts"],
  React: ["react", "reactjs", "react.js"],
  "Next.js": ["next.js", "nextjs", "next"],
  "Node.js": ["node", "nodejs", "node.js"],
  Express: ["express", "express.js", "expressjs"],
  Python: ["python"],
  Java: ["java"],
  "C++": ["c++", "cpp"],
  "C#": ["c#", "csharp"],
  C: ["c"],
  Go: ["golang", "go"],
  Rust: ["rust"],
  PHP: ["php"],
  Ruby: ["ruby", "ruby on rails", "rails"],
  SQL: ["sql"],
  PostgreSQL: ["postgres", "postgresql", "pgvector"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  Prisma: ["prisma", "prisma orm"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  AWS: ["aws", "amazon web services"],
  Azure: ["azure", "microsoft azure"],
  GCP: ["gcp", "google cloud", "google cloud platform"],
  Git: ["git"],
  "GitHub Actions": ["github actions"],
  "CI/CD": ["ci/cd", "ci-cd", "cicd"],
  "REST APIs": ["rest", "rest api", "rest apis", "restful api", "restful apis"],
  GraphQL: ["graphql"],
  WebSockets: ["websockets", "websocket", "socket.io"],
  HTML: ["html", "html5"],
  CSS: ["css", "css3"],
  "Tailwind CSS": ["tailwind", "tailwind css", "tailwindcss"],
  Figma: ["figma"],
  Tableau: ["tableau"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  TensorFlow: ["tensorflow"],
  PyTorch: ["pytorch"],
  "scikit-learn": ["scikit-learn", "sklearn"],
  Vitest: ["vitest"],
  Jest: ["jest"],
  FastAPI: ["fastapi"],
  Linux: ["linux", "unix"],
};

// Section heading patterns from resume-parser
const SECTION_ALIASES: Record<string, RegExp> = {
  skills: /^(?:technical\s+)?(?:skills|technical\s+skills|core\s+competencies|technologies|tools\s*&?\s*technologies|skills\s*&?\s*tools)\s*:?$/i,
  experience: /^(?:professional\s+|work\s+)?(?:experience|employment|work\s+history|career\s+history|internships|industry\s+experience)\s*:?$/i,
  education: /^(?:education|academic\s+background|academic\s+qualifications|qualifications|educational\s+background|studies)\s*:?$/i,
  projects: /^(?:selected\s+|key\s+|featured\s+|personal\s+|academic\s+)?projects\s*:?$/i,
  certifications: /^(?:certifications|licenses\s*&?\s*certifications|certificates|courses)\s*:?$/i,
  profiles: /^(?:profiles|links|social\s+links|online\s+presence|contact|contact\s+information)\s*:?$/i,
  summary: /^(?:summary|professional\s+summary|profile|about\s+me|career\s+objective|objective)\s*:?$/i,
  publications: /^(?:publications|research|patents|awards|honors|achievements)\s*:?$/i,
};

function clean(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function linesOf(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, "")
    .split("\n")
    .map(clean)
    .filter(Boolean);
}

function normalizeUrl(value: string, kind: "linkedin" | "github"): string | null {
  const pattern = kind === "linkedin"
    ? /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*/i
    : /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*/i;
  const match = value.match(pattern);
  if (!match) return null;
  const pathWithoutProtocol = match[0].replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[.,;)]+$/, "");
  return `https://${pathWithoutProtocol}`;
}

function extractEmail(text: string): string | null {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function extractPhone(text: string): string | null {
  const candidates = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) ?? [];
  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15 && !/^(?:19|20)\d{2}/.test(digits)) {
      return clean(candidate);
    }
  }
  return null;
}

function extractName(lines: string[], email: string | null): string | null {
  const emailIndex = email ? lines.findIndex((line) => line.toLowerCase().includes(email)) : -1;
  const searchLimit = emailIndex >= 0 ? Math.min(emailIndex + 1, 8) : Math.min(lines.length, 8);
  const candidates = lines.slice(0, searchLimit).filter((line) => {
    if (line.length < 3 || line.length > 50) return false;
    if (/[@:/|•*▪●]|\d{3,}/.test(line)) return false;
    // Only filter out if the entire line matches these keywords exactly (case-insensitive, ignoring whitespace)
    const normalizedLine = line.replace(/\s+/g, '').toLowerCase();
    if (/^(resume|summary|experience|curriculum|skills|education|accountant)$/.test(normalizedLine)) return false;
    // Filter out lines that are purely role titles (not containing actual name)
    if (/^(engineer|developer|scientist|manager|intern|full[-]?stack|frontend|backend|analyst|designer|architect|consultant|specialist|officer|assistant|lead)$/i.test(normalizedLine)) return false;
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\'-]+$/.test(line);
  });
  return candidates.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)[0] ?? (candidates[0] || null);
}

function sectioned(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const matched = Object.entries(SECTION_ALIASES).find(([, pattern]) => pattern.test(line));
    if (matched) {
      current = matched[0];
      sections[current] ??= [];
      continue;
    }
    sections[current] ??= [];
    sections[current].push(line);
  }
  return sections;
}

function extractSkills(text: string, skillLines: string[]): string[] {
  const source = `${skillLines.join(" ")} ${text}`.toLowerCase();
  const matched = new Set<string>();

  for (const [canonical, aliases] of Object.entries(SKILL_TAXONOMY)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|[^a-z0-9+#\\.])${escaped}(?=$|[^a-z0-9+#\\.])`, "i");
      if (regex.test(source)) {
        matched.add(canonical);
        break;
      }
    }
  }
  return Array.from(matched);
}

function extractDates(value: string): string | null {
  return (
    value.match(/(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4})\s*(?:-|–|to)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}|present|current)/i)?.[0] ??
    value.match(/\b(?:19|20)\d{2}\s*[-–]\s*(?:\b(?:19|20)\d{2}\b|present|current)/i)?.[0] ??
    null
  );
}

const DEGREE_REGEX = /\b(?:B\.?Tech|B\.?E\.?|B\.?S\.?|B\.?Sc|B\.?A\.?|B\.?Com|BCA(?:\s*\(Honou?rs?\))?|M\.?Tech|M\.?E\.?|M\.?S\.?|M\.?Sc|M\.?A\.?|M\.?Com|MCA|MBA|Ph\.?D\.?|Bachelor(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Master(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Doctor(?:ate)?|Diploma)\b/i;
const INSTITUTION_REGEX = /\b(?:University|College|Institute|School|Academy|Polytechnic|IIT|NIT|BITS|Campus)\b/i;

function extractEducation(lines: string[]): Array<{ degree: string | null; institution: string | null; field: string | null; dates: string | null }> {
  const items: Array<{ degree: string | null; institution: string | null; field: string | null; dates: string | null }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasDegree = DEGREE_REGEX.test(line);
    const hasInst = INSTITUTION_REGEX.test(line);
    const dates = extractDates(line) ?? (lines[i + 1] ? extractDates(lines[i + 1]) : null);

    if (hasDegree || hasInst) {
      let degree: string | null = null;
      let institution: string | null = null;
      let field: string | null = null;

      if (hasDegree && hasInst) {
        degree = line.match(DEGREE_REGEX)?.[0] || null;
        institution = line.split(/,|—| - /).find((p) => INSTITUTION_REGEX.test(p))?.trim() || null;
      } else if (hasDegree) {
        degree = line.match(DEGREE_REGEX)?.[0] || line;
        const nextOrPrev = [lines[i - 1], lines[i + 1]].find((l) => l && INSTITUTION_REGEX.test(l));
        if (nextOrPrev) {
          institution = nextOrPrev.split(/,|—| - /).find((p) => INSTITUTION_REGEX.test(p))?.trim() || nextOrPrev;
        }
      } else if (hasInst) {
        institution = line.split(/,|—| - /).find((p) => INSTITUTION_REGEX.test(p))?.trim() || line;
        const nextOrPrev = [lines[i + 1], lines[i - 1]].find((l) => l && DEGREE_REGEX.test(l));
        if (nextOrPrev) {
          degree = nextOrPrev.match(DEGREE_REGEX)?.[0] || nextOrPrev;
        }
      }

      // Check field of study
      const checkLines = [line, lines[i + 1]].filter(Boolean);
      for (const cl of checkLines) {
        const afterComma = cl.split(/,\s*/);
        if (afterComma.length > 1) {
          const candidate = afterComma[afterComma.length - 1].replace(dates || "", "").trim();
          if (candidate && !DEGREE_REGEX.test(candidate) && !INSTITUTION_REGEX.test(candidate) && candidate.length > 2 && candidate.length < 50) {
            field = candidate;
            break;
          }
        }
        const fieldMatch = cl.match(/\b(?:in|of)\s+([A-Za-z &/-]{3,40})/i);
        if (fieldMatch && !INSTITUTION_REGEX.test(fieldMatch[1]) && !DEGREE_REGEX.test(fieldMatch[1])) {
          field = fieldMatch[1].trim();
          break;
        }
      }

      if (degree || institution) {
        items.push({
          degree: degree ? clean(degree.replace(dates || "", "").replace(/^[,\s—–-]+|[,\s—–-]+$/g, "")) : null,
          institution: institution ? clean(institution.replace(dates || "", "").replace(/^[,\s—–-]+|[,\s—–-]+$/g, "")) : null,
          field: field ? clean(field.replace(dates || "", "")) : null,
          dates,
        });
      }
    }
  }

  // Deduplicate entries
  return items
    .filter(
      (item, index, array) =>
        index ===
        array.findIndex(
          (candidate) =>
            (candidate.institution && candidate.institution === item.institution) ||
            (candidate.degree && candidate.degree === item.degree && candidate.dates === item.dates)
        )
    )
    .slice(0, 6);
}

const BULLET_REGEX = /^[\s•▪●*–—•●▪◦⁃-]+\s*/;

function extractExperience(lines: string[]): Array<{ company: string | null; role: string | null; dates: string | null; description: string[] }> {
  const entries: Array<{ company: string | null; role: string | null; dates: string | null; description: string[] }> = [];
  let current: { company: string | null; role: string | null; dates: string | null; description: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = BULLET_REGEX.test(line);

    if (isBullet) {
      const cleanedBullet = line.replace(BULLET_REGEX, "").trim();
      if (cleanedBullet) {
        if (current) {
          current.description.push(cleanedBullet);
        }
      }
      continue;
    }

    const dates = extractDates(line);
    const hasRoleKeyword = /\b(?:engineer|developer|scientist|manager|analyst|designer|intern|lead|consultant|architect|specialist|officer|assistant|member|contributor)\b/i.test(line);
    const isExplicitHeading = (line.includes("—") || line.includes(" - ") || line.includes(" | ")) && (dates || hasRoleKeyword);

    if (isExplicitHeading || (dates && hasRoleKeyword)) {
      const lineWithoutDates = (dates ? line.replace(dates, "") : line).replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "").trim();
      const parts = lineWithoutDates.split(/(?:\s+[—–-]\s+|\s*\|\s*)/).filter(Boolean);

      let role: string | null = null;
      let company: string | null = null;

      if (parts.length >= 2) {
        if (hasRoleKeyword && !/\b(?:engineer|developer|scientist|manager|analyst|designer|intern|lead|consultant|architect|specialist|officer|assistant|member|contributor)\b/i.test(parts[0])) {
          company = parts[0].trim();
          role = parts.slice(1).join(" — ").trim();
        } else if (hasRoleKeyword || parts[0].length < parts[1].length) {
          role = parts[0].trim();
          company = parts.slice(1).join(" — ").trim();
        } else {
          company = parts[0].trim();
          role = parts.slice(1).join(" — ").trim();
        }
      } else {
        if (hasRoleKeyword) {
          role = lineWithoutDates;
          if (lines[i + 1] && !BULLET_REGEX.test(lines[i + 1]) && !extractDates(lines[i + 1])) {
            company = lines[i + 1];
            i++;
          }
        } else {
          company = lineWithoutDates;
        }
      }

      if (role || company) {
        const cleanRole = role ? clean(role.replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "")) : null;
        const cleanCompany = company ? clean(company.replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "")) : null;
        current = {
          role: cleanRole || null,
          company: cleanCompany || null,
          dates,
          description: [],
        };
        entries.push(current);
      }
    } else if (current && current.description.length > 0) {
      // Append multi-line wrap to previous description bullet
      const lastIndex = current.description.length - 1;
      current.description[lastIndex] = `${current.description[lastIndex]} ${clean(line)}`;
    }
  }

  return entries.slice(0, 10);
}

function parseResumeText(text: string): {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  education: Array<{degree: string | null; institution: string | null; field: string | null; dates: string | null}>;
  experience: Array<{company: string | null; role: string | null; dates: string | null; description: string[]}>;
  linkedin: string | null;
  github: string | null;
} {
  const lines = linesOf(text);
  const normalized = lines.join("\n");
  const email = extractEmail(normalized);
  const phone = extractPhone(normalized);
  const sections = sectioned(lines);
  const linkedin = normalizeUrl(normalized, "linkedin");
  const github = normalizeUrl(normalized, "github");

  return {
    name: extractName(lines, email),
    email,
    phone,
    skills: extractSkills(normalized, sections.skills ?? []),
    education: extractEducation(sections.education ?? lines),
    experience: extractExperience(sections.experience ?? lines),
    linkedin,
    github,
  };
}

function estimateExperienceYears(experience: Array<{ dates: string | null }>): number | null {
  if (!experience.length) return null;
  const yearRegex = /\b(19|20)\d{2}\b/g;
  const years: number[] = [];
  for (const e of experience) {
    if (e.dates) {
      const matches = e.dates.match(yearRegex);
      if (matches) years.push(...matches.map(y => parseInt(y, 10)));
    }
  }
  if (years.length < 2) return experience.length * 2;
  years.sort((a, b) => a - b);
  return Math.round((years[years.length - 1] - years[0]) * 1.2);
}

function extractCandidateFromText(source: string, filename = ''): LocalCandidate {
  const raw = source.replace(/\r\n/g, '\n').trim();
  if (raw.length < 30) throw new Error('Resume text too short');

  // Use the resume-parser logic for comprehensive extraction
  const parsed = parseResumeText(raw);

  const experienceYears = estimateExperienceYears(parsed.experience);

  // Convert experience bullets to the expected format
  const employmentHistory = parsed.experience.map(exp => ({
    employer: exp.company,
    title: exp.role,
    start: exp.dates ? exp.dates.split(' – ')[0] || exp.dates.split(' - ')[0] || null : null,
    end: exp.dates ? exp.dates.split(' – ')[1] || exp.dates.split(' - ')[1] || null : null,
    bullets: exp.description
  }));

  // Convert education to the expected format
  const educationHistory = parsed.education.map(edu => ({
    degree: edu.degree,
    institution: edu.institution,
    field: edu.field,
    dates: edu.dates
  }));

  return {
    id: 'local-' + Date.now(),
    full_name: parsed.name || '',
    email: parsed.email,
    phone: parsed.phone,
    linkedin_url: parsed.linkedin,
    github_url: parsed.github,
    current_city: null,
    current_state: null,
    current_job_title: parsed.experience[0]?.role || null,
    total_experience_years: experienceYears ? String(experienceYears) : null,
    primary_skills: parsed.skills.join(', '),
    secondary_skills: null,
    employment_history: employmentHistory,
    education_history: educationHistory,
    source_text: raw,
    all_skills: parsed.skills
  };
}

export function extractResumeLocal(text: string, filename: string): ResumeExtraction {
  const candidate = extractCandidateFromText(text, filename);
  const parsed = parseResumeText(text);

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
  let expYears: number | null = null;

  // Estimate from employment history dates
  if (candidate.employment_history.length > 0) {
    const totalYears = candidate.employment_history.reduce((sum, entry) => {
      if (entry.start && entry.end) {
        const startYear = parseInt(entry.start, 10);
        const endYear = parseInt(entry.end, 10);
        if (!isNaN(startYear) && !isNaN(endYear)) {
          return sum + (endYear - startYear);
        }
      }
      return sum;
    }, 0);
    if (totalYears > 0) {
      expYears = Math.round(totalYears * 1.2);
    } else {
      // Fallback: estimate 2 years per position if no date ranges found
      expYears = candidate.employment_history.length * 2;
    }
  }

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

  // Generate evidence from source text for employment history
  const employmentEvidence: { field: string; snippet: string; page: number | null }[] = [];
  for (const entry of candidate.employment_history) {
    const parts = [entry.employer, entry.title].filter(Boolean) as string[];
    if (parts.length > 0) {
      const searchStr = parts[0];
      const idx = text.toLowerCase().indexOf(searchStr.toLowerCase());
      if (idx >= 0) {
        employmentEvidence.push({
          field: 'employment_history',
          snippet: text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 120)).replace(/\n/g, ' ').trim(),
          page: 1
        });
      }
    }
  }

  // Generate evidence from source text for education history
  const educationEvidence: { field: string; snippet: string; page: number | null }[] = [];
  for (const entry of candidate.education_history) {
    const parts = [entry.degree, entry.institution].filter(Boolean) as string[];
    if (parts.length > 0) {
      const searchStr = parts[0];
      const idx = text.toLowerCase().indexOf(searchStr.toLowerCase());
      if (idx >= 0) {
        educationEvidence.push({
          field: 'education_history',
          snippet: text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 120)).replace(/\n/g, ' ').trim(),
          page: 1
        });
      }
    }
  }

  // Generate evidence from source text for skills
  const skillsEvidence: { field: string; snippet: string; page: number | null }[] = [];
  if (candidate.primary_skills) {
    const idx = text.toLowerCase().indexOf(candidate.primary_skills.toLowerCase().slice(0, 30));
    if (idx >= 0) {
      skillsEvidence.push({
        field: 'primary_skills',
        snippet: text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 100)).replace(/\n/g, ' ').trim(),
        page: 1
      });
    }
  }

  const allEvidence = [...evidence, ...employmentEvidence, ...educationEvidence, ...skillsEvidence];

  return {
    fields: fields as any,
    employmentHistory: candidate.employment_history.map(e => ({
      employer: e.employer,
      title: e.title,
      start: e.start,
      end: e.end,
      location: null,
      evidence: e.bullets.length > 0
        ? e.bullets[0]
        : [e.employer, e.title].filter(Boolean).join(' at ') || 'employment'
    })),
    educationHistory: candidate.education_history.map(e => ({
      degree: e.degree,
      institution: e.institution,
      start: e.dates ? e.dates.split(' – ')[0] || e.dates.split(' - ')[0] || null : null,
      end: e.dates ? e.dates.split(' – ')[1] || e.dates.split(' - ')[1] || null : null,
      evidence: [e.degree, e.institution].filter(Boolean).join(' at ') || 'education'
    })),
    evidence: allEvidence,
    warnings: [
      'Extracted using deterministic text parser (no AI). Review all evidence before saving.',
      'This method does not use AI - all extraction is done via regex pattern matching.'
    ]
  } as ResumeExtraction;
}