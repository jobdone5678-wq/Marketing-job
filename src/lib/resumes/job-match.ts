import { analyze } from '@/lib/tailored-resumes/resume-engine.js';

const sectionStart = /^(?:(?:job |minimum |basic |required |preferred |desired )?(?:requirements|qualifications|skills)|(?:key )?responsibilities|what (?:you(?:'|’)ll (?:do|bring)|we(?:'|’)re looking for)|nice to have|must haves?)\s*:?$/i;
const sectionEnd = /^(?:about (?:us|the company|the role)|benefits|what we offer|why (?:join|work with) us|compensation|how to apply|equal opportunity|perks)\b[^.!?]{0,65}:?$/i;
const qualification = /\b(?:must|required|preferred|experience (?:with|in)|expertise|proficien\w*|degree|bachelor|master|certifi\w*|ability to)\b/i;
const preferred = /\b(?:preferred|nice to have|desired|bonus|a plus)\b/i;
const optional = /\b(?:not (?:required|necessary|needed)|no experience required)\b/i;
const negative = /\b(?:no (?:prior )?experience|not (?:experienced|proficient|certified)|unfamiliar|never (?:used|worked)|without (?:experience|knowledge))\b/i;
const yearsPattern = /\b(\d{1,2})\+?\s*(?:[-–]\s*\d{1,2}\s*)?\s*years?\b/i;
const split = /\n|;|(?<=[.!?])\s+(?=[A-Z])/;
const stop = new Set('a an the and or in on of for to with as at is be by have has must required requirement preferred experience demonstrate expertise knowledge proficiency ability will you we our your this that from strong working hands years work professional proven excellent good skills using including role degree'.split(' '));
const tokens = (value: string) => [...new Set((value.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
  .map(word => word.replace(/[.]+$/, '')).filter(word => !stop.has(word)))];

type Point = { requirement: string; evidence: string | null; weight: number };
const aspiration = /^(?:(?:i am |currently )?(?:learning|studying|aspiring|interested in learning)\b|target role:)/i;

export function compareResumeToJob(resumeText: string, jobDescription: string) {
  const report = analyze({ source_text: resumeText }, { jobDescription }, resumeText);
  const skillRows = report.requirements.filter(row => row.type === 'skill');
  const resumeLines = resumeText.split(split).map(line => ({
    text: line.trim(),
    words: new Set(tokens(line)),
    years: Number(line.match(yearsPattern)?.[1] || 0),
  })).filter(line => line.text && !negative.test(line.text) && !aspiration.test(line.text));
  const points: Point[] = [];
  const seen = new Set<string>();
  let section = '';

  for (const raw of jobDescription.split(split)) {
    const requirement = raw.replace(/^\s*(?:[-•*▪]|\d+[.)](?=\s))\s*/, '').trim();
    if (sectionStart.test(requirement)) { section = requirement; continue; }
    if (sectionEnd.test(requirement)) { section = ''; continue; }
    const key = requirement.toLowerCase().replace(/\s+/g, ' ');
    if (requirement.length < 15 || requirement.length > 600 || seen.has(key) || optional.test(requirement) ||
      (!section && !qualification.test(requirement) && !yearsPattern.test(requirement))) continue;
    const skillTokens = new Set(skillRows.filter(row => row.source === requirement).flatMap(row => tokens(row.label)));
    const terms = tokens(requirement);
    const years = Number(requirement.match(yearsPattern)?.[1] || 0);
    if (!terms.length && !years) continue;
    if (!years && skillTokens.size && terms.every(word => skillTokens.has(word))) continue;
    seen.add(key);
    const evidence = resumeLines.find(line => line.years >= years && terms.every(word => line.words.has(word)));
    points.push({ requirement, evidence: evidence?.text.slice(0, 320) || null, weight: preferred.test(requirement + ' ' + section) ? 1 : 2 });
    if (points.length >= 30) break;
  }

  const total = skillRows.reduce((sum, row) => sum + row.weight, 0) + points.reduce((sum, point) => sum + point.weight, 0);
  const matchedWeight = skillRows.reduce((sum, row) => sum + (row.matched ? row.weight : 0), 0) +
    points.reduce((sum, point) => sum + (point.evidence ? point.weight : 0), 0);
  return {
    score: total ? Math.round(100 * matchedWeight / total) : null,
    matched: skillRows.filter(row => row.matched).map(row => row.label),
    missing: skillRows.filter(row => !row.matched).map(row => row.label),
    matchedPoints: points.filter(point => point.evidence).slice(0, 8).map(({ requirement, evidence }) => ({ requirement, evidence })),
    unmatchedPoints: points.filter(point => !point.evidence).slice(0, 8).map(point => point.requirement),
  };
}
