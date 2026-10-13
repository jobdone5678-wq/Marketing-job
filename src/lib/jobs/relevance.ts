/** Explainable discovery ranking, not a qualification or eligibility assessment. */
export interface ResumeJobProfile {
  provenance_status?: string;
  primary_skills?: string | null;
  secondary_skills?: string | null;
  current_job_title?: string | null;
  target_job_titles?: string | null;
}
const aliases: Record<string, string[]> = {
  go: ['golang', 'go programming', 'go developer', 'go engineer'],
  javascript: ['javascript', 'js'], typescript: ['typescript', 'ts'],
  'node.js': ['node.js', 'nodejs'], 'react.js': ['react.js', 'reactjs', 'react'],
  'apache airflow': ['apache airflow', 'airflow'],
};
const normalize = (text: string) => text.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
function contains(text: string, term: string) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?=$|[^a-z0-9+#])`, 'i').test(text);
}
function terms(value?: string | null) {
  return (value || '').split(/[,;\n|]+/).map(term => term.trim()).filter(term => term.length >= 2).slice(0, 100);
}
export function rankResumeJobs<T extends { title: string; description?: string | null; state?: string; closes_at?: string | null }>(jobs: T[], candidate: ResumeJobProfile) {
  if (candidate.provenance_status !== 'confirmed') return [];
  const skills = [...new Map([...terms(candidate.primary_skills), ...terms(candidate.secondary_skills)].map(skill => [normalize(skill), skill])).values()];
  const roles = [...terms(candidate.target_job_titles), ...terms(candidate.current_job_title)].map(role => ({
    label: role,
    term: normalize(role).replace(/\b(?:senior|junior|sr|jr|lead|principal|staff)\b/g, '').replace(/\s+/g, ' ').trim(),
  })).filter(role => role.term.length > 3 && !/^(?:engineer|developer|manager|specialist|consultant)$/.test(role.term));
  const now = Date.now();
  return jobs.filter(job => job.state !== 'closed' && (!job.closes_at || !(Date.parse(job.closes_at) <= now))).map(job => {
    const title = normalize(job.title);
    const description = normalize((job.description || '').replace(/<[^>]*>/g, ' '));
    const matchedSkills = skills.filter(skill => (aliases[normalize(skill)] || [skill]).some(term => contains(title, term) || contains(description, term)));
    const titleSkills = matchedSkills.filter(skill => (aliases[normalize(skill)] || [skill]).some(term => contains(title, term)));
    const matchedRoles = roles.filter(role => contains(title, role.term));
    const related = matchedRoles.length > 0 || titleSkills.length > 0 || matchedSkills.length >= 2;
    const match_reasons: string[] = [];
    if (matchedRoles.length) match_reasons.push(`Role: ${[...new Set(matchedRoles.map(role => role.label))].join(', ')}`);
    if (matchedSkills.length) match_reasons.push(`Skills: ${matchedSkills.join(', ')}`);
    return { ...job, relevance_score: related ? matchedRoles.length * 10 + titleSkills.length * 5 + matchedSkills.length * 2 : 0, match_reasons };
  }).filter(job => job.relevance_score > 0).sort((a, b) => b.relevance_score - a.relevance_score || a.title.localeCompare(b.title));
}
