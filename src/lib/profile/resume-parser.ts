import { readResume, ResumeReadError } from '@/lib/resumes/validation';
import { extractResumeLocal } from '@/lib/resumes/local-extract';
import { POPULAR_SKILLS } from '@/lib/profile/skills-data';
import type { CandidateProfileState, WorkExperience, EducationEntry, ProjectEntry } from '@/lib/profile/types';
import { DEFAULT_SCREENING_ANSWERS } from '@/lib/profile/profile-store';

const COMMON_SPOKEN_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Hindi',
  'Telugu',
  'Tamil',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Mandarin',
  'Chinese',
  'Japanese',
  'Korean',
  'Arabic',
  'Portuguese',
  'Russian',
  'Italian',
  'Dutch',
  'Polish',
  'Swedish',
];

// Helper to clean and trim lines
function cleanLine(str: string): string {
  return str.replace(/[ \t]+/g, ' ').trim();
}

// Extract Projects section from raw text if present
function extractProjectsFromText(text: string): ProjectEntry[] {
  const projects: ProjectEntry[] = [];
  const projectSectionMatch = text.match(
    /(?:selected\s+|key\s+|personal\s+|academic\s+)?projects\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:education|skills|experience|certifications|languages|work history|employment)|$)/i
  );

  if (!projectSectionMatch || !projectSectionMatch[1]) return projects;

  const sectionText = projectSectionMatch[1].trim();
  const blocks = sectionText.split(/\n\s*\n/);

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map(cleanLine).filter(Boolean);
    if (lines.length === 0) return;

    const firstLine = lines[0];
    const linkMatch = block.match(/https?:\/\/[^\s,;)]+/i);
    const link = linkMatch ? linkMatch[0] : '';

    const name = firstLine
      .replace(/https?:\/\/[^\s,;)]+/gi, '')
      .replace(/[|•–—].*$/, '')
      .replace(/project/i, '')
      .trim();

    const descLines = lines.slice(1).map((l) => l.replace(/^[\s•▪●*–—◦⁃-]+\s*/, '').trim()).filter(Boolean);

    if (name && name.length > 2 && name.length < 80) {
      projects.push({
        id: `proj_${Date.now()}_${idx}`,
        name,
        link: link || undefined,
        description: descLines.join(' ') || undefined,
      });
    }
  });

  return projects.slice(0, 5);
}

// Fallback Work History extractor if local parser missed entries
function extractFallbackExperience(text: string): WorkExperience[] {
  const experiences: WorkExperience[] = [];
  const expMatch = text.match(
    /(?:work\s+|professional\s+)?(?:experience|employment|work\s+history)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:education|skills|projects|certifications|languages)|$)/i
  );

  if (!expMatch || !expMatch[1]) return experiences;

  const lines = expMatch[1].split('\n').map(cleanLine).filter(Boolean);
  let current: WorkExperience | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isBullet = /^[\s•▪●*–—◦⁃-]+\s*/.test(line);

    if (isBullet) {
      const cleanBullet = line.replace(/^[\s•▪●*–—◦⁃-]+\s*/, '').trim();
      if (cleanBullet && current) {
        current.achievements.push(cleanBullet);
      }
      continue;
    }

    // Check for date range in line
    const dateRangeMatch = line.match(
      /\b((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{4})\s*(?:-|–|—|to)\s*((?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{4}|present|current)\b/i
    );

    const hasRoleKeyword = /\b(?:engineer|developer|lead|architect|manager|designer|analyst|specialist|consultant|intern)\b/i.test(line);

    if (dateRangeMatch || hasRoleKeyword) {
      let role = '';
      let company = '';
      let location = '';
      const start = dateRangeMatch ? dateRangeMatch[1] : '';
      const end = dateRangeMatch ? dateRangeMatch[2] : '';

      const lineWithoutDates = dateRangeMatch ? line.replace(dateRangeMatch[0], '').trim() : line;
      const parts = lineWithoutDates.split(/\s*[-–—|•]\s*|\s+at\s+|\s*,\s*/i).map(cleanLine).filter(Boolean);

      if (parts.length >= 2) {
        if (hasRoleKeyword && /\b(?:engineer|developer|lead|architect|manager|designer|analyst)\b/i.test(parts[0])) {
          role = parts[0];
          company = parts[1];
          if (parts[2]) location = parts[2];
        } else {
          company = parts[0];
          role = parts[1];
          if (parts[2]) location = parts[2];
        }
      } else if (parts.length === 1) {
        if (hasRoleKeyword) {
          role = parts[0];
          // Check if previous or next line is company
          if (lines[i - 1] && !lines[i - 1].includes('-')) company = lines[i - 1];
          else if (lines[i + 1] && !lines[i + 1].includes('-')) company = lines[i + 1];
        } else {
          company = parts[0];
        }
      }

      if (role || company) {
        current = {
          id: `fallback_work_${Date.now()}_${experiences.length}`,
          role: role || 'Software Professional',
          company: company || 'Organization',
          location,
          start,
          end,
          current: /present|current/i.test(end) || !end,
          achievements: [],
        };
        experiences.push(current);
      }
    }
  }

  return experiences.slice(0, 10);
}

