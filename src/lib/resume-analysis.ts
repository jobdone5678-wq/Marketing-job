export function categorizeSkills(skills: string[]): [string, string[]][] {
  const categories = [
    { name: 'Frontend', re: /\b(react|angular|vue|next\.?js|nuxt|svelte|html5?|css3?|javascript|typescript|tailwind|bootstrap|redux|webpack|vite|ui\b|frontend)\b/i },
    { name: 'Backend', re: /\b(java\b|spring|spring boot|microservices|rest\b|restful|apis?|python|node\.?js|express|c#|\.net|asp\.net|go\b|golang|ruby|rails|php|laravel|django|flask|fastapi|c\+\+|graphql|grpc|backend)\b/i },
    { name: 'Data & Messaging', re: /\b(sql|postgres|postgresql|mysql|redis|kafka|mongodb|dynamodb|oracle|snowflake|spark|cassandra|rabbitmq|elasticsearch|sqlite|database|data pipeline|etl)\b/i },
    { name: 'Cloud & DevOps', re: /\b(aws|amazon web services|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|jenkins|ci\/cd|linux|unix|ansible|git\b|github actions|helm|cloudformation)\b/i },
    { name: 'Tools', re: /\b(git|maven|gradle|postman|jira|agile|scrum|kanban|unit testing|integration testing|jest|junit|selenium|cypress|pytest|testing)\b/i },
    { name: 'Marketing & Analytics', re: /\b(seo|sem|google analytics|marketing|copywriting|hubspot|google ads|meta ads|social media|content)\b/i },
    { name: 'Finance & Accounting', re: /\b(excel|quickbooks|financial|accounting|reconciliation|accounts payable|accounts receivable|payroll|bookkeeping|sap)\b/i }
  ];
  const assigned = new Map<string, string[]>();
  const unassigned: string[] = [];
  for (const skill of skills) {
    let matched = false;
    for (const cat of categories) {
      if (cat.re.test(skill)) {
        if (!assigned.has(cat.name)) assigned.set(cat.name, []);
        assigned.get(cat.name)!.push(skill);
        matched = true;
        break;
      }
    }
    if (!matched) unassigned.push(skill);
  }
  const result: [string, string[]][] = [];
  for (const [name, list] of assigned.entries()) {
    result.push([name, list]);
  }
  if (unassigned.length) {
    result.push(['Other Technical Skills', unassigned]);
  }
  return result;
}

export function analyze(
  candidate: any,
  job: { jobTitle?: string; companyName?: string; jobDescription?: string },
  actualResumeText?: string
) {
  const jd = String(job?.jobDescription || '').toLowerCase();
  const text = (actualResumeText || '').toLowerCase();
  
  const rawSkills: string[] = Array.isArray(candidate?.skills)
    ? candidate.skills
    : String(candidate?.primary_skills || '').split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const skill of rawSkills) {
    const s = skill.toLowerCase();
    if (jd.includes(s)) {
      if (text.includes(s)) {
        matched.push(skill);
      } else {
        missing.push(skill);
      }
    }
  }

  const score = rawSkills.length > 0
    ? Math.round((matched.length / Math.max(1, matched.length + missing.length)) * 100)
    : 75;

  return {
    score,
    matched,
    missing,
    requirements: matched.map(m => ({ label: m, matched: true, weight: 2 }))
      .concat(missing.map(m => ({ label: m, matched: false, weight: 2 }))),
    checks: [],
    warnings: ['Estimated coverage of extracted requirements. Review full job description.'],
    method: 'Weighted requirement coverage'
  };
}
