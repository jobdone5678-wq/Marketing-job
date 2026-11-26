import { profileAccess } from '@/lib/auth/profile-access';
import { isUnreviewedResume } from '@/lib/candidate/confirmed-facts';
import { splitFullName } from '@/lib/candidate/resumeextract';
import { checkDb, database } from '@/lib/db/admin';
import { cors } from '@/lib/http/cors';
import { getScreeningAnswers } from '@/lib/ingest/screeninganswers';
import { resolveV1UserId, v1ErrorResponse } from '@/lib/v1/auth';

const corsOptions = { methods: 'GET, OPTIONS', credentials: false };
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const yesNo = (value: boolean | null) => (value === null ? '' : value ? 'Yes' : 'No');

function countryFromCode(code: string): string {
  const up = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(up)) return code.trim();
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(up) ?? up;
  } catch {
    return up;
  }
}

function structuredLocation(facts: Record<string, unknown>): Record<string, unknown> | null {
  return facts.location && typeof facts.location === 'object' ? (facts.location as Record<string, unknown>) : null;
}

function resolveCountry(facts: Record<string, unknown>, authorizedCountries: string[] | null): string {
  const direct = text(facts.country) || text(facts.current_country);
  if (direct) return countryFromCode(direct);
  const loc = structuredLocation(facts);
  const countries = Array.isArray(loc?.countries) ? loc.countries.map(text).filter(Boolean) : [];
  if (countries.length === 1 && countries[0]) return countryFromCode(countries[0]);
  const where = text(loc?.whereBased) || text(facts.full_address);
  const parts = where.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 1]!;
  if (authorizedCountries?.length === 1 && authorizedCountries[0]) return countryFromCode(authorizedCountries[0]);
  return '';
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
    .select('email, role, status')
    .eq('id', userId)
    .maybeSingle();
  checkDb(profileError);
  if (!profile || !profileAccess(profile)) {
    return Response.json({ error: 'An active candidate account is required.' }, { status: 403 });
  }

  const [candidates, screening] = await Promise.all([
    db
      .from('candidates')
      .select('id, confirmed_facts, full_name')
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
  const fullName = text(facts.full_name) || text(candidate?.full_name);
  const { first_name, last_name } = splitFullName(fullName);
  const salary = screening.desired_salary_amount;
  const salaryPeriod = screening.desired_salary_period;
  const noticeDays = screening.notice_period_days;
  const country = resolveCountry(facts, screening.authorized_countries);
  const intendedWorkCountry = countryFromCode(text(facts.intended_work_country)) || country;

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
      email: Object.hasOwn(facts, 'email') ? text(facts.email) : text(profile.email),
      phone: text(facts.phone),
      location: Object.hasOwn(facts, 'full_address')
        ? text(facts.full_address)
        : text(facts.location) ||
          [text(facts.current_city), text(facts.current_state)].filter(Boolean).join(', ') ||
          text(structuredLocation(facts)?.whereBased),
      state: text(facts.current_state),
      country,
      postal_code: text(facts.zip_code) || text(facts.postal_code),
      intended_work_country: intendedWorkCountry,
      linkedin: text(facts.linkedin_url),
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
