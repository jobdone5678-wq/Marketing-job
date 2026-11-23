import { extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies as getNextCookies } from 'next/headers';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

async function getAuthenticatedUserId(request: Request): Promise<{ id: string; role: string }> {
  // 1. Try Extension Bearer token
  try {
    const profile = await extensionProfile(request);
    if (profile && profile.id) {
      return { id: profile.id, role: profile.role };
    }
  } catch {}

  // 2. Try Supabase Cookie Session
  const nextCookieStore = await getNextCookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return nextCookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await database()
      .from('profiles')
      .select('id, role, status')
      .eq('id', user.id)
      .maybeSingle();

    return {
      id: user.id,
      role: profile?.role || 'candidate',
    };
  }

  throw new CaptureError('Unauthorized. Please sign in to save your resume.', 401);
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserId(request);
    const body = await request.json();

    const filename = body.filename ? String(body.filename) : null;
    const raw_text = String(body.raw_text || body.source_text || '');
    const fullName = String(body.fullName || body.contacts?.fullName || body.full_name || 'Applicant').trim();
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
    const email = String(body.email || body.contacts?.email || '').trim();
    const phone = String(body.phone || body.contacts?.phone || '').trim();
    const skills = Array.isArray(body.skills) ? body.skills.join(', ') : String(body.skills || '');
    const has_parsed_resume = Boolean(body.has_parsed_resume || (filename && raw_text.length > 20));

    // Contacts & Location
    const locationStr = String(body.contacts?.location || body.location?.whereBased || '').trim();
    let currentCity = body.current_city || null;
    let currentState = body.current_state || null;
    if (locationStr && (!currentCity || !currentState)) {
      const locParts = locationStr.split(/,\s*/);
      if (locParts.length >= 2) {
        currentCity = locParts[0].trim();
        currentState = locParts[1].trim();
      } else if (!currentCity) {
        currentCity = locationStr;
      }
    }

    // Links (LinkedIn, GitHub, Portfolio)
    let linkedinUrl = body.linkedin_url || null;
    let githubUrl = body.github_url || null;
    let website = body.website || null;
    const rawLinks: unknown[] = Array.isArray(body.contacts?.links) ? body.contacts.links : [];
    for (const l of rawLinks) {
      if (typeof l === 'string') {
        if (l.includes('linkedin.com')) linkedinUrl = l;
        else if (l.includes('github.com')) githubUrl = l;
        else if (!website) website = l;
      }
    }

    // Work history & Current Title / Employer
    const workHistory = Array.isArray(body.workHistory) ? body.workHistory : [];
    const currentEmployer = body.current_employer || workHistory[0]?.company || null;
    const currentJobTitle = body.current_job_title || workHistory[0]?.role || null;

    // Education
    const education = Array.isArray(body.education) ? body.education : [];
    const highestEducation = body.highest_qualification || education[0]?.degree || null;
    const universityName = body.university_name || education[0]?.institution || null;
    const graduationYear = body.graduation_year || education[0]?.year || null;

    // Screening answers
    const screening = (body.screeningAnswers || {}) as Record<string, any>;
    const countryAnswers = screening.country_specific_answers || {};
    const usAuthorization = String(countryAnswers.us_auth || '').toLowerCase();
    const authorizedInUsa = usAuthorization === 'yes' ? true : usAuthorization === 'no' ? false
      : body.authorized_in_usa ?? null;
    const sponsorshipAnswer = String(countryAnswers.us_sponsorship || screening.visa_sponsorship_needed || '').toLowerCase();
    const needsSponsorship = sponsorshipAnswer === 'yes'
      ? true
      : sponsorshipAnswer === 'no'
      ? false
      : body.need_sponsorship_now ?? null;
    const locationObj = (body.location || {}) as Record<string, any>;
    const openToRelocation = locationObj.openToRelocation !== undefined
      ? Boolean(locationObj.openToRelocation)
      : screening.willing_to_relocate === 'yes'
      ? true
      : screening.willing_to_relocate === 'no'
      ? false
      : body.open_to_relocation ?? null;
    const noticePeriod = screening.notice_period_days || body.notice_period || null;
    const expectedSalary = screening.desired_salary_amount || body.expected_salary || null;

    // Demographics (from Tab 1 Demographics card or legacy screening country_specific_answers)
    const demographics = (body.demographics || {}) as Record<string, any>;
    const usAnswers = (countryAnswers.us || {}) as Record<string, any>;
    const gender = demographics.gender || usAnswers.gender || body.gender || null;
    const race = demographics.raceEthnicity || usAnswers.race_ethnicity || body.race || body.race_ethnicity || null;
    const veteran = countryAnswers.us_veteran === 'Not stated' ? null
      : demographics.veteranStatus || countryAnswers.us_veteran || usAnswers.veteran_status || body.veteran || body.veteran_status || null;
    const disability = countryAnswers.us_disability === 'Not stated' ? null
      : demographics.disabilityStatus || countryAnswers.us_disability || usAnswers.disability_status || body.disability || body.disability_status || null;

    // Check if candidate record already exists for this user
    const { data: existingCandidate } = await database()
      .from('candidates')
      .select('id, version, confirmed_facts')
      .eq('user_id', user.id)
      .maybeSingle();

    const mergedFacts = {
      ...((existingCandidate?.confirmed_facts || {}) as Record<string, unknown>),
      raw_text,
      filename,
      has_parsed_resume,
      headline: body.headline || null,
      summary: body.summary || null,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      current_city: currentCity,
      current_state: currentState,
      full_address: locationStr,
      country: body.country || null,
      linkedin_url: linkedinUrl,
      github_url: githubUrl,
      website: website,
      current_employer: currentEmployer,
      current_title: currentJobTitle,
      current_job_title: currentJobTitle,
      primary_skills: skills,
      skills: Array.isArray(body.skills) ? body.skills : skills.split(/,\s*/).filter(Boolean),
      authorized_in_usa: authorizedInUsa,
      needs_sponsorship: needsSponsorship,
      need_sponsorship_now: needsSponsorship,
      need_sponsorship_future: needsSponsorship,
      open_to_relocation: openToRelocation,
      visa_status: body.visa_status || null,
      work_authorization: body.work_authorization || (authorizedInUsa ? 'Authorized to work in US' : null),
      demographics: {
        gender,
        raceEthnicity: race,
        veteranStatus: veteran,
        disabilityStatus: disability,
      },
      gender,
      race,
      race_ethnicity: race,
      veteran,
      veteran_status: veteran,
      disability,
      disability_status: disability,
      notice_period: noticePeriod,
      availability: noticePeriod,
      expected_salary: expectedSalary,
      salary_expectation: expectedSalary,
      highest_qualification: highestEducation,
      highest_education: highestEducation,
      university_name: universityName,
      school: universityName,
      graduation_year: graduationYear,
      roles: body.roles ?? ((existingCandidate?.confirmed_facts as any)?.roles ?? []),
      seniorities: body.seniorities ?? ((existingCandidate?.confirmed_facts as any)?.seniorities ?? []),
      jobLanguages: body.jobLanguages ?? ((existingCandidate?.confirmed_facts as any)?.jobLanguages ?? []),
      contacts: body.contacts ?? null,
      location: body.location || { whereBased: locationStr },
      workHistory,
      employment_history: workHistory,
      projects: body.projects ?? [],
      education,
      education_history: education,
      languages: body.languages ?? [],
      certifications: body.certifications ?? [],
      screeningAnswers: screening,
      uploadedAt: new Date().toISOString(),
    };

    let savedCandidate;

    if (existingCandidate) {
      const candidateUpdate = {
        full_name: fullName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        primary_skills: skills || undefined,
        current_city: currentCity || undefined,
        current_state: currentState || undefined,
        full_address: locationStr || undefined,
        linkedin_url: linkedinUrl || undefined,
        current_employer: currentEmployer || undefined,
        current_job_title: currentJobTitle || undefined,
        authorized_in_usa: authorizedInUsa !== null ? authorizedInUsa : undefined,
        need_sponsorship_now: needsSponsorship !== null ? needsSponsorship : undefined,
        open_to_relocation: openToRelocation !== null ? openToRelocation : undefined,
        notice_period: noticePeriod ? String(noticePeriod) : undefined,
        expected_salary: expectedSalary ? String(expectedSalary) : undefined,
        employment_history: workHistory.length ? workHistory : undefined,
        education_history: education.length ? education : undefined,
        gender: (mergedFacts.gender as string) || undefined,
        race: (mergedFacts.race as string) || (mergedFacts.race_ethnicity as string) || undefined,
        veteran: (mergedFacts.veteran as string) || (mergedFacts.veteran_status as string) || undefined,
        disability: (mergedFacts.disability as string) || (mergedFacts.disability_status as string) || undefined,
        visa_status: (mergedFacts.visa_status as string) || (mergedFacts.work_authorization as string) || undefined,
        highest_qualification: (mergedFacts.highest_qualification as string) || undefined,
        university_name: (mergedFacts.university_name as string) || undefined,
        graduation_year: (mergedFacts.graduation_year as string) || undefined,
        confirmed_facts: mergedFacts,
        provenance_status: 'confirmed',
        version: (existingCandidate.version || 0) + 1,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await database()
        .from('candidates')
        .update(candidateUpdate)
        .eq('id', existingCandidate.id)
        .select()
        .single();

      checkDb(error);
      savedCandidate = data;
    } else {
      const { data, error } = await database()
        .from('candidates')
        .insert({
          user_id: user.id,
          full_name: fullName,
          email,
          phone,
          primary_skills: skills,
          current_city: currentCity,
          current_state: currentState,
          full_address: locationStr,
          linkedin_url: linkedinUrl,
          current_employer: currentEmployer,
          current_job_title: currentJobTitle,
          authorized_in_usa: authorizedInUsa !== null ? authorizedInUsa : undefined,
          need_sponsorship_now: needsSponsorship !== null ? needsSponsorship : undefined,
          open_to_relocation: openToRelocation !== null ? openToRelocation : undefined,
          notice_period: noticePeriod ? String(noticePeriod) : undefined,
          expected_salary: expectedSalary ? String(expectedSalary) : undefined,
          employment_history: workHistory.length ? workHistory : undefined,
          education_history: education.length ? education : undefined,
          gender: (mergedFacts.gender as string) || undefined,
          race: (mergedFacts.race as string) || (mergedFacts.race_ethnicity as string) || undefined,
          veteran: (mergedFacts.veteran as string) || (mergedFacts.veteran_status as string) || undefined,
          disability: (mergedFacts.disability as string) || (mergedFacts.disability_status as string) || undefined,
          confirmed_facts: mergedFacts,
          provenance_status: 'confirmed',
          is_active_bench: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      checkDb(error);
      savedCandidate = data;
    }

    return cors(
      request,
      Response.json({
        success: true,
        candidate: savedCandidate,
      })
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save resume.';
    const status = error instanceof CaptureError ? error.status : 500;
    return cors(request, Response.json({ error: msg }, { status }));
  }
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserId(request);

    const { data: candidate, error } = await database()
      .from('candidates')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    checkDb(error);

    // If candidate has no parsed resume yet, do not return stale pre-selected facts
    const facts = (candidate?.confirmed_facts || {}) as Record<string, unknown>;
    const hasResume = Boolean(
      facts.has_parsed_resume === true ||
      (facts.filename && facts.raw_text && String(facts.raw_text).length > 20)
    );

    let sanitizedCandidate = candidate;
    if (candidate && !hasResume) {
      sanitizedCandidate = {
        ...candidate,
        confirmed_facts: {
          ...facts,
          has_parsed_resume: false,
          filename: null,
          raw_text: null,
          roles: [],
          seniorities: [],
          jobLanguages: [],
          contacts: null,
        },
      };
    }

    return cors(
      request,
      Response.json({
        success: true,
        candidate: sanitizedCandidate || null,
      })
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load resume.';
    const status = error instanceof CaptureError ? error.status : 500;
    return cors(request, Response.json({ error: msg }, { status }));
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUserId(request);

    const { data: candidate, error: fetchErr } = await database()
      .from('candidates')
      .select('id, version')
      .eq('user_id', user.id)
      .maybeSingle();

    checkDb(fetchErr);

    if (candidate) {
      const { error: updateErr } = await database()
        .from('candidates')
        .update({
          full_name: null,
          email: null,
          phone: null,
          primary_skills: null,
          confirmed_facts: {
            has_parsed_resume: false,
            filename: null,
            raw_text: null,
            roles: [],
            seniorities: [],
            jobLanguages: [],
            contacts: null,
            skills: [],
            workHistory: [],
            projects: [],
            education: [],
            languages: [],
            certifications: [],
          },
          version: (candidate.version || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.id);

      checkDb(updateErr);
    }

    return cors(
      request,
      Response.json({
        success: true,
        message: 'Resume and all associated profile fields have been deleted successfully.',
      })
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete resume.';
    const status = error instanceof CaptureError ? error.status : 500;
    return cors(request, Response.json({ error: msg }, { status }));
  }
}
