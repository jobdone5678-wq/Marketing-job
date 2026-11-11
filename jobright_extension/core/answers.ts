import type { Work } from '../types';

export function describeJob(w: Work): string {
  if (w.description) return w.description;
  if (w.bullets && w.bullets.length) return w.bullets.join('\n');
  if (w.highlights && w.highlights.length) return w.highlights.join('\n');
  return '';
}

export function degreeAlts(degree: string, degreeShort?: string): string[] {
  const alts = new Set<string>();
  if (degree) alts.add(degree);
  if (degreeShort) alts.add(degreeShort);
  const d = (degree || '').toLowerCase();
  if (d.includes('bachelor') || d.includes('bs') || d.includes('ba')) {
    alts.add('Bachelor');
    alts.add("Bachelor's");
    alts.add("Bachelor's Degree");
    alts.add('BA');
    alts.add('BS');
  }
  if (d.includes('master') || d.includes('ms') || d.includes('ma')) {
    alts.add('Master');
    alts.add("Master's");
    alts.add("Master's Degree");
    alts.add('MA');
    alts.add('MS');
  }
  if (d.includes('doctor') || d.includes('phd')) {
    alts.add('Doctorate');
    alts.add('PhD');
  }
  if (d.includes('associate')) {
    alts.add('Associate');
    alts.add("Associate's Degree");
    alts.add('AA');
    alts.add('AS');
  }
  return Array.from(alts);
}

