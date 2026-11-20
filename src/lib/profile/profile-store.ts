'use client';

import type { CandidateProfileState, ScreeningAnswers } from './types';

export const DEFAULT_SCREENING_ANSWERS: ScreeningAnswers = {
  authorized_countries: [],
  visa_sponsorship_needed: '',
  willing_to_relocate: '',
  age_18_or_older: '',
  privacy_consent: '',
  notice_period_days: '',
  desired_salary_amount: '',
  desired_salary_currency: 'USD',
  desired_salary_period: '',
  country_specific_answers: {},
};

export const DEFAULT_PROFILE: CandidateProfileState = {
  photoUrl: null,
  cv: null,
  roles: [],
  seniorities: [],
  jobLanguages: [],
  contacts: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    links: [],
  },
  location: {
    workFormat: [],
    whereBased: '',
    timezone: 'UTC',
  },
  skills: [],
  excludedSkills: [],
  excludedSources: [],
  excludedCompanies: [],
  workHistory: [],
  projects: [],
  education: [],
  languages: [],
  certifications: [],
  screeningAnswers: DEFAULT_SCREENING_ANSWERS,
};

const STORAGE_KEY = 'freehire_candidate_profile_v2';

export function clearLocalProfile(): CandidateProfileState {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('freehire_candidate_profile_v1');
  }
  return DEFAULT_PROFILE;
}

