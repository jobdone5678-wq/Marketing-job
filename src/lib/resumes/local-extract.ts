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
  current_employer: string | null;
  target_job_titles: string | null;
  highest_qualification: string | null;
  university_name: string | null;
  graduation_year: string | null;
  certifications: string | null;
  total_experience_years: string | null;
  primary_skills: string;
  secondary_skills: string | null;
  employment_history: Array<{ employer: string | null; title: string | null; location: string | null; start: string | null; end: string | null; bullets: string[] }>;
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
  "Tailwind CSS": ["tailwind css", "tailwindcss"],
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
  Django: ["django", "django rest framework", "drf"],
  Wagtail: ["wagtail", "wagtail cms", "headless wagtail", "wagtail headless"],
  StreamField: ["streamfield", "stream field"],
  Snippets: ["snippets", "wagtail snippets"],
  Redux: ["redux", "redux toolkit", "reduxtoolkit"],
  MaterialUI: ["material ui", "material-ui", "mui"],
  Elasticsearch: ["elasticsearch"],
  PyTest: ["pytest"],
  Cypress: ["cypress"],
  Playwright: ["playwright"],
  Selenium: ["selenium"],
  Nginx: ["nginx"],
  CloudFront: ["cloudfront"],
  EC2: ["ec2"],
  S3: ["s3"],
  RDS: ["rds"],
  Jira: ["jira"],
  Postman: ["postman"],
  VSCode: ["visual studio code", "vscode", "vs code"],
  SEO: ["search engine optimization"],
  WCAG: ["wcag", "wcag 2.1", "section 508"],
  "Core Web Vitals": ["core web vitals", "core web"],
  "Google Analytics": ["google analytics", "ga4", "analytics"],
  Mixpanel: ["mixpanel"],
  Jenkins: ["jenkins"],
  GitLab: ["gitlab", "gitlab ci"],
  "AWS ECS": ["aws ecs", "ecs"],
  IAM: ["iam"],
  USWDS: ["uswds", "u.s. web design system", "united states web design system"],
};

// Section heading patterns from resume-parser
const SECTION_ALIASES: Record<string, RegExp> = {
  skills: /^(?:technical\s+)?(?:skills|technical\s+skills|core\s+competencies|technologies|tools\s*&?\s*technologies|skills\s*&?\s*tools)\s*:?$/i,
  experience: /^(?:professional\s+|work\s+)?(?:experience|employment|work\s+history|career\s+history|internships|industry\s+experience)\s*:?$/i,
  education: /^(?:education|academic\s+background|academic\s+qualifications|qualifications|educational\s+background|studies)\s*:?$/i,
  projects: /^(?:selected\s+|key\s+|featured\s+|personal\s+|academic\s+)?projects\s*:?$/i,
  certifications: /^(?:certifications|licenses\s*&?\s*certifications|certificates|courses)\s*:?$/i,
  background: /^(?:professional\s+)?background\s*:?$/i,
  profiles: /^(?:profiles|links|social\s+links|online\s+presence|contact|contact\s+information)\s*:?$/i,
  summary: /^(?:summary|professional\s+summary|profile|about\s+me|career\s+objective|objective)\s*:?$/i,
  publications: /^(?:publications|research|patents|awards|honors|achievements)\s*:?$/i,
};

// Role keywords that indicate an experience heading line
const ROLE_KEYWORDS = /\b(?:engineer|developer|scientist|manager|analyst|designer|intern|lead|consultant|architect|specialist|officer|assistant|member|contributor|full[-\s]?stack|software)\b/i;

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10",
  october: "10", nov: "11", november: "11", dec: "12", december: "12",
};

const MAX_SNIPPET = 2800;

function clean(value: string): string {
  return value.replace(/[ \t]+/g, " ").replace(/[ ]{2,}/g, " ").trim();
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
  const candidates = text.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) ?? [];
  for (const raw of candidates) {
    let value = raw.trim();
    const digits = value.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) value = value.replace(/^\+?1/, "").trim();
    const count = value.replace(/\D/g, "").length;
    if (count >= 10 && count <= 15) return clean(value);
  }
  return null;
}

