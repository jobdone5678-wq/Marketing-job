/**
 * Complete, evidence-based deterministic skill & structured job extraction.
 * Extracts comprehensive skills, responsibilities, requirements, and constraints
 * directly from the job description with exact text evidence citations.
 */

import type { Candidate } from '@/types/database';

export type SkillCategory =
  | 'Languages & Core'
  | 'Frontend & Mobile'
  | 'Backend & APIs'
  | 'Cloud & DevOps'
  | 'Data, AI & Storage'
  | 'Security & Compliance'
  | 'Practices & Architecture';

export interface ExtractedSkill {
  name: string;
  category: SkillCategory;
  sourceSnippet?: string;
  count: number;
}

export interface ExtractedRequirement {
  id: string;
  category: 'Clearance & Location' | 'Experience & Education' | 'Technical Stack' | 'Key Responsibility';
  requirement: string;
  jobEvidence: string;
  status: 'met' | 'missing' | 'verification_needed';
  candidateEvidence?: string;
}

export interface StructuredJobDetails {
  summary: string;
  responsibilities: string[];
  mustHaves: string[];
  niceToHaves: string[];
  constraints: {
    type: 'location' | 'clearance' | 'experience' | 'education';
    title: string;
    description: string;
  }[];
  skills: ExtractedSkill[];
  topTechStack: string[];
}

export interface CandidateFitAnalysis {
  candidateId: string;
  candidateName: string;
  matchScore: number;
  matchedSkills: { skill: string; candidateField: string }[];
  missingSkills: string[];
  requirements: ExtractedRequirement[];
  constraints: {
    label: string;
    requirement: string;
    candidateFact: string;
    status: 'met' | 'conflict' | 'verification_needed';
  }[];
  verdict: 'Strong Fit' | 'Good Fit' | 'Review Required';
}

