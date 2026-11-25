import { upsertUserProfile } from '../identity/userprofile';
import {
  extractStructuredResume,
  normalizeContactsInput,
} from '../candidate/resumeextract';
import { importResumeToExperienceBank } from '../candidate/experience';
import { upsertMergedScreeningAnswers } from '../ingest/screeninganswers';
import { database } from '../db/admin';

/**
 * Best-effort synchronization from legacy /api/jobseeker/resume saves into the
 * Freehire-aligned tables (user_profiles, profiles, experience_*, screening_answers).
 */
export async function syncLegacyResumeSaveToV1Tables(
  userId: string,
  body: Record<string, any>
): Promise<void> {
  try {
    const db = database();

    // 1. Contacts & Structured CV on public.profiles
    const rawLinks = Array.isArray(body.contacts?.links)
      ? body.contacts.links.filter(
          (l: unknown): l is string => typeof l === 'string' && /^https?:\/\//i.test(l)
        )
      : [];
    const contacts = normalizeContactsInput({
      full_name: String(body.fullName || body.contacts?.fullName || body.full_name || '').slice(0, 200),
      email: String(body.email || body.contacts?.email || '').slice(0, 320),
      phone: String(body.phone || body.contacts?.phone || '').slice(0, 64),
      location: String(body.contacts?.location || body.location?.whereBased || '').slice(0, 200),
      links: rawLinks.slice(0, 20),
    });

    const rawText = String(body.raw_text || body.source_text || '');
    const extracted = rawText.length >= 20 ? extractStructuredResume(rawText) : null;

    await db
      .from('profiles')
      .update({
        candidate_contacts: contacts,
        contacts,
        ...(extracted
          ? {
              resume_structured: extracted.resume_structured,
              resume_countries: extracted.derived_location.countries,
              resume_regions: extracted.derived_location.regions,
              resume_cities: extracted.derived_location.cities,
              resume_extract_status: 'ok',
            }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // 2. Search Preferences & Location (user_profiles)
    const rawRoles: string[] = Array.isArray(body.roles) ? body.roles : [];
    const rawSkills: string[] = Array.isArray(body.skills)
      ? body.skills
      : typeof body.skills === 'string'
        ? body.skills.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean)
        : [];

    if (rawRoles.length > 0 || rawSkills.length > 0) {
      const workFormats: string[] = Array.isArray(body.location?.workFormat)
        ? body.location.workFormat
        : [];
      const workModes = workFormats
        .map((m) => m.toLowerCase().replace(/[\s-]+/g, ''))
        .filter((m) => m === 'remote' || m === 'hybrid' || m === 'onsite');

      await upsertUserProfile(
        userId,
        {
          specializations: rawRoles.slice(0, 10),
          skills: rawSkills.slice(0, 200),
          seniorities: Array.isArray(body.seniorities) ? body.seniorities : [],
          excluded_skills: Array.isArray(body.excludedSkills) ? body.excludedSkills : [],
          excluded_sources: Array.isArray(body.excludedSources) ? body.excludedSources : [],
          job_languages: Array.isArray(body.jobLanguages) ? body.jobLanguages : [],
          location_preferences: {
            work_modes: workModes,
            remote: {
              regions: Array.isArray(body.location?.regions) ? body.location.regions : [],
              countries: Array.isArray(body.location?.countries) ? body.location.countries : [],
            },
            base: {
              country:
                typeof body.country === 'string' && body.country.trim().length === 2
                  ? body.country.trim().toLowerCase()
                  : null,
              city: typeof body.location?.whereBased === 'string' ? body.location.whereBased : null,
            },
            relocation: {
              open: Boolean(body.location?.openToRelocation),
              regions: [],
              countries: [],
              cities: [],
            },
          },
        },
        db
      );
    }

    // 3. Experience Bank import from structured CV
    if (extracted) {
      await importResumeToExperienceBank(userId, extracted.resume_structured, db);
    }

    // 4. Typed Screening Answers (non-EEO)
    const sa = body.screeningAnswers;
    if (sa && typeof sa === 'object') {
      const patch: Record<string, unknown> = {};
      if (Array.isArray(sa.authorized_countries)) {
        patch.authorized_countries = sa.authorized_countries;
      }
      if (sa.visa_sponsorship_needed === 'yes' || sa.visa_sponsorship_needed === true) {
        patch.visa_sponsorship_needed = true;
      } else if (sa.visa_sponsorship_needed === 'no' || sa.visa_sponsorship_needed === false) {
        patch.visa_sponsorship_needed = false;
      }

      if (sa.willing_to_relocate === 'yes' || sa.willing_to_relocate === true) {
        patch.willing_to_relocate = true;
      } else if (sa.willing_to_relocate === 'no' || sa.willing_to_relocate === false) {
        patch.willing_to_relocate = false;
      }

      if (sa.age_18_or_older === 'yes' || sa.age_18_or_older === true) {
        patch.age_18_or_older = true;
      } else if (sa.age_18_or_older === 'no' || sa.age_18_or_older === false) {
        patch.age_18_or_older = false;
      }

      if (typeof sa.privacy_consent === 'boolean') {
        patch.privacy_consent = sa.privacy_consent;
      }

      if (sa.notice_period_days !== undefined && sa.notice_period_days !== '') {
        const days = Number(sa.notice_period_days);
        if (Number.isInteger(days) && days >= 0) patch.notice_period_days = days;
      }

      const salAmt = Number(sa.desired_salary_amount);
      const salCur =
        typeof sa.desired_salary_currency === 'string' ? sa.desired_salary_currency.trim() : '';
      const salPer =
        typeof sa.desired_salary_period === 'string' ? sa.desired_salary_period.trim() : '';
      if (Number.isInteger(salAmt) && salAmt > 0) patch.desired_salary_amount = salAmt;
      if (/^[A-Za-z]{3}$/.test(salCur)) patch.desired_salary_currency = salCur.toUpperCase();
      if (['year', 'month', 'day', 'hour'].includes(salPer)) patch.desired_salary_period = salPer;

      if (Object.keys(patch).length > 0) {
        await upsertMergedScreeningAnswers(userId, patch, db);
      }
    }
  } catch {
    // Non-fatal sync so legacy endpoint and unit mocks remain unaffected
  }
}
