const sectionStart =
  /^(?:(?:job |minimum |basic |required |preferred |desired )?(?:requirements|qualifications|skills)|(?:key )?responsibilities|what (?:you(?:'|’)ll (?:do|bring)|we(?:'|’)re looking for)|nice to have|must haves?)\s*:?$/i;
const sectionEnd =
  /^(?:about (?:us|the company|the role)|benefits|what we offer|why (?:join|work with) us|compensation|how to apply|equal opportunity|perks)\b[^.!?]{0,65}:?$/i;
const qualification =
  /\b(?:must|required|preferred|experience (?:with|in)|expertise|proficien\w*|degree|bachelor|master|certifi\w*|ability to)\b/i;
const preferred = /\b(?:preferred|nice to have|desired|bonus|a plus)\b/i;
const optional = /\b(?:not (?:required|necessary|needed)|no experience required)\b/i;
const negative =
  /\b(?:no (?:prior )?experience|not (?:experienced|proficient|certified)|unfamiliar|never (?:used|worked)|without (?:experience|knowledge))\b/i;
const yearsPattern = /\b(\d{1,2})\+?\s*(?:[-–]\s*\d{1,2}\s*)?\s*years?\b/i;
const split = /\n|;|(?<=[.!?])\s+(?=[A-Z])/;
const stop = new Set(
  'a an the and or in on of for to with as at is be by have has must required requirement preferred experience demonstrate expertise knowledge proficiency ability will you we our your this that from strong working hands years work professional proven excellent good skills using including role degree'.split(
    ' '
  )
);
const tokens = (value: string): string[] => [
  ...new Set(
    (value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
      .map((word) => word.replace(/[.]+$/, ''))
      .filter((word) => !stop.has(word))
  ),
];

const SKILL_TERMS = [
  'JavaScript', 'TypeScript', 'Java', 'Python', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
  'React', 'React Native', 'Flutter', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Spring Boot', 'Django', 'Flask', 'FastAPI', '.NET',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Snowflake', 'Spark', 'Kafka',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Linux', 'Git', 'Jenkins', 'CI/CD',
  'GraphQL', 'REST APIs', 'Microservices', 'HTML', 'CSS', 'Jest', 'JUnit', 'Selenium', 'Machine Learning', 'Full Stack', 'Tailwind CSS',
  'Project Management', 'Agile', 'Scrum', 'Jira', 'UX Design', 'Product Management', 'Data Analysis',
];

const ALIASES: Record<string, string[]> = {
  AWS: ['Amazon Web Services'],
  GCP: ['Google Cloud', 'Google Cloud Platform'],
  React: ['React.js', 'ReactJS'],
  'Node.js': ['NodeJS'],
  PostgreSQL: ['Postgres'],
  Kubernetes: ['K8s'],
  'REST APIs': ['RESTful APIs', 'REST API'],
};

const ALIAS_MAP = new Map<string, string[]>();
for (const [canonical, aliasList] of Object.entries(ALIASES)) {
  const allVariants = [canonical, ...aliasList];
  for (const variant of allVariants) {
    const key = variant.toLowerCase();
    const existing = ALIAS_MAP.get(key) || [];
    ALIAS_MAP.set(key, [...new Set([...existing, ...allVariants])]);
  }
}

function getSkillVariants(skill: string): string[] {
  const trimmed = skill.trim();
  const lower = trimmed.toLowerCase();
  const aliases = ALIAS_MAP.get(lower) || [];
  return Array.from(new Set([trimmed, ...aliases]));
}

function containsTerm(source: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lower = term.toLowerCase();
  let suffix = '';
  if (lower === 'react') {
    suffix = '(?![ -]+native\\b)';
  } else if (lower === 'java') {
    suffix = '(?![ -]*(?:script|Script)\\b)';
  }
  return new RegExp('(^|[^a-z0-9])' + escaped + suffix + '(?=$|[^a-z0-9+#])', 'i').test(source);
}

function hasTerm(source: string, term: string): boolean {
  if (term.toLowerCase() === 'go') {
    return (
      /\b(?:Golang|Go (?:programming|language|developer|engineer))\b/i.test(source) ||
      /(?:^|[,|:])\s*Go\s*(?=$|[,|])/m.test(source)
    );
  }
  const variants = getSkillVariants(term);
  return variants.some((val) => containsTerm(source, val));
}

function positiveTerm(source: string, term: string): boolean {
  return source
    .split(/\n|;|(?<=[.!?])\s+|\bbut\b/i)
    .some(
      (line) =>
        hasTerm(line, term) &&
        !negative.test(line) &&
        !/^(?:I\s+(?:am\s+)?|currently\s+)?(?:learning|studying|aspiring|interested\s+in)\b/i.test(
          line.trim()
        )
    );
}

type Point = { requirement: string; evidence: string | null; weight: number };
interface SkillRow {
  label: string;
  source: string;
  weight: number;
  matched: boolean;
  type: 'skill';
}

const aspiration =
  /^(?:(?:i am |currently )?(?:learning|studying|aspiring|interested in learning)\b|target role:)/i;

export function compareResumeToJob(resumeText: string, jobDescription: string) {
  const clauses = jobDescription.split(split).map((s) => s.trim()).filter(Boolean);
  const skillRows: SkillRow[] = [];

  for (const term of SKILL_TERMS) {
    if (!hasTerm(jobDescription, term)) continue;
    const clause = clauses.find((line) => hasTerm(line, term)) || term;
    if (optional.test(clause)) continue;
    const matched = positiveTerm(resumeText, term);
    const weight = preferred.test(clause) ? 1 : 2;
    skillRows.push({ label: term, source: clause, weight, matched, type: 'skill' });
  }

  const resumeLines = resumeText
    .split(split)
    .map((line) => ({
      text: line.trim(),
      words: new Set(tokens(line)),
      years: Number(line.match(yearsPattern)?.[1] || 0),
    }))
    .filter((line) => line.text && !negative.test(line.text) && !aspiration.test(line.text));

  const points: Point[] = [];
  const seen = new Set<string>();
  let section = '';

  for (const raw of jobDescription.split(split)) {
    const requirement = raw.replace(/^\s*(?:[-•*▪]|\d+[.)](?=\s))\s*/, '').trim();
    if (sectionStart.test(requirement)) {
      section = requirement;
      continue;
    }
    if (sectionEnd.test(requirement)) {
      section = '';
      continue;
    }
    const key = requirement.toLowerCase().replace(/\s+/g, ' ');
    if (
      requirement.length < 15 ||
      requirement.length > 600 ||
      seen.has(key) ||
      optional.test(requirement) ||
      (!section && !qualification.test(requirement) && !yearsPattern.test(requirement))
    )
      continue;

    const skillTokens = new Set(
      skillRows
        .filter((row: SkillRow) => row.source === requirement)
        .flatMap((row: SkillRow) => tokens(row.label))
    );
    const terms = tokens(requirement);
    const years = Number(requirement.match(yearsPattern)?.[1] || 0);
    if (!terms.length && !years) continue;
    if (!years && skillTokens.size && terms.every((word) => skillTokens.has(word))) continue;
    seen.add(key);
    const evidence = resumeLines.find(
      (line) => line.years >= years && terms.every((word) => line.words.has(word))
    );
    points.push({
      requirement,
      evidence: evidence?.text.slice(0, 320) || null,
      weight: preferred.test(requirement + ' ' + section) ? 1 : 2,
    });
    if (points.length >= 30) break;
  }

  const total =
    skillRows.reduce((sum: number, row: SkillRow) => sum + row.weight, 0) +
    points.reduce((sum: number, point: Point) => sum + point.weight, 0);
  const matchedWeight =
    skillRows.reduce((sum: number, row: SkillRow) => sum + (row.matched ? row.weight : 0), 0) +
    points.reduce((sum: number, point: Point) => sum + (point.evidence ? point.weight : 0), 0);

  return {
    score: total ? Math.round((100 * matchedWeight) / total) : null,
    matched: skillRows.filter((row: SkillRow) => row.matched).map((row: SkillRow) => row.label),
    missing: skillRows.filter((row: SkillRow) => !row.matched).map((row: SkillRow) => row.label),
    matchedPoints: points
      .filter((point: Point) => point.evidence)
      .slice(0, 8)
      .map(({ requirement, evidence }) => ({ requirement, evidence })),
    unmatchedPoints: points
      .filter((point: Point) => !point.evidence)
      .slice(0, 8)
      .map((point: Point) => point.requirement),
  };
}

