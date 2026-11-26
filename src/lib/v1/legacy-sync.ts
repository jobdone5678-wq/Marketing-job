import { upsertUserProfile } from '../identity/userprofile';
import {
  extractStructuredResume,
  normalizeContactsInput,
} from '../candidate/resumeextract';
import { importResumeToExperienceBank } from '../candidate/experience';
import { legacyScreeningPatch, upsertMergedScreeningAnswers } from '../ingest/screeninganswers';
import { database } from '../db/admin';

/**
 * Synchronizes reviewed screening on legacy resume saves and refreshes the
 * contact, search preference, and experience stores.
 */
export async function syncLegacyResumeSaveToV1Tables(
  userId: string,
  body: Record<string, any>,
  confirmedScreeningPatch: unknown,
  confirmedLegacy: unknown,
): Promise<void> {
  const db = database();
  // Keep screening independent of resume extraction and experience import.
  const patch = legacyScreeningPatch(confirmedScreeningPatch, true);
  if (Object.keys(patch).length) {
    await upsertMergedScreeningAnswers(userId, patch, db, confirmedLegacy);
  }

  let extracted: ReturnType<typeof extractStructuredResume> | null = null;
  try {
    const rawText = String(body.raw_text || body.source_text || '');
    if (rawText.length >= 20) extracted = extractStructuredResume(rawText);

    // Contacts & Structured CV on public.profiles
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

    // Search preferences and location (user_profiles)
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
  } catch {
    console.warn('Could not sync candidate contacts and search preferences.');
  }

  if (extracted) {
    try {
      await importResumeToExperienceBank(userId, extracted.resume_structured, db);
    } catch {
      console.warn('Could not import the confirmed resume into the experience bank.');
    }
  }
}