export async function parseResumeFile(
  fileBuffer: Buffer,
  filename: string,
  fileSize: number
): Promise<{ profile: CandidateProfileState; rawText: string }> {
  let parsedText = '';
  let atsReadable = true;

  if (/\.txt$/i.test(filename)) {
    parsedText = fileBuffer.toString('utf-8');
  } else {
    try {
      const readResult = await readResume(fileBuffer, filename);
      parsedText = readResult.text || '';
    } catch (err) {
      if (err instanceof ResumeReadError) {
        throw err;
      }
      // Fallback: try raw text decode if mammoth/pdf failed
      parsedText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      atsReadable = false;
    }
  }

  if (!parsedText.trim()) {
    throw new Error('Could not extract readable text from resume. Please ensure the document contains selectable text.');
  }

  const localExt = extractResumeLocal(parsedText);
  const fields = (localExt.fields || {}) as Record<string, any>;
  const lowerText = parsedText.toLowerCase();

  // 1. Full Name Extraction (with top lines fallback)
  let fullName = String(fields.full_name || '').trim();
  if (!fullName || fullName.length < 2) {
    const topLines = parsedText.split('\n').map(cleanLine).filter(Boolean);
    for (const line of topLines.slice(0, 6)) {
      if (
        /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,40}$/.test(line) &&
        !/resume|curriculum|vitae|profile|summary|contact|email|phone|experience|skills/i.test(line) &&
        !line.includes('@') &&
        !line.includes('http') &&
        !/\d/.test(line)
      ) {
        fullName = line;
        break;
      }
    }
  }

  // 2. Email Extraction
  let email = String(fields.email || '').trim();
  if (!email) {
    const emailMatch = parsedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) email = emailMatch[0].toLowerCase();
  }

  // 3. Phone Extraction
  let phone = String(fields.phone || '').trim();
  if (!phone) {
    const phoneMatch = parsedText.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (phoneMatch) phone = phoneMatch[0];
  }

  // 4. Links Extraction (LinkedIn, GitHub, Portfolio, Dev, etc.)
  const linksSet = new Set<string>();
  if (fields.linkedin_url) linksSet.add(fields.linkedin_url);
  if (fields.github_url) linksSet.add(fields.github_url);

  const urlMatches = parsedText.match(/https?:\/\/[^\s,;)]+/gi) || [];
  for (const rawUrl of urlMatches) {
    const cleanUrl = rawUrl.replace(/[.,;)]+$/, '');
    if (
      cleanUrl.includes('github.com') ||
      cleanUrl.includes('linkedin.com') ||
      cleanUrl.includes('gitlab.com') ||
      cleanUrl.includes('.dev') ||
      cleanUrl.includes('.io') ||
      cleanUrl.includes('portfolio') ||
      cleanUrl.includes('.vercel.app') ||
      cleanUrl.includes('medium.com') ||
      cleanUrl.includes('twitter.com') ||
      cleanUrl.includes('x.com')
    ) {
      linksSet.add(cleanUrl);
    }
  }
  const links = Array.from(linksSet);

  // 5. Location Extraction
  let city = String(fields.current_city || '').trim();
  let state = String(fields.current_state || '').trim();
  let locationStr = [city, state].filter(Boolean).join(', ');

  if (!locationStr) {
    const locMatch = parsedText.match(/\b([A-Z][a-zA-Z\s]+),\s*([A-Z]{2})\b/);
    if (locMatch) {
      city = locMatch[1].trim();
      state = locMatch[2].trim();
      locationStr = `${city}, ${state}`;
    }
  }

  // 6. Timezone Detection
  let detectedTimezone = 'UTC';
  const locCombined = `${city} ${state} ${locationStr} ${parsedText.slice(0, 1500)}`.toLowerCase();

  if (/texas|austin|dallas|houston|san antonio|chicago|illinois|minneapolis|central/i.test(locCombined)) {
    detectedTimezone = 'America/Chicago';
  } else if (/california|san francisco|\bsf\b|los angeles|\bla\b|seattle|washington|silicon valley|pacific/i.test(locCombined)) {
    detectedTimezone = 'America/Los_Angeles';
  } else if (/new york|\bnyc\b|boston|massachusetts|atlanta|georgia|florida|miami|eastern/i.test(locCombined)) {
    detectedTimezone = 'America/New_York';
  } else if (/denver|colorado|utah|salt lake|mountain/i.test(locCombined)) {
    detectedTimezone = 'America/Denver';
  } else if (/india|bengaluru|bangalore|hyderabad|mumbai|delhi|pune|chennai|noida/i.test(locCombined)) {
    detectedTimezone = 'Asia/Calcutta';
  } else if (/united kingdom|\buk\b|london|manchester|birmingham|edinburgh/i.test(locCombined)) {
    detectedTimezone = 'Europe/London';
  } else if (/germany|berlin|munich|frankfurt|hamburg/i.test(locCombined)) {
    detectedTimezone = 'Europe/Berlin';
  } else if (/canada|toronto|vancouver|montreal|ontario/i.test(locCombined)) {
    detectedTimezone = 'America/Toronto';
  } else if (/australia|sydney|melbourne|brisbane/i.test(locCombined)) {
    detectedTimezone = 'Australia/Sydney';
  }

  // 7. Work Format Detection
  const workFormats: string[] = [];
  if (lowerText.includes('remote')) workFormats.push('Remote');
  if (lowerText.includes('hybrid')) workFormats.push('Hybrid');
  if (lowerText.includes('on-site') || lowerText.includes('onsite') || lowerText.includes('in-office')) workFormats.push('On-site');
  if (workFormats.length === 0) workFormats.push('Remote');

  // 8. Roles Detection across ALL 55 roles
  const detectedRoles: string[] = [];
  const titleText = `${fields.current_job_title || ''} ${fields.target_job_titles || ''} ${parsedText.slice(0, 800)}`.toLowerCase();

  const roleKeywords: Record<string, string[]> = {
    'Software Engineering': ['software engineer', 'software developer', 'programmer', 'swe', 'sde'],
    'Frontend': ['frontend', 'front-end', 'ui developer', 'react', 'vue', 'angular'],
    'Backend': ['backend', 'back-end', 'node', 'django', 'api engineer', 'server-side'],
    'Full-Stack': ['fullstack', 'full-stack', 'full stack'],
    'Mobile': ['mobile', 'ios', 'android', 'react native', 'flutter', 'swift'],
    'DevOps': ['devops', 'sre', 'site reliability', 'platform engineer', 'infrastructure', 'ci/cd', 'cloud engineer'],
    'Data Engineering': ['data engineer', 'etl', 'data pipeline', 'spark', 'hadoop'],
    'Machine Learning / AI': ['machine learning', 'ml engineer', 'ai engineer', 'deep learning', 'nlp', 'data scientist'],
    'QA / Test': ['qa', 'test engineer', 'quality assurance', 'sdet', 'automation engineer'],
    'Security / SOC': ['security', 'cybersecurity', 'soc analyst', 'penetration', 'infosec'],
    'Cloud Architecture': ['cloud architect', 'solutions architect', 'aws architect', 'azure architect'],
    'Product Management': ['product manager', 'technical product manager', 'product owner'],
    'UI/UX Design': ['ui/ux', 'product designer', 'ux designer', 'ui designer'],
    'Database Administration': ['database administrator', 'dba', 'database engineer'],
    'Engineering Management': ['engineering manager', 'tech lead', 'team lead', 'vp of engineering'],
  };

  for (const [roleName, keywords] of Object.entries(roleKeywords)) {
    if (keywords.some((kw) => titleText.includes(kw))) {
      detectedRoles.push(roleName);
      if (detectedRoles.length >= 10) break;
    }
  }

  if (detectedRoles.length === 0) {
    if (lowerText.includes('react') || lowerText.includes('frontend')) detectedRoles.push('Frontend');
    if (lowerText.includes('node') || lowerText.includes('python') || lowerText.includes('backend')) detectedRoles.push('Backend');
    if (lowerText.includes('fullstack') || lowerText.includes('full-stack')) detectedRoles.push('Full-Stack');
    if (detectedRoles.length === 0) detectedRoles.push('Software Engineering');
  }

  // 9. Seniority Levels
  const detectedSeniorities: string[] = [];
  const yearsExpNum = Number(fields.total_experience_years) || 0;

  if (titleText.includes('intern') || titleText.includes('internship')) {
    detectedSeniorities.push('Intern');
  }
  if (yearsExpNum < 2 || titleText.includes('junior') || titleText.includes('associate') || titleText.includes('entry level')) {
    if (!detectedSeniorities.includes('Junior')) detectedSeniorities.push('Junior');
  }
  if ((yearsExpNum >= 2 && yearsExpNum <= 5) || titleText.includes('mid-level') || titleText.includes('intermediate')) {
    if (!detectedSeniorities.includes('Middle')) detectedSeniorities.push('Middle');
  }
  if (yearsExpNum >= 5 || titleText.includes('senior') || titleText.includes('sr.') || titleText.includes('sr ')) {
    if (!detectedSeniorities.includes('Senior')) detectedSeniorities.push('Senior');
  }
  if (yearsExpNum >= 8 || titleText.includes('lead') || titleText.includes('tech lead')) {
    if (!detectedSeniorities.includes('Lead')) detectedSeniorities.push('Lead');
  }
  if (titleText.includes('staff')) {
    if (!detectedSeniorities.includes('Staff')) detectedSeniorities.push('Staff');
  }
  if (titleText.includes('principal')) {
    if (!detectedSeniorities.includes('Principal')) detectedSeniorities.push('Principal');
  }
  if (titleText.includes('cto') || titleText.includes('vp') || titleText.includes('director') || titleText.includes('chief')) {
    if (!detectedSeniorities.includes('C-level')) detectedSeniorities.push('C-level');
  }

  if (detectedSeniorities.length === 0) {
    detectedSeniorities.push('Senior');
  }

  // 10. Skills Extraction (Complete & Deduplicated)
  const extractedSkillsSet = new Set<string>();

  if (Array.isArray(localExt.evidence)) {
    const skillsEv = localExt.evidence.filter((e: any) => e.field === 'skills');
    for (const s of skillsEv) {
      if (s.snippet) extractedSkillsSet.add(s.snippet.trim());
    }
  }

  if (fields.primary_skills) {
    const list = String(fields.primary_skills).split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    for (const item of list) extractedSkillsSet.add(item);
  }

  // Check all POPULAR_SKILLS against entire text
  for (const skill of POPULAR_SKILLS) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9+#.])${escaped}(?:$|[^a-zA-Z0-9+#.])`, 'i');
    if (regex.test(parsedText)) {
      extractedSkillsSet.add(skill);
    }
  }

  const finalSkills = Array.from(extractedSkillsSet).slice(0, 35);

  // 11. Work History Extraction (Primary + Fallback)
  let workHistory: WorkExperience[] = [];
  if (Array.isArray(localExt.employmentHistory) && localExt.employmentHistory.length > 0) {
    localExt.employmentHistory.forEach((emp: any, idx: number) => {
      const bullets = Array.isArray(emp.bullets) && emp.bullets.length > 0
        ? emp.bullets
        : emp.evidence ? [String(emp.evidence)] : [];

      workHistory.push({
        id: `work_${Date.now()}_${idx}`,
        company: emp.employer || 'Company',
        role: emp.title || 'Engineer',
        location: emp.location || '',
        start: emp.start || '',
        end: emp.end || '',
        current: !emp.end || /present|current/i.test(String(emp.end)),
        achievements: bullets,
      });
    });
  }

  if (workHistory.length === 0) {
    workHistory = extractFallbackExperience(parsedText);
  }

  // 12. Projects Extraction
  const projects = extractProjectsFromText(parsedText);

  // 13. Education Extraction
  const education: EducationEntry[] = [];
  if (Array.isArray(localExt.educationHistory) && localExt.educationHistory.length > 0) {
    localExt.educationHistory.forEach((edu: any, idx: number) => {
      education.push({
        id: `edu_${Date.now()}_${idx}`,
        degree: edu.degree || 'Degree',
        institution: edu.institution || 'University',
        year: edu.dates || edu.end || edu.start || '',
        yearOnly: true,
      });
    });
  }

  // 14. Languages Spoken
  const spokenLanguages: string[] = [];
  for (const lang of COMMON_SPOKEN_LANGUAGES) {
    const regex = new RegExp(`\\b${lang}\\b`, 'i');
    if (regex.test(parsedText)) {
      spokenLanguages.push(lang);
    }
  }
  if (spokenLanguages.length === 0) {
    spokenLanguages.push('English');
  }

  // 15. Certifications Extraction
  const certs: string[] = [];
  if (fields.certifications) {
    const certList = String(fields.certifications).split(/[;\n]+/).map((c) => c.trim()).filter(Boolean);
    certs.push(...certList);
  }
  // Also check for common certifications in text
  const certPatterns = [
    /AWS Certified [A-Za-z\s]+/gi,
    /Certified Kubernetes [A-Za-z\s]+/gi,
    /CKA|CKAD|CKS/g,
    /Google Cloud Certified [A-Za-z\s]+/gi,
    /Microsoft Certified [A-Za-z\s]+/gi,
    /PMP|Scrum Master|CSM/gi,
  ];
  for (const pattern of certPatterns) {
    const matches = parsedText.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (!certs.includes(m)) certs.push(m);
      }
    }
  }

  // Notice Period Detection
  let noticePeriodDays = '';
  const noticeMatch = parsedText.match(/notice\s+period\s*[:\-–]?\s*(\d+)\s*(?:days?|weeks?|months?)|(immediate(?:ly)?)/i);
  if (noticeMatch) {
    if (noticeMatch[2]) {
      noticePeriodDays = '0';
    } else if (noticeMatch[1]) {
      const num = parseInt(noticeMatch[1], 10);
      if (lowerText.includes('month')) noticePeriodDays = String(num * 30);
      else if (lowerText.includes('week')) noticePeriodDays = String(num * 7);
      else noticePeriodDays = String(num);
    }
  }

  // Formatted file size
  const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);
  const sizeFormatted = `${sizeMb} MB`;

  const profile: CandidateProfileState = {
    photoUrl: null,
    cv: {
      filename,
      uploadedAt: new Date().toISOString(),
      rawText: parsedText,
      sizeFormatted,
      atsReadable,
      yearsExperience: yearsExpNum || (workHistory.length > 0 ? workHistory.length * 2 : 3),
    },
    headline: detectedRoles[0] || '',
    summary: '',
    roles: detectedRoles,
    seniorities: detectedSeniorities,
    jobLanguages: spokenLanguages.slice(0, 3),
    contacts: {
      fullName,
      email,
      phone,
      location: locationStr,
      links,
    },
    location: {
      workFormat: workFormats,
      whereBased: locationStr || city,
      timezone: detectedTimezone,
      regions: ['Worldwide'],
      countries: [],
      openToRelocation: false,
    },
    skills: finalSkills,
    excludedSkills: [],
    excludedSources: [],
    excludedCompanies: [],
    workHistory,
    projects,
    education,
    languages: spokenLanguages,
    certifications: certs,
    screeningAnswers: {
      ...DEFAULT_SCREENING_ANSWERS,
      willing_to_relocate: 'negotiable' as any,
      notice_period_days: noticePeriodDays,
    },
  };

  return { profile, rawText: parsedText };
}