function extractName(lines: string[], email: string | null): string | null {
  const emailIndex = email ? lines.findIndex((line) => line.toLowerCase().includes(email)) : -1;
  const searchLimit = emailIndex >= 0 ? Math.min(emailIndex + 1, 8) : Math.min(lines.length, 8);
  const candidates = lines.slice(0, searchLimit).filter((line) => {
    if (line.length < 2 || line.length > 50) return false;
    if (/[@:/|•*▪●]|\d{3,}/.test(line)) return false;
    // Only filter out if the entire line matches these keywords exactly (case-insensitive, ignoring whitespace)
    const normalizedLine = line.replace(/\s+/g, '').toLowerCase();
    if (/^(resume|summary|experience|curriculum|skills|education|accountant)$/.test(normalizedLine)) return false;
    // Filter out lines that are purely role titles (not containing actual name)
    if (/^(engineer|developer|scientist|manager|intern|full[-]?stack|frontend|backend|analyst|designer|architect|consultant|specialist|officer|assistant|lead)$/i.test(normalizedLine)) return false;
    // Allow single-word names (like "VINOD") as well as multi-word names
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\'-]+$/.test(line);
  });
  return candidates.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)[0] ?? (candidates[0] || null);
}

// The headline under the name states the role the candidate is aiming at.
function extractHeadline(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    if (!line || line.length > 200) continue;
    const head = line.split(/\s*\|\s*/)[0].trim();
    if (!head || /[@:/]/.test(head)) continue;
    const role = head.split(/\s+[—–-]\s+/)[0].trim();
    if (!role || role.length > 80) continue;
    if (!ROLE_KEYWORDS.test(role)) continue;
    return role;
  }
  return null;
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

type SkillHit = { canonical: string; literal: string; index: number };

function extractSkills(text: string): SkillHit[] {
  const lower = text.toLowerCase();
  const hits: SkillHit[] = [];
  for (const [canonical, aliases] of Object.entries(SKILL_TAXONOMY)) {
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?:^|[^a-z0-9+#\\.])${escaped}(?=$|[^a-z0-9+#\\.])`, "i");
      const match = regex.exec(lower);
      if (!match) continue;
      const start = match.index + match[0].length - alias.length;
      hits.push({ canonical, literal: text.slice(start, start + alias.length), index: start });
      break;
    }
  }
  return hits;
}

// The skill name is kept exactly as the resume writes it so the extracted value
// stays supported by the source text.
function skillDisplay(hit: SkillHit, source: string): string {
  if (source.toLowerCase().includes(hit.canonical.toLowerCase())) return hit.canonical;
  return hit.literal.trim();
}

function extractDates(value: string): string | null {
  return (
    // Match "Month YYYY - Month YYYY", "YYYY - YYYY", "Month YYYY - present", etc.
    value.match(/(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\b(?:19|20)\d{2}(?:[-/]\d{2})?\s*(?:-|–|to)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:(?:19|20)\d{2}(?:[-/]\d{2})?|present|current)/i)?.[0] ??
    // Match "MM/YYYY - present" format
    value.match(/\b\d{1,2}\/\d{4}\s*(?:-|–|to)\s*(?:present|current|\d{1,2}\/\d{4})/i)?.[0] ??
    // Match "Month YYYY - Month YYYY" with optional month on end
    value.match(/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}\s*(?:-|–|to)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?(?:\d{4}|present|current)/i)?.[0] ??
    // Match "YYYY - YYYY" or "YYYY - present"
    value.match(/\b(?:19|20)\d{2}\s*[-–]\s*(?:\b(?:19|20)\d{2}\b|present|current)/i)?.[0] ??
    null
  );
}

// Dates are stored as comparable year-month values.
function normalizeDatePart(value: string | null): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  if (/^(present|current|now|today|to date|ongoing)$/i.test(text)) {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const monthMatch = text.match(/([A-Za-z]{3,9})\.?\s+(\d{4})/);
  if (monthMatch) {
    const month = MONTHS[monthMatch[1].toLowerCase()];
    if (month) return `${monthMatch[2]}-${month}`;
  }
  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearMatch) return yearMatch[1];
  return null;
}