export interface JobDetailsMatchResult {
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  totalSkillsCount: number;
}

export function computeJobDetailsMatch(
  jobSkills: string[],
  candidateSkills: string[] = [],
  resumeText?: string
): JobDetailsMatchResult {
  const validJobSkills = Array.isArray(jobSkills) ? jobSkills : [];
  const validCandidateSkills = Array.isArray(candidateSkills) ? candidateSkills : [];

  const uniqueJobSkills: string[] = [];
  const seenJobSkills = new Set<string>();

  for (const raw of validJobSkills) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (!seenJobSkills.has(lower)) {
      seenJobSkills.add(lower);
      uniqueJobSkills.push(trimmed);
    }
  }

  if (uniqueJobSkills.length === 0) {
    return {
      matchPercentage: 100,
      matchedSkills: [],
      missingSkills: [],
      totalSkillsCount: 0,
    };
  }

  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  for (const jobSkill of uniqueJobSkills) {
    const jobVariants = getSkillVariants(jobSkill);

    // 1. Check against candidate explicit skills
    const matchedBySkills = validCandidateSkills.some((candSkill) => {
      if (typeof candSkill !== 'string') return false;
      const candTrimmed = candSkill.trim();
      if (!candTrimmed) return false;

      // Exact case-insensitive match
      if (candTrimmed.toLowerCase() === jobSkill.toLowerCase()) {
        return true;
      }

      // Alias match
      const candVariants = getSkillVariants(candTrimmed);
      if (
        jobVariants.some((jv) =>
          candVariants.some((cv) => jv.toLowerCase() === cv.toLowerCase())
        )
      ) {
        return true;
      }

      // Candidate skill string contains the job skill term
      return hasTerm(candTrimmed, jobSkill);
    });

    if (matchedBySkills) {
      matchedSkills.push(jobSkill);
      continue;
    }

    // 2. Check against candidate resume text if provided
    let matchedByResume = false;
    if (resumeText && typeof resumeText === 'string') {
      matchedByResume = jobVariants.some((variant) => positiveTerm(resumeText, variant));
    }

    if (matchedByResume) {
      matchedSkills.push(jobSkill);
    } else {
      missingSkills.push(jobSkill);
    }
  }

  const totalSkillsCount = uniqueJobSkills.length;
  const matchPercentage =
    totalSkillsCount === 0
      ? 100
      : Math.round((matchedSkills.length / totalSkillsCount) * 100);

  return {
    matchPercentage,
    matchedSkills,
    missingSkills,
    totalSkillsCount,
  };
}

