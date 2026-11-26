import { baseCountry } from '@/lib/profile/base-country';
import { profileAccess } from '@/lib/auth/profile-access';
import { isUnreviewedResume } from '@/lib/candidate/confirmed-facts';
import { splitFullName } from '@/lib/candidate/resumeextract';
import { checkDb, database } from '@/lib/db/admin';
import { cors } from '@/lib/http/cors';
import { getScreeningAnswers, resolveAutofillScreening } from '@/lib/ingest/screeninganswers';
import { resolveV1UserId, v1ErrorResponse } from '@/lib/v1/auth';

const corsOptions = { methods: 'GET, OPTIONS', credentials: false };
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const yesNo = (value: boolean | null) => (value === null ? '' : value ? 'Yes' : 'No');

function structuredLocation(facts: Record<string, unknown>): Record<string, unknown> | null {
  return facts.location && typeof facts.location === 'object' ? (facts.location as Record<string, unknown>) : null;
}

export function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }), corsOptions);
}

async function readProfile(request: Request): Promise<Response> {
  const userId = await resolveV1UserId(request, undefined, { bearerOnly: true });
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const db = database();
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('email, role, status, full_name, candidate_contacts')
    .eq('id', userId)
    .maybeSingle();
  checkDb(profileError);
  if (!profile || !profileAccess(profile)) {
    return Response.json({ error: 'An active candidate account is required.' }, { status: 403 });
  }

  const [candidates, typedScreening] = await Promise.all([
    db
      .from('candidates')
      .select('id, confirmed_facts, full_name, email, phone, linkedin_url, current_city, current_state, full_address')
      .eq('user_id', userId)
      .eq('provenance_status', 'confirmed')
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(50),
    getScreeningAnswers(userId, db),
  ]);
  checkDb(candidates.error);
  const candidate = candidates.data?.find((row) => !isUnreviewedResume(row.confirmed_facts ?? {}));
  const facts: Record<string, unknown> = candidate?.confirmed_facts ?? {};
  const screening = resolveAutofillScreening(typedScreening, facts.screeningAnswers);
  const cfContacts = facts.contacts && typeof facts.contacts === 'object' ? (facts.contacts as Record<string, unknown>) : null;
  const profileContacts = (profile as Record<string, unknown>).candidate_contacts &&
    typeof (profile as Record<string, unknown>).candidate_contacts === 'object'
    ? ((profile as Record<string, unknown>).candidate_contacts as Record<string, unknown>)
    : null;
  const realName = [
    text(facts.full_name),
    text(cfContacts?.fullName),
    text(cfContacts?.full_name),
    text(candidate?.full_name),
    text(profileContacts?.full_name),
    text((profile as Record<string, unknown>).full_name),
  ].find((name) => name && name.toLowerCase() !== 'applicant') || '';
  const fullName = realName || text(facts.full_name) || text(candidate?.full_name);
  const { first_name, last_name } = splitFullName(fullName);
  const salary = screening.desired_salary_amount;
  const salaryPeriod = screening.desired_salary_period;
  const noticeDays = screening.notice_period_days;
  const state = text(facts.current_state) || text(candidate?.current_state);
  const savedLocation = text(structuredLocation(facts)?.whereBased) ||
    text(facts.location) || text(facts.full_address) || text(candidate?.full_address) ||
    [text(facts.current_city) || text(candidate?.current_city), state].filter(Boolean).join(', ');
  const country = baseCountry(text(facts.country) || text(facts.current_country), savedLocation, state) ?? '';
  const intendedWorkCountry = baseCountry(facts.intended_work_country, undefined) ?? country;

  return Response.json({
    meta: {
      candidateId: candidate?.id ?? null,
      screening: {
        age_18_or_older: screening.age_18_or_older,
        notice_period_days: screening.notice_period_days,
        willing_to_relocate: screening.willing_to_relocate,
        visa_sponsorship_needed: screening.visa_sponsorship_needed,
        desired_salary_amount: salary,
        desired_salary_currency: screening.desired_salary_currency,
        desired_salary_period: salaryPeriod,
      },
    },
    data: {
      full_name: fullName,
      first_name: Object.hasOwn(facts, 'first_name') ? text(facts.first_name) : first_name,
      last_name: Object.hasOwn(facts, 'last_name') ? text(facts.last_name) : last_name,
      email: Object.hasOwn(facts, 'email') ? text(facts.email) : text(cfContacts?.email) || text(candidate?.email) || text(profile.email),
      phone: text(facts.phone) || text(cfContacts?.phone) || text((candidate as Record<string, unknown> | undefined)?.phone),
      location: Object.hasOwn(facts, 'full_address')
        ? text(facts.full_address)
        : text(facts.location) ||
          [text(facts.current_city), text(facts.current_state)].filter(Boolean).join(', ') ||
          text(structuredLocation(facts)?.whereBased) ||
          text(cfContacts?.location) ||
          [text((candidate as Record<string, unknown> | undefined)?.current_city), text((candidate as Record<string, unknown> | undefined)?.current_state)].filter(Boolean).join(', ') ||
          text((candidate as Record<string, unknown> | undefined)?.full_address),
      state,
      country,
      postal_code: text(facts.zip_code) || text(facts.postal_code),
      intended_work_country: intendedWorkCountry,
      linkedin: text(facts.linkedin_url) || text((candidate as Record<string, unknown> | undefined)?.linkedin_url),
      github: text(facts.github_url),
      portfolio: Object.hasOwn(facts, 'portfolio_url')
        ? text(facts.portfolio_url)
        : text(facts.website),
      authorized_countries: screening.authorized_countries?.join(', ').toUpperCase() ?? '',
      visa_sponsorship_needed: yesNo(screening.visa_sponsorship_needed),
      desired_salary:
        salary == null
          ? ''
          : [salary, screening.desired_salary_currency, salaryPeriod && `per ${salaryPeriod}`]
              .filter(Boolean)
              .join(' '),
      notice_period: noticeDays == null ? '' : `${noticeDays} ${noticeDays === 1 ? 'day' : 'days'}`,
      willing_to_relocate: yesNo(screening.willing_to_relocate),
      age_18_or_older: yesNo(screening.age_18_or_older),
    },
  });
}

export async function GET(request: Request) {
  const response = await readProfile(request).catch(v1ErrorResponse);
  response.headers.set('Cache-Control', 'no-store');
  return cors(request, response, corsOptions);
}