function splitDateRange(dates: string | null): { start: string | null; end: string | null } {
  if (!dates) return { start: null, end: null };
  const parts = dates.split(/\s*(?:-|–|—|to)\s*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { start: normalizeDatePart(parts[0]), end: normalizeDatePart(parts[parts.length - 1]) };
  }
  return { start: normalizeDatePart(parts[0]), end: null };
}

// Company words that must never be read as a location.
const COMPANY_SUFFIXES = /^(?:inc|llc|ltd|corp|co|gmbh|llp|pvt|plc|sa|ag|group|holdings|technologies|systems|solutions|labs|studio|agency|company)$/i;

// "BluePeak Digital Solutions, Austin, TX" -> company plus location.
function splitCompanyLocation(value: string): { company: string; location: string | null } {
  const segments = value.split(/\s*,\s*/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length >= 3) {
    const last = segments[segments.length - 1];
    const previous = segments[segments.length - 2];
    const looksLikeState = /^[A-Z]{2}$/.test(last);
    const looksLikeCity = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*$/.test(last) && !COMPANY_SUFFIXES.test(last);
    if ((looksLikeState || looksLikeCity) && previous) {
      return { company: segments.slice(0, -2).join(", "), location: `${previous}, ${last}` };
    }
  }
  return { company: value, location: null };
}

function splitLocation(location: string | null): { city: string | null; state: string | null } {
  if (!location) return { city: null, state: null };
  const parts = location.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && /^[A-Za-z]{2,}$/.test(parts[parts.length - 1])) {
    return { city: parts[parts.length - 2], state: parts[parts.length - 1].toUpperCase() };
  }
  return { city: parts[0] ?? null, state: null };
}

