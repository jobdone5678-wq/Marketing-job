/* Shared deterministic, evidence-only resume engine. Runs in the extension and server. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NextkinResume = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.0.0';
  const text = value => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const rows = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
  const unique = values => [...new Map(values.filter(Boolean).map(value => [value.toLowerCase(), value])).values()];
  const terms = [
    'JavaScript', 'TypeScript', 'Java', 'Python', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'COBOL',
    'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Spring Boot', 'Django', 'Flask', 'FastAPI', '.NET',
    'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Snowflake', 'Spark', 'Kafka',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Linux', 'Git', 'Jenkins', 'CI/CD',
    'GraphQL', 'REST APIs', 'Microservices', 'HTML', 'CSS', 'Jest', 'JUnit', 'Selenium', 'Machine Learning',
    'Excel', 'Microsoft Office', 'Power BI', 'Tableau', 'Salesforce', 'SAP', 'QuickBooks', 'Accounting',
    'Payroll', 'Bookkeeping', 'Financial Reporting', 'Reconciliation', 'Accounts Payable', 'Accounts Receivable',
    'Project Management', 'Agile', 'Scrum', 'Jira', 'Customer Service', 'Customer Support', 'Sales', 'Marketing',
    'SEO', 'Google Analytics', 'Content Writing', 'Copywriting', 'Recruiting', 'Talent Acquisition', 'HRIS',
    'Figma', 'Photoshop', 'UX Design', 'User Research', 'Product Management', 'Data Analysis', 'Data Pipelines',
    'Active Directory', 'Networking', 'Troubleshooting', 'Hardware', 'Helpdesk', 'Technical Support', 'ITIL',
    'Nursing', 'Patient Care', 'CPR', 'HIPAA', 'Medical Coding', 'Logistics', 'Supply Chain', 'Inventory Management'
  ];
  const aliases = {'AWS':['Amazon Web Services'],'GCP':['Google Cloud','Google Cloud Platform'],'React':['React.js','ReactJS'],'Node.js':['NodeJS'],'PostgreSQL':['Postgres'],'Kubernetes':['K8s'],'Excel':['Microsoft Excel'],'REST APIs':['RESTful APIs'],'Active Directory':['AD administration']};
  function contains(source, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + escaped + '(?=$|[^a-z0-9+#])', 'i').test(source);
  }
  const hasTerm = (source, term) => [term, ...(aliases[term] || [])].some(value => contains(source, value));
  const negated = value => /\b(?:no\s+(?:(?:prior|professional|hands-on)\s+)?(?:experience|knowledge|proficiency)|not\s+(?:proficient|experienced|familiar|certified|skilled)|never\s+(?:used|worked)|without\s+(?:experience|knowledge)|lack(?:ing)?\s+(?:experience|knowledge|proficiency)|unfamiliar\s+with|do\s+not\s+know|want\s+to\s+learn|interested\s+in\s+learning)\b/i.test(value);
  function positiveTerm(source, term) {
    return source.split(/\n|;|(?<=[.!?])\s+|\bbut\b/i).some(line => hasTerm(line,term) && !negated(line) && !/^(?:I\s+(?:am\s+)?|currently\s+)?(?:learning|studying|aspiring|interested\s+in|hoping\s+to|planning\s+to)\b/i.test(line.trim()));
  }
  function sourceSections(source) {
    const headers = /^(?:(?:professional|work)\s+experience|experience|employment(?:\s+history)?|professional\s+background|(?:professional\s+)?summary|profile|objective|(?:technical|core|professional)\s+skills|skills|education|projects|certifications|licenses|awards|volunteering|publications|additional\s+information)\s*:?$/i;
    const blocks = [{heading:'',lines:[]}];
    for (const line of source.split('\n')) {
      if (headers.test(line.trim())) blocks.push({heading:line.trim().replace(/:$/,'').toUpperCase(),lines:[]});
      else blocks[blocks.length-1].lines.push(line);
    }
    return blocks;
  }
  function categorizeSkills(skills) {
    const categories = [
      { name: 'Frontend', re: /\b(react|angular|vue|next\.?js|nuxt|svelte|html5?|css3?|javascript|typescript|tailwind|bootstrap|redux|webpack|vite|ui\b|frontend)\b/i },
      { name: 'Backend', re: /\b(java\b|spring|spring boot|microservices|rest\b|restful|apis?|python|node\.?js|express|c#|\.net|asp\.net|go\b|golang|ruby|rails|php|laravel|django|flask|fastapi|c\+\+|graphql|grpc|backend)\b/i },
      { name: 'Data & Messaging', re: /\b(sql|postgres|postgresql|mysql|redis|kafka|mongodb|dynamodb|oracle|snowflake|spark|cassandra|rabbitmq|elasticsearch|sqlite|database|data pipeline|etl)\b/i },
      { name: 'Cloud & DevOps', re: /\b(aws|amazon web services|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|jenkins|ci\/cd|linux|unix|ansible|git\b|github actions|helm|cloudformation)\b/i },
      { name: 'Tools', re: /\b(git|maven|gradle|postman|jira|agile|scrum|kanban|unit testing|integration testing|jest|junit|selenium|cypress|pytest|testing)\b/i },
      { name: 'Marketing & Analytics', re: /\b(seo|sem|google analytics|marketing|copywriting|hubspot|google ads|meta ads|social media|content)\b/i },
      { name: 'Finance & Accounting', re: /\b(excel|quickbooks|financial|accounting|reconciliation|accounts payable|accounts receivable|payroll|bookkeeping|sap)\b/i }
    ];
    const assigned = new Map();
    const unassigned = [];
    for (const skill of skills) {
      let matched = false;
      for (const cat of categories) {
        if (cat.re.test(skill)) {
          if (!assigned.has(cat.name)) assigned.set(cat.name, []);
          assigned.get(cat.name).push(skill);
          matched = true;
          break;
        }
      }
      if (!matched) unassigned.push(skill);
    }
    if (unassigned.length) {
      const targetCat = assigned.size > 0 ? (assigned.has('Tools') ? 'Tools' : [...assigned.keys()][0]) : 'Core Skills';
      if (!assigned.has(targetCat)) assigned.set(targetCat, []);
      assigned.get(targetCat).push(...unassigned);
    }
    return assigned;
  }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
    return value;
  }
  function jobIdentity(job) {
    let url = text(job.jobUrl);
    if (url) {
      try {
        const parsed = new URL(url); parsed.hash = '';
        for (const key of [...parsed.searchParams.keys()]) if (/^utm_|^(trk|trackingId|ref|source)$/i.test(key)) parsed.searchParams.delete(key);
        parsed.searchParams.sort(); url = parsed.toString();
      } catch { throw new Error('Open a valid job URL or provide its URL.'); }
    }
    return {jobTitle:text(job.jobTitle),companyName:text(job.companyName),jobDescription:text(job.jobDescription).replace(/\r\n/g,'\n'),jobUrl:url};
  }
  function normalizeCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    // Legacy uploaded profiles included guessed facts. Reparse their original source instead.
    if (String(candidate.id || '').startsWith('uploaded') && !candidate.resume_engine_version && candidate.confirmed_facts?.raw_text) {
      try {return normalizeCandidate({...candidateFromText(candidate.confirmed_facts.raw_text, candidate.confirmed_facts.filename),id:candidate.id});}
      catch {return null;}
    }
    const facts = {...candidate,...(candidate.confirmed_facts || {})};
    const primary = text(facts.primary_skills) || text(candidate.primary_skills);
    const secondary = text(facts.secondary_skills) || text(candidate.secondary_skills);
    const all = Array.isArray(facts.all_skills) && facts.all_skills.length ? facts.all_skills : (Array.isArray(candidate.all_skills) ? candidate.all_skills : []);
    const skills = unique([primary,secondary,...all.map(text)].flatMap(value => value.split(/[,;\n|]+/).map(text)));
    const employment = rows(facts.employment_history).length ? rows(facts.employment_history) : rows(candidate.employment_history);
    const education = rows(facts.education_history).length ? rows(facts.education_history) : rows(candidate.education_history);
    const sourceText = text(facts.source_text) || text(facts.raw_text) || text(candidate.source_text) || text(candidate.raw_text);
    return {
      id:text(candidate.id),version:candidate.version || 0,name:text(facts.full_name) || text(candidate.full_name),
      email:text(facts.email) || text(candidate.email),phone:text(facts.phone) || text(candidate.phone),city:text(facts.current_city) || text(candidate.current_city),state:text(facts.current_state) || text(candidate.current_state),
      linkedin:text(facts.linkedin_url) || text(candidate.linkedin_url),title:text(facts.current_job_title) || text(candidate.current_job_title),years:text(facts.total_experience_years) || text(candidate.total_experience_years),
      summary:text(facts.summary) || text(candidate.summary),skills,employment,education,
      qualification:text(facts.highest_qualification) || text(candidate.highest_qualification),university:text(facts.university_name) || text(candidate.university_name),graduationYear:text(facts.graduation_year) || text(candidate.graduation_year),
      certifications:text(facts.certifications) || text(candidate.certifications),projects:rows(facts.projects).length ? rows(facts.projects) : rows(candidate.projects),sourceText
    };
  }
  function evidenceLines(candidate) {
    const facts = normalizeCandidate(candidate);
    if (!facts) return [];
    return [facts.title,facts.summary,...facts.skills,...facts.employment.flatMap(row => [text(row.title),text(row.employer),text(row.evidence),text(row.description),...(Array.isArray(row.bullets) ? row.bullets.map(text) : [])]),...facts.education.flatMap(row => [text(row.degree),text(row.institution)]),facts.qualification,facts.certifications,...facts.sourceText.split('\n')].filter(Boolean);
  }
  function analyze(candidate, job, actualResumeText) {
    const jd = text(job?.jobDescription), facts = normalizeCandidate(candidate);
    const warnings = ['Estimated coverage of extracted JD requirements, not an employer ATS score or hiring prediction. Review the full JD for requirements this checker may miss.'];
    const result = {score:null,matched:[],missing:[],requirements:[],checks:[],warnings,method:'Weighted extracted requirement coverage; required = 2, preferred = 1. No invented score floor.'};
    if (!jd || !facts || !evidenceLines(candidate).length) return result;
    const evidence = typeof actualResumeText === 'string' ? actualResumeText.split('\n').filter(line => line.trim() && !/^Target role:/i.test(line)) : evidenceLines(candidate);
    const clauses = jd.split(/\n|;|(?<=[.!?])\s+(?=[A-Z])/).map(value => value.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    const add = (label, source, matched, proof, type='skill') => {
      if (result.requirements.some(row => row.label.toLowerCase() === label.toLowerCase())) return;
      const weight = /preferred|nice to have|bonus|desirable/i.test(source) && !/required|must have/i.test(source) ? 1 : 2;
      result.requirements.push({label,source,weight,matched,evidence:matched ? proof : '',type});
    };
    for (const term of unique([...terms,...facts.skills])) {
      if (!hasTerm(jd,term)) continue;
      const clause = clauses.find(line => hasTerm(line,term)) || term;
      if (/\bnot\s+(?:required|needed)|\bno\s+(?:experience\s+)?(?:required|needed)\b/i.test(clause)) continue;
      const proof = evidence.find(line => positiveTerm(line,term));
      add(term,clause,!!proof,proof || '');
    }
    const years = jd.match(/\b(\d{1,2})\+?\s*(?:-|–|to)?\s*\d*\s*years?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience/i);
    if (years) {
      const shownYears = typeof actualResumeText === 'string' ? actualResumeText.match(/\b(\d+)\+?\s+years?\s+(?:of\s+)?(?:total\s+)?experience/i)?.[1] : facts.years;
      add(years[0],years[0],!!shownYears && Number.parseFloat(shownYears) >= Number(years[1]),shownYears ? `${shownYears} years explicitly stated` : '', 'experience');
    }
    // Retain unfamiliar qualifications/responsibilities as checks instead of declaring an unexamined 100%.
    const stop = new Set('a an the and or in on of for to with as at is be have has must required requirement requirements preferred skills experience demonstrate expertise knowledge proficiency ability will you we our your this that from'.split(' '));
    const tokens = value => unique((value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || []).map(word => word.replace(/^\.+|\.+$/g,'')).filter(word => !stop.has(word)));
    for (const clause of clauses) {
      if (!/must|required|qualifications?|responsibilit|degree|bachelor|master|certifi|experience with|expertise|proficien/i.test(clause) || clause.length < 12) continue;
      const keyTokens = tokens(clause);
      const coveredTokens = new Set(result.requirements.filter(row => row.source === clause).flatMap(row => tokens(row.label)));
      if (keyTokens.length && keyTokens.every(token => coveredTokens.has(token))) continue;
      const proof = evidence.find(line => !negated(line) && keyTokens.length >= 2 && keyTokens.filter(word => contains(line,word)).length / keyTokens.length >= 0.85);
      add(clause,clause,!!proof,proof || '', 'qualification');
    }
    const total = result.requirements.reduce((sum,row) => sum + row.weight,0);
    result.score = total ? Math.round(100 * result.requirements.filter(row => row.matched).reduce((sum,row) => sum + row.weight,0) / total) : null;
    result.matched = result.requirements.filter(row => row.matched).map(row => row.label);
    result.missing = result.requirements.filter(row => !row.matched).map(row => row.label);
    if (!total) warnings.push('No reliable requirements were extracted. Paste the complete JD; score unavailable.');
    if (result.requirements.some(row => row.type === 'qualification' && !row.matched)) warnings.push('Some qualifications have no explicit supporting evidence. Review these with the candidate.');
    result.checks = [{label:'Candidate name supplied',passed:!!facts.name},{label:'Contact details supplied',passed:!!(facts.email || facts.phone)},{label:'Experience or source resume supplied',passed:!!(facts.employment.length || facts.sourceText)},{label:'Education supplied',passed:!!(facts.education.length || facts.qualification || /education/i.test(facts.sourceText))},{label:'Generated DOCX uses single-column text and standard headings',passed:typeof actualResumeText === 'string'}];
    return result;
  }
  function scopeKey(candidate, job) {
    return JSON.stringify(stable({engine:VERSION,candidate:normalizeCandidate(candidate),job:jobIdentity(job)}));
  }
  const safeName = value => value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_|_$/g,'').slice(0,60);
function buildResume(candidate, job, rewrittenBullets) {
    const facts = normalizeCandidate(candidate);
    if (!facts?.name || /^(candidate|unknown)$/i.test(facts.name)) throw new Error('Candidate details are missing. Upload a readable resume or select a candidate and supply their name.');
    if (!facts.skills.length && !facts.employment.length && !facts.sourceText && !facts.summary) throw new Error('Candidate professional details are missing. Add reviewed skills, experience or a readable resume.');
    const target = jobIdentity(job || {});
    if (target.jobDescription.length < 40) throw new Error('The job description is missing or incomplete. Open the job posting or paste the full job description.');
    if (!target.jobTitle || /^(software professional|unknown|job opening)$/i.test(target.jobTitle)) throw new Error('The job title is missing. Enter the actual job title.');
    if (!target.companyName || /^(hiring company|target company|unknown)$/i.test(target.companyName)) throw new Error('The company name is missing. Enter the hiring company.');
    const ats = analyze(candidate,target);
    const relevant = facts.skills.filter(skill => hasTerm(target.jobDescription,skill));
    const skills = unique([...relevant,...facts.skills]);
    const topSkills = skills.slice(0, 6).map(s => s.toUpperCase());
    const roleTitle = (target.jobTitle || facts.title || 'SOFTWARE PROFESSIONAL').toUpperCase();
    const subTitle = topSkills.length ? `${roleTitle}  |  ${topSkills.join(' · ')}` : roleTitle;
    const contactParts = [[facts.city, facts.state].filter(Boolean).join(', '), facts.phone, facts.email, facts.linkedin].filter(Boolean);
    const rewrites = rewrittenBullets && typeof rewrittenBullets === 'object' ? rewrittenBullets : {};

    const lines = [
      facts.name.toUpperCase(),
      subTitle,
      contactParts.join('   |   '),
      '',
      `Target role: ${target.jobTitle} at ${target.companyName}`
    ];
    if (facts.summary || facts.title || facts.years || relevant.length) {
      lines.push('','PROFESSIONAL SUMMARY');
      if (facts.summary) lines.push(facts.summary);
      else {
        const summaryRole = facts.title || target.jobTitle;
        const yrsText = facts.years ? `${facts.years}+ years of experience` : 'extensive professional experience';
        const topRelevant = relevant.slice(0, 5).join(', ');
        lines.push(`${summaryRole} with ${yrsText} specializing in ${topRelevant || 'software development'}. Proven track record of delivering high-quality solutions aligned with business objectives. Adept at cross-functional collaboration and continuous improvement.`);
      }
    }
    if (skills.length) {
      lines.push('','TECHNICAL SKILLS');
      const cats = categorizeSkills(skills);
      for (const [catName, catSkills] of cats) {
        lines.push(`| ${catName} | ${catSkills.join(', ')} |`);
      }
    }
    if (facts.employment.length) {
      lines.push('','PROFESSIONAL EXPERIENCE');
      let expIdx = 0;
      for (const row of facts.employment) {
        const title = text(row.title) || text(row.job_title);
        const employer = text(row.employer) || text(row.company);
        const loc = text(row.location) || text(row.city);
        const compLoc = [employer, loc].filter(Boolean).join(', ');
        const roleComp = [title, compLoc].filter(Boolean).join('  —  ');
        const dates = [text(row.start) || text(row.start_date),text(row.end) || text(row.end_date)].filter(Boolean).join(' – ') || text(row.dates);
        lines.push(`| ${roleComp} | ${dates} |`);
        const rawBullets = unique([text(row.evidence),text(row.description),...(Array.isArray(row.bullets) ? row.bullets.map(text) : [])]);
        const relevance = value => relevant.filter(skill => hasTerm(value,skill)).length;
        rawBullets.sort((a,b) => relevance(b)-relevance(a));
        // Apply AI-rewritten bullets when available, falling back to original text.
        const currentIdx = expIdx;
        expIdx++;
        rawBullets.forEach((value, bulletIdx) => {
          const factId = `experience:${currentIdx}:${bulletIdx}`;
          const improved = rewrites[factId];
          lines.push('• ' + (improved || value));
        });
        lines.push('');
      }
    }
    const eduLines = [];
    if (facts.education.length) {
      for (const row of facts.education) {
        const degree = text(row.degree);
        const inst = text(row.institution) || text(row.school);
        const yr = text(row.year) || text(row.end) || text(row.graduation_year);
        const degInst = [degree, inst].filter(Boolean).join(' — ');
        eduLines.push(yr ? `${degInst} | ${yr}` : degInst);
      }
    } else if (facts.qualification) {
      const degInst = [facts.qualification, facts.university].filter(Boolean).join(' — ');
      eduLines.push(facts.graduationYear ? `${degInst} | ${facts.graduationYear}` : degInst);
    }
    if (facts.certifications) {
      eduLines.push(`Certifications: ${facts.certifications}`);
    }
    if (eduLines.length) {
      lines.push('','EDUCATION & CERTIFICATIONS', ...eduLines);
    }
    for (const project of facts.projects) lines.push('','PROJECT',text(project.name),text(project.description),...(Array.isArray(project.bullets) ? project.bullets.map(text) : []));
    if (facts.sourceText && !facts.employment.length) {
      const contact = new Set([facts.name,facts.email,facts.phone,facts.linkedin,[facts.city,facts.state].filter(Boolean).join(', ')].filter(Boolean).map(value => value.toLowerCase()));
      for (const block of sourceSections(facts.sourceText)) {
        const body = block.lines.filter(line => !contact.has(line.trim().replace(/^(?:full[_ ]?name|name|email|phone|linkedin)\s*:\s*/i,'').toLowerCase())).join('\n').trim();
        if (!body) continue;
        const items = body.split(/[,;\n|·•]+/).map(text).filter(Boolean);
        if (/SKILLS$/.test(block.heading) && items.every(item => facts.skills.some(skill => skill.toLowerCase() === item.toLowerCase()))) continue;
        if (/SUMMARY|PROFILE|OBJECTIVE/.test(block.heading) && body === facts.summary) continue;
        lines.push('',block.heading || 'PROFESSIONAL BACKGROUND',body);
      }
    }
    const markdown = lines.filter(line => line !== undefined).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    Object.assign(ats,analyze(candidate,target,markdown));
    return {markdown,filename:`${safeName(facts.name)}_${safeName(target.companyName)}_${safeName(target.jobTitle)}.docx`,matchScore:ats.score,matchedSkills:ats.matched,missingSkills:ats.missing,ats,scopeKey:scopeKey(candidate,target)};
  }
  async function fingerprint(value) {
    const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(stable(value)));
    const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
  }
  function candidateFromText(source, filename = '') {
    const raw = text(source).replace(/\r\n/g,'\n');
    if (raw.length < 30 || /(?:^%PDF|\/FontDescriptor|endstream|\x00)/.test(raw)) throw new Error('Could not read this resume reliably. Upload a text-based PDF, DOCX or TXT, or paste the resume text.');
    const lines = raw.split('\n').map(text).filter(Boolean);
    const nameLines = lines.slice(0,5).map(line => line.replace(/^(?:full[_ ]?name|candidate[_ ]?name|name)\s*:\s*/i,''));
    const name = nameLines.find(line => /^[\p{L}][\p{L} .'-]{2,70}$/u.test(line) && line.split(/\s+/).length >= 2 && line.split(/\s+/).length <= 5 && !/resume|summary|experience|curriculum|engineer|developer|skills|education|accountant/i.test(line)) || '';
    if (!name) throw new Error('Candidate name could not be identified. Paste the resume with the candidate name on its own first line.');
    const email = raw.match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';
    const phone = raw.match(/(?:\+\d{1,3}[ -]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/)?.[0] || '';
    const sections = sourceSections(raw);
    const skillsBlock = sections.filter(block => /SKILLS$/.test(block.heading)).flatMap(block => block.lines).join('\n');
    const summary = sections.find(block => /SUMMARY|PROFILE|OBJECTIVE/.test(block.heading))?.lines.join('\n').trim() || '';
    const labeledSkills = lines.filter(line => /^(?:primary_skills|secondary_skills|skills|technical skills)\s*:/i.test(line)).map(line => line.replace(/^[^:]+:\s*/,''));
    const explicitSkills = [skillsBlock,...labeledSkills].flatMap(value => value.split(/[,;\n|·•]+/).map(value => value.trim())).filter(value => value.length >= 2 && value.length <= 80 && !negated(value) && !/@|https?:|^skills\s*:/i.test(value));
    // Only explicit skill sections become skills; other source mentions stay in context.
    const skills = unique(explicitSkills);
    const years = raw.match(/\b(\d+)\+?\s+years?(?:\s+of)?\s+experience/i)?.[1];
    const linkedin = raw.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i)?.[0] || '';
    const location = lines.slice(0,5).map(line => line.match(/^([\p{L} .'-]+),\s*([A-Z]{2})$/u)).find(Boolean);
    return {id:'uploaded-resume-' + Date.now(),resume_engine_version:VERSION,full_name:name,email,phone,current_city:location?.[1] || '',current_state:location?.[2] || '',full_address:location ? location[0] : '',current_job_title:'',total_experience_years:years ? Number(years) : null,summary,primary_skills:skills.join(', '),secondary_skills:'',all_skills:skills,employment_history:[],education_history:[],linkedin_url:linkedin ? (linkedin.startsWith('http') ? linkedin : 'https://' + linkedin) : '',source_text:raw,confirmed_facts:{raw_text:raw,filename}};
  }
  function resumeDocx(content) {
    const escape = value => String(value || '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');

    const HEADINGS = /^(?:PROFESSIONAL SUMMARY|TECHNICAL SKILLS|SKILLS|CORE SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|EMPLOYMENT(?: HISTORY)?|EDUCATION & CERTIFICATIONS|EDUCATION|CERTIFICATIONS|PROJECTS?|PROJECT|SOURCE RESUME|ADDITIONAL INFORMATION)$/i;
    const rawLines = content.split(/\r?\n/);
    const elements = [];
    let inHeading = '';
    let i = 0;
    let contactDividerRendered = false;

    const tblPr = (w1, w2) =>
      '<w:tblPr><w:tblW w:type="auto" w:w="0"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook w:firstColumn="1" w:firstRow="1" w:lastColumn="0" w:lastRow="0" w:noHBand="0" w:noVBand="1" w:val="04A0"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="' + w1 + '"/><w:gridCol w:w="' + w2 + '"/></w:tblGrid>';

    while (i < rawLines.length) {
      const line = rawLines[i];
      const trimmed = line.trim();
      if (!trimmed) { i++; continue; }

      if (HEADINGS.test(trimmed)) {
        inHeading = trimmed.toUpperCase();
        elements.push('<w:p><w:pPr><w:pStyle w:val="ResumeHeading"/><w:keepNext/><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">' + escape(trimmed) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (i === 0 && !inHeading) {
        elements.push('<w:p><w:pPr><w:spacing w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr><w:t xml:space="preserve">' + escape(trimmed) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (!inHeading && (trimmed.includes(' • ') || (trimmed.includes(' | ') && (trimmed === trimmed.toUpperCase() || trimmed.includes('DEVELOPER') || trimmed.includes('ENGINEER'))))) {
        elements.push('<w:p><w:pPr><w:spacing w:before="0" w:after="20"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="555555"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr><w:t xml:space="preserve">' + escape(trimmed) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (!inHeading && trimmed.includes(' | ') && (trimmed.includes('@') || /\d{3}/.test(trimmed) || trimmed.toLowerCase().includes('linkedin'))) {
        elements.push('<w:p><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">' + escape(trimmed) + '</w:t></w:r></w:p>');
        if (!contactDividerRendered) {
          elements.push('<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="AEB6BF"/></w:pBdr></w:pPr></w:p>');
          contactDividerRendered = true;
        }
        i++;
        continue;
      }

      if (trimmed.startsWith('Target role:')) {
        const roleText = trimmed.replace('Target role:', '').trim();
        elements.push('<w:p><w:pPr><w:spacing w:before="60" w:after="40"/><w:shd w:val="clear" w:color="auto" w:fill="EBF0FF"/><w:ind w:left="120" w:right="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="666666"/></w:rPr><w:t xml:space="preserve">Target role: </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1F3752"/></w:rPr><w:t xml:space="preserve">' + escape(roleText) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const isExpRow = inHeading.includes('EXPERIENCE') || /(?:—|--|\d{4}|present)/i.test(trimmed);
        if (isExpRow) {
          const parts = trimmed.split('|').slice(1, -1).map(s => s.trim());
          const leftText = parts[0] || '';
          const rightText = parts[1] || '';
          let titlePart = leftText;
          let companyPart = '';
          if (leftText.includes(' — ')) {
            const dashIdx = leftText.indexOf(' — ');
            titlePart = leftText.substring(0, dashIdx).trim();
            companyPart = '  —  ' + leftText.substring(dashIdx + 3).trim();
          } else if (leftText.includes(' - ')) {
            const dashIdx = leftText.indexOf(' - ');
            titlePart = leftText.substring(0, dashIdx).trim();
            companyPart = '  —  ' + leftText.substring(dashIdx + 3).trim();
          }
          elements.push('<w:tbl>' + tblPr(6984, 2880) + '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="6984"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">' + escape(titlePart) + '</w:t></w:r>' + (companyPart ? '<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">' + escape(companyPart) + '</w:t></w:r>' : '') + '</w:p></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="2880"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="555555"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">' + escape(rightText) + '</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
          i++;
          continue;
        } else {
          const rows = [];
          while (i < rawLines.length && rawLines[i].trim().startsWith('|') && rawLines[i].trim().endsWith('|')) {
            const rowParts = rawLines[i].trim().split('|').slice(1, -1).map(s => s.trim());
            if (rowParts.length >= 2) rows.push(rowParts);
            i++;
          }
          const trs = rows.map(([category, skills]) =>
            '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="1728"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr><w:t xml:space="preserve">' + escape(category) + '</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="8136"/><w:vAlign w:val="top"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="17"/><w:szCs w:val="17"/><w:color w:val="222222"/></w:rPr><w:t xml:space="preserve">' + escape(skills) + '</w:t></w:r></w:p></w:tc></w:tr>'
          ).join('');
          elements.push('<w:tbl>' + tblPr(1728, 8136) + trs + '</w:tbl>');
          continue;
        }
      }

      if (/^[-•*]\s/.test(trimmed)) {
        const bulletText = trimmed.replace(/^[-•*]\s+/, '');
        elements.push('<w:p><w:pPr><w:spacing w:after="14" w:line="228" w:lineRule="auto"/><w:ind w:left="230" w:hanging="158"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">• ' + escape(bulletText) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (/^Certifications:\s*/i.test(trimmed)) {
        const certsText = trimmed.replace(/^Certifications:\s*/i, '');
        elements.push('<w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">Certifications: </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">' + escape(certsText) + '</w:t></w:r></w:p>');
        i++;
        continue;
      }

      if (inHeading.includes('EDUCATION') && (trimmed.includes(' — ') || trimmed.includes(' - ') || trimmed.includes(' | '))) {
        let degree = trimmed;
        let rest = '';
        if (trimmed.includes(' — ')) {
          const splitIdx = trimmed.indexOf(' — ');
          degree = trimmed.substring(0, splitIdx);
          rest = ' — ' + trimmed.substring(splitIdx + 3);
        } else if (trimmed.includes(' - ')) {
          const splitIdx = trimmed.indexOf(' - ');
          degree = trimmed.substring(0, splitIdx);
          rest = ' - ' + trimmed.substring(splitIdx + 3);
        } else if (trimmed.includes(' | ')) {
          const splitIdx = trimmed.indexOf(' | ');
          degree = trimmed.substring(0, splitIdx);
          rest = ' | ' + trimmed.substring(splitIdx + 3);
        }
        elements.push('<w:p><w:pPr><w:spacing w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">' + escape(degree) + '</w:t></w:r>' + (rest ? '<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">' + escape(rest) + '</w:t></w:r>' : '') + '</w:p>');
        i++;
        continue;
      }

      if (inHeading.includes('EXPERIENCE') && trimmed.includes(' | ') && !trimmed.startsWith('|')) {
        const parts = trimmed.split(' | ');
        elements.push('<w:tbl>' + tblPr(6984, 2880) + '<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="6984"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><w:t xml:space="preserve">' + escape(parts[0]) + '</w:t></w:r>' + (parts[1] ? '<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">  —  ' + escape(parts.slice(1).join(', ')) + '</w:t></w:r>' : '') + '</w:p></w:tc><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="2880"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="right"/></w:pPr></w:p></w:tc></w:tr></w:tbl>');
        i++;
        continue;
      }

      elements.push('<w:p><w:pPr><w:spacing w:after="30" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr><w:t xml:space="preserve">' + escape(trimmed) + '</w:t></w:r></w:p>');
      i++;
    }

    const files = {
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/document.xml':'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + elements.join('') + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="648" w:right="835" w:bottom="648" w:left="835"/></w:sectPr></w:body></w:document>',
      'word/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="333333"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="30" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:customStyle="1" w:styleId="ResumeHeading"><w:name w:val="Resume Heading"/><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display" w:cs="Calibri"/><w:b/><w:color w:val="1F3752"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>'
    };
    const encoder = new TextEncoder(), entries = [], chunks = []; let offset = 0;
    const header = size => new Uint8Array(size);
    const crc32 = bytes => {let crc = -1;for (const byte of bytes) {crc ^= byte;for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));}return (crc ^ -1) >>> 0;};
    for (const [name,body] of Object.entries(files)) {
      const filename = encoder.encode(name), bytes = encoder.encode(body), crc = crc32(bytes), local = header(30+filename.length), view = new DataView(local.buffer);
      view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,filename.length,true);local.set(filename,30);
      entries.push({filename,bytes,crc,offset});chunks.push(local,bytes);offset += local.length+bytes.length;
    }
    const centralStart = offset;
    for (const entry of entries) {
      const central = header(46+entry.filename.length), view = new DataView(central.buffer);
      view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint32(16,entry.crc,true);view.setUint32(20,entry.bytes.length,true);view.setUint32(24,entry.bytes.length,true);view.setUint16(28,entry.filename.length,true);view.setUint32(42,entry.offset,true);central.set(entry.filename,46);chunks.push(central);offset += central.length;
    }
    const end = header(22), view = new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,offset-centralStart,true);view.setUint32(16,centralStart,true);chunks.push(end);
    const result = new Uint8Array(offset+end.length);let pos = 0;for (const chunk of chunks) {result.set(chunk,pos);pos += chunk.length;}return result;
  }
  return {VERSION,normalizeCandidate,analyze,buildResume,fingerprint,scopeKey,jobIdentity,candidateFromText,resumeDocx,categorizeSkills};
});