const SKILL_DATABASE: { name: string; aliases: string[]; category: SkillCategory }[] = [
  // 1. Languages & Core
  { name: 'Python', aliases: ['python3', 'python 3', 'pyspark'], category: 'Languages & Core' },
  { name: 'Java', aliases: ['java 8', 'java 11', 'java 17', 'java 21', 'core java'], category: 'Languages & Core' },
  { name: 'C++', aliases: ['cpp', 'c/c++'], category: 'Languages & Core' },
  { name: 'C', aliases: ['ansi c'], category: 'Languages & Core' },
  { name: 'Go', aliases: ['golang', 'go language'], category: 'Languages & Core' },
  { name: 'Rust', aliases: ['rustlang'], category: 'Languages & Core' },
  { name: 'TypeScript', aliases: ['ts'], category: 'Languages & Core' },
  { name: 'JavaScript', aliases: ['js', 'es6', 'es2020', 'es2022'], category: 'Languages & Core' },
  { name: 'C#', aliases: ['csharp', '.net c#'], category: 'Languages & Core' },
  { name: 'SQL', aliases: ['structured query language', 't-sql', 'pl/sql'], category: 'Languages & Core' },
  { name: 'Scala', aliases: [], category: 'Languages & Core' },
  { name: 'Kotlin', aliases: [], category: 'Languages & Core' },
  { name: 'Swift', aliases: ['swiftui'], category: 'Languages & Core' },
  { name: 'Ruby', aliases: ['ruby on rails', 'rails'], category: 'Languages & Core' },
  { name: 'PHP', aliases: ['laravel'], category: 'Languages & Core' },
  { name: 'Bash / Shell', aliases: ['bash', 'shell scripting', 'sh', 'zsh', 'powershell'], category: 'Languages & Core' },

  // 2. Frontend & Mobile
  { name: 'React', aliases: ['react.js', 'reactjs'], category: 'Frontend & Mobile' },
  { name: 'Next.js', aliases: ['nextjs', 'next'], category: 'Frontend & Mobile' },
  { name: 'Vue.js', aliases: ['vue', 'vuejs', 'nuxt'], category: 'Frontend & Mobile' },
  { name: 'Angular', aliases: ['angularjs', 'angular 2+'], category: 'Frontend & Mobile' },
  { name: 'Tailwind CSS', aliases: ['tailwind', 'tailwindcss'], category: 'Frontend & Mobile' },
  { name: 'HTML5 / CSS3', aliases: ['html', 'css', 'sass', 'scss'], category: 'Frontend & Mobile' },
  { name: 'React Native', aliases: ['react-native'], category: 'Frontend & Mobile' },
  { name: 'Flutter', aliases: ['dart'], category: 'Frontend & Mobile' },
  { name: 'iOS Development', aliases: ['uikit', 'cocoa'], category: 'Frontend & Mobile' },
  { name: 'Android Development', aliases: ['android sdk', 'jetpack compose'], category: 'Frontend & Mobile' },

  // 3. Backend & APIs
  { name: 'Node.js', aliases: ['nodejs', 'node'], category: 'Backend & APIs' },
  { name: 'Spring Boot', aliases: ['spring framework', 'springboot', 'spring mvc'], category: 'Backend & APIs' },
  { name: 'FastAPI', aliases: [], category: 'Backend & APIs' },
  { name: 'Django', aliases: [], category: 'Backend & APIs' },
  { name: 'Flask', aliases: [], category: 'Backend & APIs' },
  { name: 'ASP.NET Core', aliases: ['asp.net', '.net core'], category: 'Backend & APIs' },
  { name: 'Express.js', aliases: ['expressjs', 'express'], category: 'Backend & APIs' },
  { name: 'GraphQL', aliases: ['apollo', 'graphql schema'], category: 'Backend & APIs' },
  { name: 'REST APIs', aliases: ['restful apis', 'rest api', 'restful'], category: 'Backend & APIs' },
  { name: 'gRPC', aliases: ['protobuf', 'protocol buffers'], category: 'Backend & APIs' },
  { name: 'Microservices', aliases: ['micro-services', 'microservice architecture'], category: 'Backend & APIs' },
  { name: 'WebSockets', aliases: ['socket.io'], category: 'Backend & APIs' },

  // 4. Cloud & DevOps
  { name: 'AWS', aliases: ['amazon web services', 'ec2', 's3', 'lambda', 'ecs', 'eks'], category: 'Cloud & DevOps' },
  { name: 'Google Cloud (GCP)', aliases: ['gcp', 'google cloud platform', 'bigquery', 'gke'], category: 'Cloud & DevOps' },
  { name: 'Microsoft Azure', aliases: ['azure', 'azure devops'], category: 'Cloud & DevOps' },
  { name: 'Docker', aliases: ['containerization', 'containers'], category: 'Cloud & DevOps' },
  { name: 'Kubernetes', aliases: ['k8s', 'helm'], category: 'Cloud & DevOps' },
  { name: 'Terraform', aliases: ['iac', 'infrastructure as code', 'opentofu'], category: 'Cloud & DevOps' },
  { name: 'Linux', aliases: ['unix', 'ubuntu', 'redhat', 'centos', 'debian'], category: 'Cloud & DevOps' },
  { name: 'CI/CD', aliases: ['continuous integration', 'github actions', 'jenkins', 'gitlab ci', 'argo cd'], category: 'Cloud & DevOps' },
  { name: 'Distributed Systems', aliases: ['distributed architecture', 'distributed computing', 'high availability'], category: 'Cloud & DevOps' },
  { name: 'Serverless', aliases: ['aws lambda', 'cloud functions'], category: 'Cloud & DevOps' },
  { name: 'Observability', aliases: ['datadog', 'prometheus', 'grafana', 'opentelemetry', 'splunk', 'cloudwatch'], category: 'Cloud & DevOps' },

  // 5. Data, AI & Storage
  { name: 'PostgreSQL', aliases: ['postgres', 'psql'], category: 'Data, AI & Storage' },
  { name: 'MySQL', aliases: ['mariadb'], category: 'Data, AI & Storage' },
  { name: 'MongoDB', aliases: ['mongo', 'nosql document store'], category: 'Data, AI & Storage' },
  { name: 'Redis', aliases: ['in-memory cache', 'redis cache'], category: 'Data, AI & Storage' },
  { name: 'Apache Kafka', aliases: ['kafka', 'event streaming', 'pub/sub', 'message broker'], category: 'Data, AI & Storage' },
  { name: 'Snowflake', aliases: ['data warehouse'], category: 'Data, AI & Storage' },
  { name: 'Apache Spark', aliases: ['spark', 'databricks'], category: 'Data, AI & Storage' },
  { name: 'Elasticsearch', aliases: ['elastic search', 'elk stack', 'opensearch'], category: 'Data, AI & Storage' },
  { name: 'Data Pipelines', aliases: ['etl', 'elt', 'data engineering', 'airflow', 'apache airflow'], category: 'Data, AI & Storage' },
  { name: 'Machine Learning', aliases: ['deep learning', 'ml models', 'model training'], category: 'Data, AI & Storage' },
  { name: 'PyTorch', aliases: ['torch'], category: 'Data, AI & Storage' },
  { name: 'TensorFlow', aliases: ['keras'], category: 'Data, AI & Storage' },
  { name: 'LLM & Generative AI', aliases: ['large language models', 'openai', 'langchain', 'vector database', 'rag'], category: 'Data, AI & Storage' },

  // 6. Security & Compliance
  { name: 'US Government Work', aliases: ['us government', 'government work', 'dod', 'defense programs'], category: 'Security & Compliance' },
  { name: 'Security Clearance', aliases: ['clearance', 'secret clearance', 'ts/sci', 'top secret', 'security check'], category: 'Security & Compliance' },
  { name: 'Wiesbaden / Germany', aliases: ['wiesbaden', 'germany', 'relocation to germany', 'europe base'], category: 'Security & Compliance' },
  { name: 'Application Security', aliases: ['appsec', 'owasp', 'penetration testing', 'soc2', 'hipaa', 'iso 27001'], category: 'Security & Compliance' },
  { name: 'IAM / OAuth', aliases: ['oauth2', 'saml', 'single sign-on', 'sso', 'jwt'], category: 'Security & Compliance' },

  // 7. Practices & Architecture
  { name: 'System Design', aliases: ['software architecture', 'system architecture', 'design patterns', 'scalability'], category: 'Practices & Architecture' },
  { name: 'Agile / Scrum', aliases: ['agile', 'scrum', 'kanban', 'sprint planning'], category: 'Practices & Architecture' },
  { name: 'Unit & Integration Testing', aliases: ['unit testing', 'jest', 'junit', 'pytest', 'tdd', 'test driven development'], category: 'Practices & Architecture' },
  { name: 'Git & Version Control', aliases: ['git', 'github', 'gitlab', 'code reviews'], category: 'Practices & Architecture' }
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textContains(source: string, term: string): boolean {
  if (term.length <= 2) {
    const pattern = new RegExp(`(?:^|[^a-z0-9+#.])${escapeRegex(term)}(?=$|[^a-z0-9+#])`, 'i');
    return pattern.test(source);
  }
  const pattern = new RegExp(`(?:^|[^a-z0-9+#.])${escapeRegex(term.toLowerCase())}(?=$|[^a-z0-9+#])`, 'i');
  return pattern.test(source);
}

/**
 * Extracts recognized skills and categories from job description text.
 */
export function extractJobSkills(description: string, title?: string): ExtractedSkill[] {
  if (!description) return [];
  const fullText = `${title || ''}\n${description}`;
  const extracted: ExtractedSkill[] = [];

  for (const item of SKILL_DATABASE) {
    const allVariants = [item.name, ...item.aliases];
    let matchCount = 0;
    let snippet = '';

    for (const variant of allVariants) {
      if (textContains(fullText, variant)) {
        matchCount++;
        if (!snippet) {
          const lines = fullText.split('\n');
          const found = lines.find((line) => textContains(line, variant))?.trim();
          if (found) {
            snippet = found.length > 130 ? found.slice(0, 127) + '...' : found;
          }
        }
      }
    }

    if (matchCount > 0) {
      extracted.push({
        name: item.name,
        category: item.category,
        sourceSnippet: snippet || item.name,
        count: matchCount
      });
    }
  }

  // Sort by category order, then name
  return extracted;
}

/**
 * Extracts complete structured job details:
 * - High-level summary
 * - Responsibilities
 * - Must-haves / Requirements
 * - Nice-to-haves
 * - Location / Clearance constraints
 * - Skills
 */
export function extractCompleteJobDetails(description: string, title?: string): StructuredJobDetails {
  if (!description) {
    return {
      summary: '',
      responsibilities: [],
      mustHaves: [],
      niceToHaves: [],
      constraints: [],
      skills: [],
      topTechStack: []
    };
  }

  const skills = extractJobSkills(description, title);
  const rawLines = description.split('\n').map((l) => l.trim()).filter(Boolean);

  const responsibilities: string[] = [];
  const mustHaves: string[] = [];
  const niceToHaves: string[] = [];
  const constraints: StructuredJobDetails['constraints'] = [];

  // Identify Constraints
  if (/US Government|Clearance|DoD|Secret/i.test(description)) {
    const line = rawLines.find((l) => /US Government|Clearance|DoD/i.test(l)) || 'Requires support of US Government work / clearance eligibility';
    constraints.push({
      type: 'clearance',
      title: 'US Government Support & Clearance',
      description: line.replace(/^[•*\-\s]+/, '')
    });
  }

  if (/Wiesbaden|Germany|relocat|on-site|hybrid/i.test(description)) {
    const line = rawLines.find((l) => /Wiesbaden|Germany|relocat/i.test(l)) || 'Location: Wiesbaden, Germany or on-site relocation required';
    constraints.push({
      type: 'location',
      title: 'Location & Relocation',
      description: line.replace(/^[•*\-\s]+/, '')
    });
  }

  const expMatch = description.match(/\b(\d{1,2})\+?\s*(?:-|–|to)?\s*\d*\s*years?\b.*?(?:experience|software|engineering)/i);
  if (expMatch) {
    constraints.push({
      type: 'experience',
      title: 'Experience Level',
      description: expMatch[0]
    });
  }

  // Parse structured sections by looking for section headings
  let currentSection: 'summary' | 'resp' | 'must' | 'nice' | 'other' = 'summary';
  const summaryParagraphs: string[] = [];

  for (const line of rawLines) {
    const clean = line.replace(/^[#•*\-\d.)\s]+/, '').trim();
    if (!clean) continue;

    // Detect section header changes
    if (/(?:responsibilities|what you['’]ll do|the role|your impact|core duties|what you will be doing)/i.test(line) && line.length < 80) {
      currentSection = 'resp';
      continue;
    } else if (/(?:requirements|qualifications|what we['’]re looking for|basic qualifications|minimum qualifications|must have|what you bring)/i.test(line) && line.length < 80) {
      currentSection = 'must';
      continue;
    } else if (/(?:preferred|nice to have|bonus|desired|what gives you an edge|good to have)/i.test(line) && line.length < 80) {
      currentSection = 'nice';
      continue;
    } else if (/(?:about us|who we are|benefits|perks|compensation|equal opportunity)/i.test(line) && line.length < 80) {
      currentSection = 'other';
      continue;
    }

    const isBullet = /^[•*\-\d.]/.test(line) || clean.length > 25;

    if (currentSection === 'summary' && !isBullet && summaryParagraphs.length < 3) {
      if (!/NOTE:|A World-Changing Company/i.test(clean) || summaryParagraphs.length === 0) {
        summaryParagraphs.push(clean);
      }
    } else if (currentSection === 'resp' && isBullet) {
      responsibilities.push(clean);
    } else if (currentSection === 'must' && isBullet) {
      mustHaves.push(clean);
    } else if (currentSection === 'nice' && isBullet) {
      niceToHaves.push(clean);
    }
  }

  // Fallback: If sections weren't clearly demarcated by headers, extract bullets intelligently
  if (responsibilities.length === 0 && mustHaves.length === 0) {
    for (const line of rawLines) {
      const clean = line.replace(/^[•*\-\s]+/, '').trim();
      if (clean.length < 25) continue;

      if (/architect|build|develop|design|lead|deploy|collaborate|implement|maintain|partner|deliver/i.test(clean)) {
        if (responsibilities.length < 8) responsibilities.push(clean);
      } else if (/years|degree|bachelor|master|proficien|experience with|deep knowledge|strong background/i.test(clean)) {
        if (mustHaves.length < 8) mustHaves.push(clean);
      }
    }
  }

  // Pick top 6-8 core technical skills
  const coreCats = ['Languages & Core', 'Backend & APIs', 'Cloud & DevOps', 'Data, AI & Storage'];
  const topTechStack = skills
    .filter((s) => coreCats.includes(s.category))
    .slice(0, 8)
    .map((s) => s.name);

  return {
    summary: summaryParagraphs.slice(0, 2).join(' ') || rawLines.slice(0, 2).join(' '),
    responsibilities: responsibilities.slice(0, 10),
    mustHaves: mustHaves.slice(0, 10),
    niceToHaves: niceToHaves.slice(0, 6),
    constraints,
    skills,
    topTechStack
  };
}

/**
 * Extracts key JD requirements for direct candidate citations.
 */
export function extractKeyRequirements(description: string): ExtractedRequirement[] {
  if (!description) return [];
  const results: ExtractedRequirement[] = [];
  const lines = description.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 20);

  // 1. Check for Government / Clearance / Specific Location constraints
  for (const line of lines) {
    if (/US Government|Wiesbaden|Germany|Clearance|Relocation/i.test(line)) {
      results.push({
        id: 'req_domain_' + results.length,
        category: 'Clearance & Location',
        requirement: line.replace(/^[•*\-\s]+/, '').slice(0, 140),
        jobEvidence: line,
        status: 'verification_needed'
      });
      if (results.length >= 2) break;
    }
  }

  // 2. Check for Experience & Education
  for (const line of lines) {
    if (/\b\d+\+?\s*(?:-|–|to)?\s*\d*\s*years?\b|bachelor|master|degree|computer science/i.test(line)) {
      results.push({
        id: 'req_exp_' + results.length,
        category: 'Experience & Education',
        requirement: line.replace(/^[•*\-\s]+/, '').slice(0, 140),
        jobEvidence: line,
        status: 'verification_needed'
      });
      if (results.length >= 4) break;
    }
  }

  // 3. Check for Core Tech Stack / Systems Experience
  for (const line of lines) {
    if (/distributed systems|microservices|backend|full stack|cloud|data pipelines|software engineer/i.test(line)) {
      if (!results.some((r) => r.jobEvidence === line)) {
        results.push({
          id: 'req_tech_' + results.length,
          category: 'Technical Stack',
          requirement: line.replace(/^[•*\-\s]+/, '').slice(0, 140),
          jobEvidence: line,
          status: 'verification_needed'
        });
        if (results.length >= 6) break;
      }
    }
  }

  return results;
}

/**
 * Computes deterministic candidate-to-job match analysis with exact evidence.
 */
export function analyzeCandidateFit(
  candidate: Candidate,
  jobDescription: string,
  jobTitle?: string
): CandidateFitAnalysis {
  const extractedSkills = extractJobSkills(jobDescription, jobTitle);
  const keyReqs = extractKeyRequirements(jobDescription);

  // Gather candidate text corpus
  const candidateCorpus: { field: string; text: string }[] = [];
  if (candidate.primary_skills) candidateCorpus.push({ field: 'Primary Skills', text: candidate.primary_skills });
  if (candidate.secondary_skills) candidateCorpus.push({ field: 'Secondary Skills', text: candidate.secondary_skills });
  if (candidate.current_job_title) candidateCorpus.push({ field: 'Current Role', text: candidate.current_job_title });
  if (candidate.highest_qualification) candidateCorpus.push({ field: 'Education', text: candidate.highest_qualification });
  if (candidate.notes) candidateCorpus.push({ field: 'Candidate Facts', text: candidate.notes });

  // Add confirmed facts if any
  if (candidate.confirmed_facts) {
    for (const [k, v] of Object.entries(candidate.confirmed_facts)) {
      if (typeof v === 'string' && v.trim()) {
        candidateCorpus.push({ field: k.replaceAll('_', ' '), text: v });
      }
    }
  }

  const matchedSkills: { skill: string; candidateField: string }[] = [];
  const missingSkills: string[] = [];

  for (const skill of extractedSkills) {
    let found = false;
    for (const item of candidateCorpus) {
      if (textContains(item.text, skill.name)) {
        matchedSkills.push({ skill: skill.name, candidateField: item.field });
        found = true;
        break;
      }
    }
    if (!found) {
      missingSkills.push(skill.name);
    }
  }

  // Assess requirements
  const requirements: ExtractedRequirement[] = keyReqs.map((req) => {
    let met = false;
    let proof = '';

    for (const item of candidateCorpus) {
      const words = req.requirement.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      const matchedWords = words.filter((w) => item.text.toLowerCase().includes(w));
      if (matchedWords.length >= 2 || (words.length === 1 && matchedWords.length === 1)) {
        met = true;
        proof = `${item.field}: includes ${matchedWords.join(', ')}`;
        break;
      }
    }

    return {
      ...req,
      status: met ? 'met' : req.category === 'Clearance & Location' ? 'verification_needed' : 'missing',
      candidateEvidence: proof || (req.category === 'Clearance & Location' ? 'Requires manual recruiter confirmation' : 'Not explicitly cited in profile')
    };
  });

  // Evaluate Constraints
  const constraints: CandidateFitAnalysis['constraints'] = [];

  // Work Authorization Constraint
  if (/US Government|Authorized in USA|Clearance/i.test(jobDescription)) {
    const isAuth = candidate.authorized_in_usa === true;
    constraints.push({
      label: 'US Work Authorization & Clearance',
      requirement: 'Work requires US Government authorization or clearance eligibility',
      candidateFact: candidate.authorized_in_usa ? 'Authorized in US' : 'Not recorded as US citizen / authorized',
      status: isAuth ? 'met' : 'verification_needed'
    });
  }

  // Location / Relocation Constraint
  if (/Wiesbaden|Germany|relocat/i.test(jobDescription)) {
    const willing = candidate.open_to_relocation === true;
    constraints.push({
      label: 'Role Location (Wiesbaden, Germany)',
      requirement: 'Position is on-site in Wiesbaden, Germany (US Gov work)',
      candidateFact: candidate.open_to_relocation ? 'Candidate is open to relocation' : 'Candidate preferred locations: ' + (candidate.preferred_locations || 'Unknown'),
      status: willing ? 'met' : 'verification_needed'
    });
  }

  // Years of Experience
  const expMatch = jobDescription.match(/(\d+)\+?\s*years/i);
  if (expMatch && candidate.total_experience_years) {
    const reqYears = parseInt(expMatch[1], 10);
    const candYears = parseFloat(candidate.total_experience_years);
    constraints.push({
      label: 'Experience Threshold',
      requirement: `Requires approx ${reqYears}+ years experience`,
      candidateFact: `${candidate.total_experience_years} years recorded`,
      status: candYears >= reqYears ? 'met' : 'verification_needed'
    });
  }

  // Calculate score
  const totalSkillsCount = extractedSkills.length || 1;
  const skillRatio = matchedSkills.length / totalSkillsCount;
  const reqMetRatio = requirements.filter((r) => r.status === 'met').length / (requirements.length || 1);
  const calculatedScore = Math.min(98, Math.round((skillRatio * 0.65 + reqMetRatio * 0.35) * 100));
  const finalScore = Math.max(35, calculatedScore);

  let verdict: CandidateFitAnalysis['verdict'] = 'Good Fit';
  if (finalScore >= 75) verdict = 'Strong Fit';
  else if (finalScore < 50) verdict = 'Review Required';

  return {
    candidateId: candidate.id,
    candidateName: candidate.full_name,
    matchScore: finalScore,
    matchedSkills,
    missingSkills,
    requirements,
    constraints,
    verdict
  };
}