const DEGREE_REGEX = /\b(?:B\.?Tech|B\.?E\.?|B\.?S\.?|B\.?Sc|B\.?A\.?|B\.?Com|BCA(?:\s*\(Honou?rs?\))?|M\.?Tech|M\.?E\.?|M\.?S\.?|M\.?Sc|M\.?A\.?|M\.?Com|MCA|MBA|Ph\.?D\.?|Bachelor(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Master(?:'s)?(?:\s+of\s+[A-Za-z\s]+)?|Doctor(?:ate)?|Diploma)\b/i;
const INSTITUTION_REGEX = /\b(?:University|College|Institute|School|Academy|Polytechnic|IIT|NIT|BITS|Campus)\b/i;

// Certifications are often listed on one line under a "Certifications:" label.
function extractCertifications(lines: string[]): string[] {
  const labelled = lines
    .filter((line) => /^certifications?\s*[:\-–]/i.test(line))
    .map((line) => line.replace(/^certifications?\s*[:\-–]\s*/i, "").trim())
    .filter(Boolean);
  return labelled;
}

// A graduation year is often the only date on the education line.
function standaloneYear(line: string): string | null {
  const years = line.match(/\b((?:19|20)\d{2})\b/g);
  if (!years?.length) return null;
  return years[years.length - 1];
}

function extractEducation(lines: string[]): Array<{ degree: string | null; institution: string | null; field: string | null; dates: string | null }> {
  const items: Array<{ degree: string | null; institution: string | null; field: string | null; dates: string | null }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasDegree = DEGREE_REGEX.test(line);
    const hasInst = INSTITUTION_REGEX.test(line);
    const dates = extractDates(line) ?? (lines[i + 1] ? extractDates(lines[i + 1]) : null) ?? standaloneYear(line);

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

function extractExperience(lines: string[]): Array<{ company: string | null; role: string | null; location: string | null; dates: string | null; description: string[] }> {
  const entries: Array<{ company: string | null; role: string | null; location: string | null; dates: string | null; description: string[] }> = [];
  let current: { company: string | null; role: string | null; location: string | null; dates: string | null; description: string[] } | null = null;

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
    const hasRoleKeyword = ROLE_KEYWORDS.test(line);
    // Handle "Role, Company Date - Date" format (comma-separated)
    const hasCommaFormat = line.includes(",") && (dates || hasRoleKeyword);
    const isExplicitHeading = (line.includes("—") || line.includes(" - ") || line.includes(" | ") || hasCommaFormat) && (dates || hasRoleKeyword);

    // A role heading is often followed by its own line with the dates.
    let headingDates = dates;
    let dateLine = -1;
    if (!headingDates && lines[i + 1]) {
      const nextDates = extractDates(lines[i + 1]);
      if (nextDates && lines[i + 1].replace(nextDates, "").trim().length <= 2) {
        headingDates = nextDates;
        dateLine = i + 1;
      }
    }

    if (isExplicitHeading || (headingDates && hasRoleKeyword)) {
      const lineWithoutDates = (dates ? line.replace(dates, "") : line).replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "").trim();
      const heading = headingDates ? headingDates : dates;

      let role: string | null = null;
      let company: string | null = null;
      let location: string | null = null;

      // The dash and pipe separated form carries the clearest role and employer.
      const separated = lineWithoutDates.split(/\s+[—–-]\s+|\s*\|\s*/).map((part) => part.trim()).filter(Boolean);

      if (separated.length >= 2) {
        const roleIndex = ROLE_KEYWORDS.test(separated[0])
          ? 0
          : ROLE_KEYWORDS.test(separated[1])
            ? 1
            : 0;
        role = separated[roleIndex] || null;
        const rest = separated.filter((_, index) => index !== roleIndex).join(", ");
        const split = splitCompanyLocation(rest);
        company = split.company || null;
        location = split.location;
      } else if (hasCommaFormat && lineWithoutDates.includes(",")) {
        // Handle comma-separated format: "Role, Company"
        const parts = lineWithoutDates.split(/\s*,\s*/);
        if (parts.length >= 2) {
          if (hasRoleKeyword) {
            role = parts[0].trim();
            company = parts.slice(1).join(", ").trim();
          } else {
            company = parts[0].trim();
            role = parts.slice(1).join(", ").trim();
          }
        }
      } else if (hasRoleKeyword) {
        role = lineWithoutDates;
        if (lines[i + 1] && !BULLET_REGEX.test(lines[i + 1]) && !extractDates(lines[i + 1])) {
          const next = lines[i + 1];
          const split = splitCompanyLocation(next);
          company = split.company || null;
          location = split.location;
          i++;
        }
      } else {
        company = lineWithoutDates;
      }

      if (role || company) {
        const cleanRole = role ? clean(role.replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "")) : null;
        const cleanCompany = company ? clean(company.replace(/^[|,\s—–-]+|[|,\s—–-]+$/g, "")) : null;
        current = {
          role: cleanRole || null,
          company: cleanCompany || null,
          location: location ? clean(location) : null,
          dates: heading,
          description: [],
        };
        entries.push(current);
        // The dates were printed on their own line under the heading.
        if (dateLine > i) i = dateLine;
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
  headline: string | null;
  email: string | null;
  phone: string | null;
  skills: SkillHit[];
  education: Array<{degree: string | null; institution: string | null; field: string | null; dates: string | null}>;
  experience: Array<{company: string | null; role: string | null; location: string | null; dates: string | null; description: string[]}>;
  linkedin: string | null;
  github: string | null;
  certifications: string[];
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
    headline: extractHeadline(lines),
    email,
    phone,
    skills: extractSkills(text),
    education: extractEducation(sections.education ?? lines),
    experience: extractExperience(sections.experience ?? lines),
    linkedin,
    github,
    certifications: extractCertifications(lines).length
      ? extractCertifications(lines)
      : (sections.certifications ?? []).filter(Boolean),
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

// Finds where a value appears in the source so the extraction can cite it.
function findValueIndex(text: string, value: string): number {
  const needle = value.trim();
  if (!needle) return -1;
  const target = needle.toLowerCase();
  if (target.length >= 4) return text.toLowerCase().indexOf(target);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").exec(text);
  return match ? match.index : -1;
}

function snippetFor(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 80);
  return text.slice(start, end).replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

// Finds the occurrence of a value that sits closest to a known position, so a
// repeated job title is cited next to its own employer.
function closestIndex(text: string, value: string, anchor: number): number {
  const needle = value.trim().toLowerCase();
  if (!needle) return -1;
  const haystack = text.toLowerCase();
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let from = 0;
  for (;;) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) break;
    const distance = anchor >= 0 ? Math.abs(found - anchor) : found;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = found;
    }
    from = found + 1;
  }
  return best;
}

function buildCandidate(parsed: ReturnType<typeof parseResumeText>, raw: string): LocalCandidate {
  const experienceYears = estimateExperienceYears(parsed.experience);

  const employmentHistory = parsed.experience.map((exp) => {
    const range = splitDateRange(exp.dates);
    return {
      employer: exp.company,
      title: exp.role,
      location: exp.location,
      start: range.start,
      end: range.end,
      bullets: exp.description,
    };
  });

  const educationHistory = parsed.education.map((edu) => ({
    degree: edu.degree,
    institution: edu.institution,
    field: edu.field,
    dates: edu.dates,
  }));

  const latest = parsed.experience[0] ?? null;
  const location = splitLocation(latest?.location ?? null);
  const skills = parsed.skills.map((hit) => skillDisplay(hit, raw));
  const latestEducation = parsed.education[0] ?? null;
  const graduationYear = latestEducation?.dates ? normalizeDatePart(latestEducation.dates.split(/\s*(?:-|–|—|to)\s*/i).pop() ?? null) : null;

  return {
    id: 'local-' + Date.now(),
    full_name: parsed.name || '',
    email: parsed.email,
    phone: parsed.phone,
    linkedin_url: parsed.linkedin,
    github_url: parsed.github,
    current_city: location.city,
    current_state: location.state,
    current_job_title: latest?.role ?? parsed.headline,
    current_employer: latest?.company ?? null,
    target_job_titles: parsed.headline ?? latest?.role ?? null,
    highest_qualification: latestEducation?.degree ?? null,
    university_name: latestEducation?.institution ?? null,
    graduation_year: graduationYear ? graduationYear.slice(0, 4) : null,
    certifications: parsed.certifications.length ? parsed.certifications.join("; ") : null,
    total_experience_years: experienceYears ? String(experienceYears) : null,
    primary_skills: skills.join(', '),
    secondary_skills: null,
    employment_history: employmentHistory,
    education_history: educationHistory,
    source_text: raw,
    all_skills: skills,
  };
}

export function extractResumeLocal(text: string, filename: string): ResumeExtraction {
  const raw = text.replace(/\r\n/g, '\n').trim();
  const parsed = parseResumeText(raw);
  const candidate = buildCandidate(parsed, raw);

  const fields: Record<string, unknown> = {
    full_name: candidate.full_name || null,
    email: candidate.email,
    phone: candidate.phone,
    linkedin_url: candidate.linkedin_url,
    current_city: candidate.current_city,
    current_state: candidate.current_state,
    current_employer: candidate.current_employer,
    current_job_title: candidate.current_job_title,
    target_job_titles: candidate.target_job_titles,
    highest_qualification: candidate.highest_qualification,
    university_name: candidate.university_name,
    graduation_year: candidate.graduation_year,
    certifications: candidate.certifications,
    total_experience_years: null,
    primary_skills: candidate.primary_skills || null,
    secondary_skills: candidate.secondary_skills,
    employment_types: null,
    authorized_in_usa: null,
    need_sponsorship_now: null,
    need_sponsorship_future: null,
    open_to_relocation: null,
  };

  // Calculate total experience from history
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
    const idx = findValueIndex(text, strVal);
    if (idx >= 0) {
      evidence.push({
        field,
        snippet: snippetFor(text, idx, strVal.length),
        page: 1
      });
    }
  }

  // Certifications are cited with the passage that lists them.
  if (parsed.certifications.length) {
    const positions = parsed.certifications
      .map((entry) => ({ entry, index: findValueIndex(text, entry) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (positions.length) {
      const first = positions[0].index;
      const last = positions[positions.length - 1];
      const end = Math.min(text.length, last.index + last.entry.length);
      const snippet = text.slice(first, end).replace(/\n/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET);
      evidence.push({ field: "certifications", snippet, page: 1 });
    }
  }

  // The skill list is cited with one passage that holds every named skill.
  const skillsEvidence: { field: string; snippet: string; page: number | null }[] = [];  if (candidate.primary_skills) {
    const positions = parsed.skills
      .map((hit) => ({ hit, index: findValueIndex(text, skillDisplay(hit, text)) }))
      .filter((entry) => entry.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (positions.length) {
      const first = positions[0].index;
      const last = positions[positions.length - 1];
      const end = Math.min(text.length, last.index + last.hit.literal.length);
      const span = text.slice(first, end);
      const snippet = span.length <= MAX_SNIPPET ? span : span.slice(0, MAX_SNIPPET);
      const kept = candidate.all_skills.filter((skill) => snippet.toLowerCase().includes(skill.toLowerCase()));
      if (kept.length) {
        fields.primary_skills = kept.join(', ');
        skillsEvidence.push({
          field: 'primary_skills',
          snippet: snippet.replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
          page: 1
        });
      }
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

  const allEvidence = [...evidence, ...employmentEvidence, ...educationEvidence, ...skillsEvidence];

  // Build employment history with proper evidence from source text
  const employmentHistory = candidate.employment_history.map(e => {
    // Find actual evidence snippet from source text
    const employerIdx = e.employer ? text.toLowerCase().indexOf(e.employer.toLowerCase()) : -1;
    const titleIdx = e.title ? closestIndex(text, e.title, employerIdx) : -1;
    const bulletIdx = e.bullets.length > 0 ? text.toLowerCase().indexOf(e.bullets[0].toLowerCase()) : -1;

    let evidence = '';
    if (employerIdx >= 0 && titleIdx >= 0) {
      // Found both - use a snippet from the employment line
      evidence = text.slice(Math.min(employerIdx, titleIdx), Math.max(employerIdx, titleIdx) + 100).replace(/\n/g, ' ').trim();
    } else if (employerIdx >= 0) {
      evidence = text.slice(employerIdx, employerIdx + 150).replace(/\n/g, ' ').trim();
    } else if (titleIdx >= 0) {
      evidence = text.slice(titleIdx, titleIdx + 150).replace(/\n/g, ' ').trim();
    } else if (bulletIdx >= 0) {
      evidence = e.bullets[0];
    } else {
      evidence = `${e.employer || ''} at ${e.title || ''}`.trim() || 'employment';
    }

    return {
      employer: e.employer,
      title: e.title,
      start: e.start,
      end: e.end,
      location: e.location,
      evidence: evidence.slice(0, MAX_SNIPPET)
    };
  });

  // Build education history with proper evidence from source text
  const educationHistory = candidate.education_history.map(e => {
    // Find actual evidence snippet from source text
    const degreeIdx = e.degree ? text.toLowerCase().indexOf(e.degree.toLowerCase()) : -1;
    const instIdx = e.institution ? text.toLowerCase().indexOf(e.institution.toLowerCase()) : -1;

    let evidence = '';
    if (degreeIdx >= 0 && instIdx >= 0) {
      evidence = text.slice(Math.min(degreeIdx, instIdx), Math.max(degreeIdx, instIdx) + 100).replace(/\n/g, ' ').trim();
    } else if (degreeIdx >= 0) {
      evidence = text.slice(degreeIdx, degreeIdx + 150).replace(/\n/g, ' ').trim();
    } else if (instIdx >= 0) {
      evidence = text.slice(instIdx, instIdx + 150).replace(/\n/g, ' ').trim();
    } else {
      evidence = [e.degree, e.institution].filter(Boolean).join(' at ') || 'education';
    }

    const range = splitDateRange(e.dates);
    // A single year on an education line is the graduation year.
    const educationRange = range.start && !range.end ? { start: null, end: range.start } : range;
    return {
      degree: e.degree,
      institution: e.institution,
      start: educationRange.start,
      end: educationRange.end,
      evidence: evidence.slice(0, MAX_SNIPPET)
    };
  });

  return {
    fields: fields as any,
    employmentHistory,
    educationHistory,
    evidence: allEvidence,
    warnings: [
      'Extracted using deterministic text parser (no AI). Review all evidence before saving.',
      'This method does not use AI - all extraction is done via regex pattern matching.'
    ]
  } as ResumeExtraction;
}