export function extractJobSkills(job?: {
  skills?: string[] | null;
  enrichment?: { skills?: string[] | null } | null;
} | null): string[] {
  if (!job) return [];
  if (Array.isArray(job.skills) && job.skills.length > 0) return job.skills;
  if (Array.isArray(job.enrichment?.skills) && job.enrichment.skills.length > 0) return job.enrichment.skills;
  return [];
}

export function computeUnifiedJobMatch(
  job?: {
    title?: string;
    description?: string;
    skills?: string[] | null;
    enrichment?: {
      skills?: string[] | null;
      summary?: string | null;
    } | null;
  } | null,
  candidateResume?: { text?: string; skills?: string[] } | null,
  fallbackProfileSkills: string[] = []
): JobDetailsMatchResult {
  if (!job) {
    return {
      matchPercentage: 0,
      matchedSkills: [],
      missingSkills: [],
      totalSkillsCount: 0,
    };
  }

  const candidateSkills = Array.from(
    new Set([
      ...(candidateResume?.skills || []),
      ...(fallbackProfileSkills || []),
    ].filter(Boolean))
  );
  const resumeText = candidateResume?.text || '';

  const skillsList = extractJobSkills(job);

  if (skillsList.length > 0) {
    return computeJobDetailsMatch(skillsList, candidateSkills, resumeText);
  }

  // Fallback: If job has no structured skills, use description text matching if available
  const jobText = job.description || job.enrichment?.summary || '';
  if (resumeText && jobText) {
    const textMatch = compareResumeToJob(resumeText, jobText);
    const matched = textMatch.matched || [];
    const missing = textMatch.missing || [];
    return {
      matchPercentage: textMatch.score ?? 0,
      matchedSkills: matched,
      missingSkills: missing,
      totalSkillsCount: matched.length + missing.length,
    };
  }

  return {
    matchPercentage: 0,
    matchedSkills: [],
    missingSkills: [],
    totalSkillsCount: 0,
  };
}