export async function clearRemoteProfile(): Promise<boolean> {
  clearLocalProfile();
  try {
    const res = await fetch('/api/jobseeker/resume', {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) window.postMessage({ type: 'NEXTKIN_PROFILE_SAVED' }, window.location.origin);
    return res.ok;
  } catch (err) {
    console.error('clearRemoteProfile error:', err);
    return false;
  }
}

export function loadLocalProfile(): CandidateProfileState {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('freehire_candidate_profile_v1');
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    // Fields should only be filled or selected after the resume is parsed!
    if (!parsed.cv || !parsed.cv.filename) {
      return DEFAULT_PROFILE;
    }
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      seniorities: Array.isArray(parsed.seniorities) ? parsed.seniorities : [],
      jobLanguages: Array.isArray(parsed.jobLanguages) ? parsed.jobLanguages : [],
      contacts: {
        ...DEFAULT_PROFILE.contacts,
        ...(parsed.contacts || {}),
        links: Array.isArray(parsed.contacts?.links)
          ? parsed.contacts.links
          : [parsed.contacts?.linkedin, parsed.contacts?.github, parsed.contacts?.portfolio].filter(Boolean),
      },
      location: {
        ...DEFAULT_PROFILE.location,
        ...(parsed.location || {}),
        workFormat: Array.isArray(parsed.location?.workFormat)
          ? parsed.location.workFormat
          : Array.isArray(parsed.location?.workMode)
          ? parsed.location.workMode.map((m: string) => m.charAt(0).toUpperCase() + m.slice(1))
          : [],
        whereBased: parsed.location?.whereBased || parsed.location?.city || '',
      },
      languages: Array.isArray(parsed.languages) ? parsed.languages : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      screeningAnswers: {
        ...DEFAULT_SCREENING_ANSWERS,
        ...(parsed.screeningAnswers || {}),
        country_specific_answers: {
          ...(DEFAULT_SCREENING_ANSWERS.country_specific_answers || {}),
          ...(parsed.screeningAnswers?.country_specific_answers || {}),
        },
      },
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveLocalProfile(profile: CandidateProfileState) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

export async function fetchRemoteProfile(): Promise<CandidateProfileState | null> {
  try {
    const res = await fetch('/api/jobseeker/resume', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.candidate) return null;

    const c = data.candidate;
    const facts = (c.confirmed_facts || {}) as Record<string, any>;
    const hasParsedResume = Boolean(
      facts.has_parsed_resume === true ||
      (facts.filename && facts.raw_text && String(facts.raw_text).length > 20)
    );

    // Fields should only be filled or selected after the resume is parsed!
    if (!hasParsedResume) {
      return DEFAULT_PROFILE;
    }

    const stored: CandidateProfileState = {
      photoUrl: facts.photoUrl || null,
      cv: {
        filename: facts.filename,
        uploadedAt: facts.uploadedAt || c.created_at || null,
        rawText: facts.raw_text || '',
        sizeFormatted: facts.sizeFormatted || '1.8 MB',
        atsReadable: true,
        yearsExperience: Number(c.total_experience_years || 0),
      },
      roles: Array.isArray(facts.roles) ? facts.roles : [],
      seniorities: Array.isArray(facts.seniorities) ? facts.seniorities : [],
      jobLanguages: Array.isArray(facts.jobLanguages) ? facts.jobLanguages : [],
      contacts: {
        fullName: facts.contacts?.fullName || c.full_name || '',
        email: facts.contacts?.email || c.email || '',
        phone: facts.contacts?.phone || c.phone || '',
        location: facts.contacts?.location || c.full_address || '',
        links: Array.isArray(facts.contacts?.links)
          ? facts.contacts.links
          : [c.linkedin_url].filter(Boolean),
      },
      location: {
        workFormat: Array.isArray(facts.location?.workFormat)
          ? facts.location.workFormat
          : c.preferred_work_type
          ? [c.preferred_work_type]
          : [],
        whereBased: facts.location?.whereBased || c.current_city || '',
        timezone: facts.location?.timezone || 'UTC',
      },
      skills: c.primary_skills
        ? c.primary_skills.split(/,\s*/).map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(facts.skills)
        ? facts.skills
        : [],
      excludedSkills: Array.isArray(facts.excludedSkills) ? facts.excludedSkills : [],
      excludedSources: Array.isArray(facts.excludedSources) ? facts.excludedSources : [],
      excludedCompanies: Array.isArray(facts.excludedCompanies) ? facts.excludedCompanies : [],
      workHistory: Array.isArray(c.employment_history) && c.employment_history.length > 0
        ? c.employment_history.map((e: any, idx: number) => ({
            id: e.id || String(idx),
            company: e.employer || e.company || '',
            role: e.title || e.role || '',
            location: e.location || '',
            start: e.start || '',
            end: e.end || '',
            current: !e.end,
            achievements: Array.isArray(e.achievements) ? e.achievements : [e.evidence || ''].filter(Boolean),
          }))
        : Array.isArray(facts.workHistory)
        ? facts.workHistory
        : [],
      projects: Array.isArray(facts.projects) ? facts.projects : [],
      education: Array.isArray(c.education_history) && c.education_history.length > 0
        ? c.education_history.map((ed: any, idx: number) => ({
            id: ed.id || String(idx),
            degree: ed.degree || '',
            institution: ed.institution || '',
            year: ed.end || ed.start || '',
            yearOnly: true,
          }))
        : Array.isArray(facts.education)
        ? facts.education
        : [],
      languages: Array.isArray(facts.languages) ? facts.languages : Array.isArray(c.languages) ? c.languages : [],
      certifications: Array.isArray(facts.certifications) ? facts.certifications : [],
      screeningAnswers: {
        ...DEFAULT_SCREENING_ANSWERS,
        ...(facts.screeningAnswers || {}),
        visa_sponsorship_needed:
          c.need_sponsorship_now === true
            ? 'yes'
            : c.need_sponsorship_now === false
            ? 'no'
            : facts.screeningAnswers?.visa_sponsorship_needed || '',
        willing_to_relocate:
          c.open_to_relocation === true
            ? 'yes'
            : c.open_to_relocation === false
            ? 'no'
            : facts.screeningAnswers?.willing_to_relocate || '',
        authorized_countries: Array.isArray(facts.screeningAnswers?.authorized_countries)
          ? facts.screeningAnswers.authorized_countries
          : c.authorized_in_usa
          ? ['us']
          : [],
        notice_period_days: c.notice_period || facts.screeningAnswers?.notice_period_days || '',
        desired_salary_amount: c.expected_salary || facts.screeningAnswers?.desired_salary_amount || '',
      },
    };

    saveLocalProfile(stored);
    return stored;
  } catch (err) {
    console.error('fetchRemoteProfile error:', err);
    return null;
  }
}

export async function persistProfileToServer(profile: CandidateProfileState): Promise<boolean> {
  saveLocalProfile(profile);
  // Only persist to server if a resume has been uploaded/parsed or explicit edits made
  const hasContent = !!(
    (profile.cv && profile.cv.filename) ||
    profile.roles.length > 0 ||
    profile.skills.length > 0 ||
    profile.contacts.fullName
  );
  if (!hasContent) {
    return true;
  }
  try {
    const payload = {
      fullName: profile.contacts.fullName || null,
      email: profile.contacts.email || null,
      phone: profile.contacts.phone || null,
      skills: profile.skills,
      filename: profile.cv?.filename || null,
      raw_text: profile.cv?.rawText || null,
      has_parsed_resume: !!(profile.cv && profile.cv.filename && profile.cv.rawText),
      photoUrl: profile.photoUrl,
      roles: profile.roles,
      seniorities: profile.seniorities,
      jobLanguages: profile.jobLanguages,
      contacts: profile.contacts,
      location: profile.location,
      excludedSkills: profile.excludedSkills,
      excludedSources: profile.excludedSources,
      excludedCompanies: profile.excludedCompanies,
      workHistory: profile.workHistory,
      projects: profile.projects,
      education: profile.education,
      languages: profile.languages,
      certifications: profile.certifications,
      screeningAnswers: profile.screeningAnswers,
    };

    const res = await fetch('/api/jobseeker/resume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (res.ok) window.postMessage({ type: 'NEXTKIN_PROFILE_SAVED' }, window.location.origin);
    return res.ok;
  } catch (err) {
    console.error('persistProfileToServer error:', err);
    return false;
  }
}
