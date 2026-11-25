import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { ProviderClient } from '../../src/lib/ai/provider-client.ts';
import { ServerVercelProviderClient } from '../../src/lib/ai/server-provider-client.ts';
import { planFormBatch, inferQuestionDescriptor } from '../../src/lib/ai/planner.ts';
import { chooseComboboxOption } from '../../src/lib/ai/chooser.ts';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';
import { validateGroundedAnswer } from '../../src/lib/ai/grounded.ts';
import { PlanContractSchema, ChooseContractSchema } from '../../src/lib/ai/structured-contracts.ts';
import { createSafeAgent } from '../../src/lib/ai/ssrf-guard.ts';
import { createSsrfSafeFetch } from '../../src/lib/ai/ssrf-fetch-adapter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests', 'fixtures');

/**
 * Redacts potential API keys / bearer tokens from any error string or URL.
 */
export function redactSecrets(input, apiKey) {
  let out = String(input ?? '');
  if (apiKey && typeof apiKey === 'string' && apiKey.trim().length > 0) {
    const trimmed = apiKey.trim();
    out = out.split(trimmed).join('[REDACTED]');
  }
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-:/+=]+/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bsk-[A-Za-z0-9._\-]{8,}\b/gi, '[REDACTED]');
  return out;
}

/**
 * Parses a .env file into a key-value map without mutating process.env.
 */
export function parseDotEnv(envPath = path.join(ROOT_DIR, '.env')) {
  const result = {};
  if (!fs.existsSync(envPath)) {
    return result;
  }
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

function decodeHtmlEntities(str) {
  return String(str ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanLabelText(html) {
  return decodeHtmlEntities(
    String(html ?? '')
      .replace(/<span[^>]*class=["'][^"']*(?:asterisk|required)[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*\*$/, '')
      .trim(),
  );
}

function parseAttributes(attrStr) {
  const attrs = {};
  const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRegex.exec(attrStr)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = decodeHtmlEntities(val);
  }
  return attrs;
}

/**
 * Extracts form fields and combobox options from an ATS HTML fixture.
 */
export function extractFormFieldsFromHtml(htmlContent) {
  const stripped = String(htmlContent ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const fields = [];
  const handledControlIds = new Set();
  const handledRadioNames = new Set();

  // 1. Extract explicit <label for="..."> mappings
  const labelForMap = new Map();
  const labelForRegex = /<label\b[^>]*\bfor=["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi;
  let m;
  while ((m = labelForRegex.exec(stripped)) !== null) {
    const forId = m[1].trim();
    const labelText = cleanLabelText(m[2]);
    if (forId && labelText) {
      labelForMap.set(forId, labelText);
    }
  }

  // 2. Extract <fieldset> radio groups with <legend>
  const fieldsetRegex = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi;
  while ((m = fieldsetRegex.exec(stripped)) !== null) {
    const inner = m[1];
    const legendMatch = inner.match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i);
    if (!legendMatch) continue;
    const legendText = cleanLabelText(legendMatch[1]);
    const radioRegex = /<input\b([^>]*\btype=["']radio["'][^>]*)>/gi;
    const options = [];
    let radioName;
    let rMatch;
    while ((rMatch = radioRegex.exec(inner)) !== null) {
      const attrs = parseAttributes(rMatch[1]);
      if (attrs.name) radioName = attrs.name;
      if (attrs.value) options.push(attrs.value);
      if (attrs.id) handledControlIds.add(attrs.id);
    }
    if (options.length > 0 && radioName) {
      handledRadioNames.add(radioName);
      fields.push({
        id: radioName,
        name: radioName,
        label: legendText,
        type: 'radio',
        options,
        required: inner.includes('required'),
      });
    }
  }

  // 3. Extract <ul role="listbox"> options near comboboxes
  const comboboxOptionsByContainer = [];
  const listboxRegex = /<ul\b[^>]*role=["']listbox["'][^>]*>([\s\S]*?)<\/ul>/gi;
  while ((m = listboxRegex.exec(stripped)) !== null) {
    const opts = [];
    const optRegex = /<li\b[^>]*role=["']option["'][^>]*>([\s\S]*?)<\/li>/gi;
    let oMatch;
    while ((oMatch = optRegex.exec(m[1])) !== null) {
      const text = cleanLabelText(oMatch[1]);
      if (text) opts.push(text);
    }
    comboboxOptionsByContainer.push({ index: m.index, options: opts });
  }

  // 4. Extract wrapped <label>...</label> blocks containing inputs or textareas
  const wrappedLabelMap = new Map();
  const wrappedLabelRegex = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
  while ((m = wrappedLabelRegex.exec(stripped)) !== null) {
    const attrs = parseAttributes(m[1]);
    if (attrs.for) continue;
    const inner = m[2];
    const controlMatch = inner.match(/<(input|textarea|select)\b([^>]*)>/i);
    if (!controlMatch) continue;
    const controlAttrs = parseAttributes(controlMatch[2]);
    if (controlAttrs.type === 'radio' && controlAttrs.name && handledRadioNames.has(controlAttrs.name)) {
      continue;
    }
    const spanTextMatch = inner.match(/<span\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    const labelText = spanTextMatch
      ? cleanLabelText(spanTextMatch[1])
      : cleanLabelText(inner.replace(/<(input|textarea|select)\b[^>]*>/gi, ''));
    const key = controlAttrs.id || controlAttrs.name || `${controlMatch[1]}:${m.index}`;
    if (labelText) {
      wrappedLabelMap.set(key, labelText);
    }
  }

  // 5. Extract all <input> and <textarea> controls in document order
  const controlRegex = /<(input|textarea)\b([^>]*)>/gi;
  while ((m = controlRegex.exec(stripped)) !== null) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttributes(m[2]);
    const rawType = (attrs.type || (tag === 'textarea' ? 'textarea' : 'text')).toLowerCase();

    if (['file', 'submit', 'button', 'reset', 'hidden'].includes(rawType)) {
      continue;
    }
    if (rawType === 'radio' && attrs.name && handledRadioNames.has(attrs.name)) {
      continue;
    }
    if (attrs.id && handledControlIds.has(attrs.id)) {
      continue;
    }

    const isCombo = attrs.role === 'combobox';
    let label =
      (attrs.id && labelForMap.get(attrs.id)) ||
      (attrs.id && wrappedLabelMap.get(attrs.id)) ||
      (attrs.name && wrappedLabelMap.get(attrs.name)) ||
      '';

    if (!label && isCombo) {
      label = attrs.placeholder || attrs['aria-label'] || attrs.name || attrs.id || '';
    }
    if (!label) {
      // Fallback: look backwards in nearby <label> if nested
      const before = stripped.slice(Math.max(0, m.index - 400), m.index);
      const lastOpenLabel = before.lastIndexOf('<label');
      const lastCloseLabel = before.lastIndexOf('</label>');
      if (lastOpenLabel > lastCloseLabel) {
        const afterOpen = before.slice(lastOpenLabel);
        const spanText = afterOpen.match(/<span\b[^>]*class=["'][^"']*\btext\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
        label = spanText ? cleanLabelText(spanText[1]) : cleanLabelText(afterOpen);
      }
    }
    if (!label) continue;

    let options;
    if (isCombo) {
      const nearby = comboboxOptionsByContainer.find(
        (entry) => entry.index > m.index && entry.index - m.index < 600,
      );
      if (nearby && nearby.options.length > 0) {
        options = nearby.options;
      }
    }

    const field = {
      ...(attrs.id ? { id: attrs.id } : {}),
      ...(attrs.name ? { name: attrs.name } : {}),
      label,
      type: isCombo ? 'text' : rawType,
      required: 'required' in attrs,
      ...(isCombo ? { combo: true } : {}),
      ...(options ? { options } : {}),
    };
    fields.push(field);
  }

  return fields;
}

/**
 * Synthetic benchmark candidate profiles (strictly non-PII fictional placeholders).
 */
function buildBenchmarkProfiles() {
  const candidateA = {
    full_name: 'Alex Mercer',
    email: 'alex.mercer@example.com',
    phone: '415-555-0199',
    linkedin_url: 'https://linkedin.com/in/alexmercer',
    github_url: 'https://github.com/alexmercer',
    website: 'https://alexmercer.dev',
    current_city: 'San Francisco',
    current_state: 'CA',
    country: 'United States',
    zip_code: '94105',
    full_address: '742 Evergreen Terrace, San Francisco, CA 94105',
    authorized_in_usa: true,
    need_sponsorship_now: false,
    need_sponsorship_future: false,
    total_experience_years: 4,
    highest_qualification: "Bachelor's Degree",
    primary_skills: 'TypeScript (4 years), React (3 years)',
    certifications: ['AWS Certified Solutions Architect'],
    open_to_relocation: true,
    preferred_locations: 'San Francisco, CA',
  };

  const answerBankA = {
    preferred_work_location: 'San Francisco, CA',
    notice_period: '2 weeks',
  };

  const candidateB = {
    full_name: 'Priya Nair',
    email: 'priya.nair@example.com',
    phone: '206-555-0142',
    current_city: 'Seattle',
    current_state: 'WA',
    country: 'United States',
    authorized_in_usa: true,
    need_sponsorship_now: false,
    need_sponsorship_future: true,
    total_experience_years: 3,
    highest_qualification: "Bachelor's Degree",
    certifications: ['AWS Certified Solutions Architect'],
  };

  return {
    factsA: buildVerifiedFacts(candidateA, answerBankA),
    factsB: buildVerifiedFacts(candidateB),
  };
}

function normStr(val) {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^\w\s./:-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExactOrEquivalent(actual, expected) {
  if (typeof expected === 'function') {
    return Boolean(expected(actual));
  }
  if (Array.isArray(expected)) {
    return expected.some((item) => isExactOrEquivalent(actual, item));
  }
  return normStr(actual) === normStr(expected);
}

const isPositiveMatch = (val) => {
  const n = normStr(val);
  return /^(yes|true|i do|authorized|yes\b.*)$/i.test(n);
};

const isNegativeMatch = (val) => {
  const n = normStr(val);
  return /^(no|false|none|do not require|does not require|will not require|no\b.*)$/i.test(n);
};

/**
 * Loads benchmark scenarios built from tests/fixtures/*.html plus adversarial scenarios.
 */
export function loadFixtureScenarios() {
  const { factsA, factsB } = buildBenchmarkProfiles();

  const greenhouseHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'greenhouse-universal.html'), 'utf8');
  const ashbyHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'ashby-universal.html'), 'utf8');
  const leverHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'lever-universal.html'), 'utf8');
  const workdayHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'workday-universal.html'), 'utf8');

  const greenhouseFields = extractFormFieldsFromHtml(greenhouseHtml);
  const ashbyFields = extractFormFieldsFromHtml(ashbyHtml);
  const leverFields = extractFormFieldsFromHtml(leverHtml);
  const workdayFields = extractFormFieldsFromHtml(workdayHtml);

  const ashbyLocationField = ashbyFields.find((f) => f.combo && /location/i.test(f.label));

  return [
    // 1. Greenhouse Fixture (Plan)
    {
      id: 'plan-greenhouse-universal',
      kind: 'plan',
      source: 'tests/fixtures/greenhouse-universal.html',
      fields: greenhouseFields,
      facts: factsA,
      context: { jobTitle: 'Senior Software Engineer', company: 'Acme Corp', batchSize: 5 },
      expectedAnswerable: {
        'First Name': ['Alex', 'Alex Mercer'],
        'Last Name': ['Mercer', 'Alex Mercer'],
        Email: 'alex.mercer@example.com',
        Phone: '415-555-0199',
        'LinkedIn Profile': 'https://linkedin.com/in/alexmercer',
        Website: 'https://alexmercer.dev',
        GitHub: 'https://github.com/alexmercer',
      },
      unanswerableLabels: [
        'What is your favorite testing framework?',
        'I acknowledge that Acme Corp may process my data for recruitment purposes.',
      ],
    },

    // 2. Ashby Fixture (Plan)
    {
      id: 'plan-ashby-universal',
      kind: 'plan',
      source: 'tests/fixtures/ashby-universal.html',
      fields: ashbyFields,
      facts: factsA,
      context: { jobTitle: 'Staff Infrastructure Engineer', company: 'Acme Corp', batchSize: 5 },
      expectedAnswerable: {
        'First Name': ['Alex', 'Alex Mercer'],
        'Last Name': ['Mercer', 'Alex Mercer'],
        Email: 'alex.mercer@example.com',
        'Phone Number': '415-555-0199',
        'LinkedIn Profile': 'https://linkedin.com/in/alexmercer',
        'GitHub Profile': 'https://github.com/alexmercer',
        'Portfolio URL': 'https://alexmercer.dev',
      },
      deferredLabels: ['Preferred Work Location'],
      unanswerableLabels: ['Describe your experience building scalable web applications'],
    },

    // 3. Lever Fixture (Plan)
    {
      id: 'plan-lever-universal',
      kind: 'plan',
      source: 'tests/fixtures/lever-universal.html',
      fields: leverFields,
      facts: factsA,
      context: { jobTitle: 'Principal Frontend Engineer', company: 'Acme Corp', batchSize: 5 },
      expectedAnswerable: {
        'Full name': 'Alex Mercer',
        Email: 'alex.mercer@example.com',
        Phone: '415-555-0199',
        'LinkedIn URL': 'https://linkedin.com/in/alexmercer',
        'GitHub URL': 'https://github.com/alexmercer',
        'Portfolio URL': 'https://alexmercer.dev',
        'Are you authorized to work lawfully in the United States?': isPositiveMatch,
        'What is your notice period?': ['2 weeks', '2 Weeks'],
      },
      unanswerableLabels: [
        'Current company',
        'Twitter URL',
        'I agree to allow Acme Corp to store my data for future job openings.',
      ],
    },

    // 4. Workday Fixture (Plan)
    {
      id: 'plan-workday-universal',
      kind: 'plan',
      source: 'tests/fixtures/workday-universal.html',
      fields: workdayFields,
      facts: factsA,
      context: { jobTitle: 'Lead Software Engineer - Core Platform', company: 'Acme Global', batchSize: 5 },
      expectedAnswerable: {
        'First Name': ['Alex', 'Alex Mercer'],
        'Last Name': ['Mercer', 'Alex Mercer'],
        'Email Address': 'alex.mercer@example.com',
        'Phone Number': '415-555-0199',
        'Address Line 1': ['742 Evergreen Terrace', '742 Evergreen Terrace, San Francisco, CA 94105'],
        City: 'San Francisco',
        'Postal Code': '94105',
        LinkedIn: 'https://linkedin.com/in/alexmercer',
        'Personal Website': 'https://alexmercer.dev',
      },
      deferredLabels: ['How Did You Hear About Us?'],
      unanswerableLabels: ['Other Link'],
    },

    // 5. Adversarial Plan: Visa Sponsorship Negation, Experience Ceiling, Degree Elevation, Unanswerables
    {
      id: 'plan-adversarial-negation-ceilings',
      kind: 'plan',
      source: 'adversarial',
      fields: [
        {
          id: 'adv_spon_1',
          label: 'Will you now or in the future require sponsorship for employment visa status?',
          type: 'select',
          options: ['Yes', 'No'],
          required: true,
        },
        {
          id: 'adv_exp_1',
          label: 'How many years of experience do you have?',
          type: 'text',
          required: true,
        },
        {
          id: 'adv_deg_1',
          label: 'What is your highest degree?',
          type: 'text',
          required: true,
        },
        {
          id: 'adv_clear_1',
          label: 'Do you hold an active Top Secret security clearance?',
          type: 'text',
          required: false,
        },
        {
          id: 'adv_hobby_1',
          label: 'What is your favorite hobby outside of work?',
          type: 'text',
          required: false,
        },
      ],
      facts: factsA,
      context: { jobTitle: 'Platform Engineer', company: 'DefenseTech', batchSize: 5 },
      expectedAnswerable: {
        'Will you now or in the future require sponsorship for employment visa status?': isNegativeMatch,
        'How many years of experience do you have?': (v) => {
          const m = String(v).match(/(\d+(?:\.\d+)?)/);
          if (!m) return false;
          const n = parseFloat(m[1]);
          return n > 0 && n <= 4;
        },
        'What is your highest degree?': (v) => /bachelor/i.test(String(v)),
      },
      unanswerableLabels: [
        'Do you hold an active Top Secret security clearance?',
        'What is your favorite hobby outside of work?',
      ],
      adversarialHallucinationField: 'Do you hold an active Top Secret security clearance?',
    },

    // 6. Adversarial Plan: Positive Sponsorship + Degree Threshold + Certification Check
    {
      id: 'plan-adversarial-sponsorship-required-thresholds',
      kind: 'plan',
      source: 'adversarial',
      fields: [
        {
          id: 'adv_spon_2',
          label: 'Will you in the future require visa sponsorship?',
          type: 'select',
          options: ['Yes', 'No'],
          required: true,
        },
        {
          id: 'adv_deg_thresh_2',
          label: "Do you have a Master's degree?",
          type: 'select',
          options: ['Yes', 'No'],
          required: true,
        },
        {
          id: 'adv_cert_aws',
          label: 'Do you hold an AWS Certified Solutions Architect certification?',
          type: 'select',
          options: ['Yes', 'No'],
          required: false,
        },
        {
          id: 'adv_lang_2',
          label: 'What is your preferred programming language for weekend projects?',
          type: 'text',
          required: false,
        },
      ],
      facts: factsB,
      context: { jobTitle: 'Cloud Architect', company: 'CloudScale', batchSize: 5 },
      expectedAnswerable: {
        'Will you in the future require visa sponsorship?': isPositiveMatch,
        "Do you have a Master's degree?": isNegativeMatch,
        'Do you hold an AWS Certified Solutions Architect certification?': isPositiveMatch,
      },
      unanswerableLabels: [
        'What is your preferred programming language for weekend projects?',
      ],
    },

    // 7. Choose Scenario from Ashby Fixture: Preferred Work Location
    {
      id: 'choose-ashby-preferred-location',
      kind: 'choose',
      source: 'tests/fixtures/ashby-universal.html',
      question: ashbyLocationField || { label: 'Preferred Work Location', type: 'text', combo: true },
      options: ashbyLocationField?.options || ['San Francisco, CA', 'Remote, US', 'New York, NY'],
      facts: factsA,
      expectedChoice: 'San Francisco, CA',
      unanswerable: false,
    },

    // 8. Choose Scenario from Workday Fixture: How Did You Hear About Us? (unanswerable)
    {
      id: 'choose-workday-source-unanswerable',
      kind: 'choose',
      source: 'tests/fixtures/workday-universal.html',
      question: { label: 'How Did You Hear About Us?', type: 'text', combo: true },
      options: ['LinkedIn', 'Company Website', 'Employee Referral', 'Job Board'],
      facts: factsA,
      expectedChoice: null,
      unanswerable: true,
    },

    // 9. Adversarial Choose: Visa Sponsorship Negation
    {
      id: 'choose-adversarial-visa-sponsorship',
      kind: 'choose',
      source: 'adversarial',
      question: {
        label: 'Will you now or in the future require sponsorship for employment visa status?',
        type: 'select',
        required: true,
      },
      options: ['Yes', 'No'],
      facts: factsA,
      expectedChoice: 'No',
      unanswerable: false,
    },

    // 10. Adversarial Choose: Degree Elevation Guard
    {
      id: 'choose-adversarial-degree-elevation',
      kind: 'choose',
      source: 'adversarial',
      question: {
        label: 'Highest Education Level',
        type: 'select',
        required: true,
      },
      options: ['High School', "Associate's Degree", "Bachelor's Degree", "Master's Degree", 'Ph.D.'],
      facts: factsA,
      expectedChoice: "Bachelor's Degree",
      unanswerable: false,
    },

    // 11. Adversarial Choose: Unanswerable Security Clearance
    {
      id: 'choose-adversarial-security-clearance',
      kind: 'choose',
      source: 'adversarial',
      question: {
        label: 'What is your security clearance level?',
        type: 'select',
        required: false,
      },
      options: ['Confidential', 'Secret', 'Top Secret', 'None / Not Applicable'],
      facts: factsA,
      expectedChoice: null,
      unanswerable: true,
    },

    // 12. Choose: Country of Residence
    {
      id: 'choose-country-of-residence',
      kind: 'choose',
      source: 'adversarial',
      question: {
        label: 'Country of Residence',
        type: 'select',
        required: true,
      },
      options: ['United States', 'Canada', 'United Kingdom', 'Germany'],
      facts: factsA,
      expectedChoice: 'United States',
      unanswerable: false,
    },
  ];
}

/**
 * Generates deterministic mock LLM responses for Plan and Choose requests.
 */
function buildMockPlanResponse(userPayload) {
  const fields = userPayload.fields || userPayload.fieldsToFill || [];
  const profile = userPayload.profile || {};
  const fills = [];

  const fullName = String(profile['profile.name'] || '');
  const [firstName, ...restName] = fullName.split(' ');
  const lastName = restName.join(' ');

  for (const field of fields) {
    const label = field.label || '';
    const norm = label.toLowerCase();

    if (field.combo) {
      if (profile['answer_bank.preferred_work_location'] && /preferred work location/i.test(label)) {
        fills.push({
          label,
          value: '',
          ...(field.fieldId ? { fieldId: field.fieldId } : {}),
          action: 'defer_combobox',
        });
      }
      continue;
    }

    if (/first\s*name/i.test(norm) && firstName) {
      fills.push({ label, value: firstName, ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/last\s*name/i.test(norm) && lastName) {
      fills.push({ label, value: lastName, ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/(full\s*name|legal\s*name)/i.test(norm) && fullName) {
      fills.push({ label, value: fullName, ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/email/i.test(norm) && profile['profile.contact.email']) {
      fills.push({ label, value: String(profile['profile.contact.email']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/phone/i.test(norm) && profile['profile.contact.phone']) {
      fills.push({ label, value: String(profile['profile.contact.phone']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/linkedin/i.test(norm) && profile['profile.contact.linkedin']) {
      fills.push({ label, value: String(profile['profile.contact.linkedin']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/github/i.test(norm) && profile['profile.contact.github']) {
      fills.push({ label, value: String(profile['profile.contact.github']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/(personal\s*website|portfolio|^website$)/i.test(norm) && profile['profile.contact.website']) {
      fills.push({ label, value: String(profile['profile.contact.website']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/address\s*line\s*1/i.test(norm) && profile['profile.location.full_address']) {
      const addr1 = String(profile['profile.location.full_address']).split(',')[0].trim();
      fills.push({ label, value: addr1, ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/\bcity\b/i.test(norm) && profile['profile.location.city']) {
      fills.push({ label, value: String(profile['profile.location.city']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/(postal|zip)/i.test(norm) && profile['profile.location.zip_code']) {
      fills.push({ label, value: String(profile['profile.location.zip_code']), ...(field.fieldId ? { fieldId: field.fieldId } : {}), action: 'fill' });
    } else if (/authorized to work/i.test(norm) && profile['profile.work_auth.authorized_in_usa'] !== undefined) {
      fills.push({
        label,
        value: profile['profile.work_auth.authorized_in_usa'] ? 'Yes' : 'No',
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/notice period/i.test(norm) && profile['answer_bank.notice_period']) {
      fills.push({
        label,
        value: String(profile['answer_bank.notice_period']),
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/sponsor/i.test(norm) && profile['profile.work_auth.need_sponsorship_future'] !== undefined) {
      fills.push({
        label,
        value: profile['profile.work_auth.need_sponsorship_future'] ? 'Yes' : 'No',
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/years of experience/i.test(norm) && profile['profile.experience.total_years'] !== undefined) {
      fills.push({
        label,
        value: String(profile['profile.experience.total_years']),
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/highest degree/i.test(norm) && profile['profile.education.degree']) {
      fills.push({
        label,
        value: String(profile['profile.education.degree']),
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/master's degree/i.test(norm) && profile['profile.education.degree']) {
      const hasMasters = /master|ph\.?d|doctor/i.test(String(profile['profile.education.degree']));
      fills.push({
        label,
        value: hasMasters ? 'Yes' : 'No',
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/aws certified solutions architect/i.test(norm)) {
      const certs = Array.isArray(profile['profile.certifications']) ? profile['profile.certifications'] : [];
      const hasAws = certs.some((c) => /aws certified solutions architect/i.test(String(c)));
      fills.push({
        label,
        value: hasAws ? 'Yes' : 'No',
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    } else if (/top secret security clearance/i.test(norm)) {
      // Simulate an adversarial ungrounded model hallucination that validateGroundedAnswer must catch
      fills.push({
        label,
        value: 'Yes, active Top Secret clearance',
        ...(field.fieldId ? { fieldId: field.fieldId } : {}),
        action: 'fill',
      });
    }
  }

  return { fills };
}

function buildMockChooseResponse(userPayload) {
  const question = String(userPayload.question || '').toLowerCase();
  const options = Array.isArray(userPayload.options) ? userPayload.options : [];
  const profile = userPayload.profile || {};

  if (/preferred work location/i.test(question)) {
    const pref = String(profile['answer_bank.preferred_work_location'] || '');
    const matched = options.find((o) => o.toLowerCase() === pref.toLowerCase()) || null;
    return { choice: matched, reason: matched ? 'Matches preferred location' : 'Unsupported' };
  }
  if (/sponsor/i.test(question) && profile['profile.work_auth.need_sponsorship_future'] !== undefined) {
    const target = profile['profile.work_auth.need_sponsorship_future'] ? 'Yes' : 'No';
    const matched = options.find((o) => o.toLowerCase() === target.toLowerCase()) || null;
    return { choice: matched, reason: 'Matches work authorization sponsorship status' };
  }
  if (/highest education level/i.test(question) && profile['profile.education.degree']) {
    const deg = String(profile['profile.education.degree']);
    const matched = options.find((o) => o.toLowerCase() === deg.toLowerCase()) || null;
    return { choice: matched, reason: 'Matches verified education degree' };
  }
  if (/country of residence/i.test(question) && profile['profile.location.country']) {
    const country = String(profile['profile.location.country']);
    const matched = options.find((o) => o.toLowerCase() === country.toLowerCase()) || null;
    return { choice: matched, reason: 'Matches candidate country' };
  }

  // Unanswerable questions (security clearance, how did you hear about us)
  return { choice: null, reason: 'Profile does not support any option' };
}

/**
 * Creates a deterministic mock fetch handler for mock benchmarks.
 * Tracks actual HTTP request count and optionally simulates Tier 1 json_schema rejection -> Tier 2 fallback.
 */
export function createMockBenchmarkFetch(options = {}) {
  const { simulateTier1Fallback = false, wrapLegacyFences = true } = options;
  let httpRequestCount = 0;

  const fetchFn = async (_url, init) => {
    httpRequestCount++;
    const body = JSON.parse(String(init?.body || '{}'));
    const responseFormatType = body.response_format?.type;

    if (simulateTier1Fallback && responseFormatType === 'json_schema') {
      return new Response(
        JSON.stringify({
          error: {
            message: "Unsupported parameter: 'response_format.json_schema' is not supported by this model.",
            type: 'invalid_request_error',
            param: 'response_format',
            code: 'unsupported_parameter',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const userMessage = [...(body.messages || [])].reverse().find((m) => m.role === 'user');
    const userPayload = JSON.parse(userMessage?.content || '{}');
    const isChoose = Array.isArray(userPayload.options) && typeof userPayload.question === 'string';
    const responsePayload = isChoose
      ? buildMockChooseResponse(userPayload)
      : buildMockPlanResponse(userPayload);

    const promptTokens = Math.max(40, Math.round(JSON.stringify(body.messages || []).length / 4));
    const completionTokens = Math.max(15, Math.round(JSON.stringify(responsePayload).length / 4));

    let content = JSON.stringify(responsePayload);
    // Simulate legacy LLM formatting markdown fences when structured outputs are not enforced
    if (wrapLegacyFences && responseFormatType !== 'json_schema' && isChoose) {
      content = '```json\n' + content + '\n```';
    }

    return new Response(
      JSON.stringify({
        id: `mock-chatcmpl-${httpRequestCount}`,
        choices: [{ message: { role: 'assistant', content } }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  return {
    fetchFn,
    getHttpRequestCount: () => httpRequestCount,
    resetHttpRequestCount: () => {
      httpRequestCount = 0;
    },
  };
}

function computePercentile(sortedValues, p) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  const clamped = Math.max(0, Math.min(sortedValues.length - 1, idx));
  return Number(sortedValues[clamped].toFixed(2));
}

function round2(n) {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

/**
 * Evaluates a single provider client across all benchmark scenarios while collecting
 * pre-grounding schema validity, grounding pass rate, post-grounding accuracy/coverage/errors,
 * latency percentiles, reported token usage, and actual HTTP request count.
 */
async function evaluateClient(clientName, createClientFn, scenarios, options = {}) {
  const { apiKey } = options;

  let httpRequestCount = 0;
  const { client, getHttpCount } = await createClientFn(() => {
    httpRequestCount++;
  });

  // Track raw completions per scenario via non-invasive spy wrapper
  let currentCallRecords = [];
  const originalGenerate = client.generateChatCompletion.bind(client);

  client.generateChatCompletion = async (messages, genOpts) => {
    const schema = genOpts?.schemaName === 'choose' ? ChooseContractSchema : PlanContractSchema;
    try {
      const res = await originalGenerate(messages, genOpts);
      const parsed = schema.safeParse(res?.rawJson);
      currentCallRecords.push({
        schemaName: genOpts?.schemaName || 'plan',
        schemaValid: parsed.success,
        rawJson: res?.rawJson,
        usage: res?.usage,
        error: null,
      });
      return res;
    } catch (err) {
      currentCallRecords.push({
        schemaName: genOpts?.schemaName || 'plan',
        schemaValid: false,
        rawJson: undefined,
        usage: err?.usage,
        error: {
          code: err?.code || 'ERROR',
          status: err?.status || 500,
          message: redactSecrets(err?.message || String(err), apiKey),
        },
      });
      throw err;
    }
  };

  let totalAttemptedCalls = 0;
  let schemaValidCalls = 0;

  let proposedAnswersCount = 0;
  let groundedProposedCount = 0;

  let totalExpectedAnswerableCount = 0;
  let returnedAnswerableCount = 0;
  let accurateAnswerableCount = 0;

  let totalReturnedFillsCount = 0;
  let incorrectPostGroundingCount = 0;

  let totalUnanswerableCount = 0;
  let properlyUnresolvedCount = 0;

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let reportedUsageCalls = 0;

  const scenarioLatencies = [];
  const scenarioSummaries = [];
  const errors = [];

  for (const scenario of scenarios) {
    currentCallRecords = [];
    const t0 = performance.now();

    if (scenario.kind === 'plan') {
      const expectedMap = scenario.expectedAnswerable || {};
      const expectedLabels = Object.keys(expectedMap);
      const unanswerableLabels = scenario.unanswerableLabels || [];

      totalExpectedAnswerableCount += expectedLabels.length;
      totalUnanswerableCount += unanswerableLabels.length;

      let planResult = null;
      let scenarioErr = null;
      try {
        planResult = await planFormBatch(scenario.fields, scenario.facts, client, scenario.context);
      } catch (err) {
        scenarioErr = redactSecrets(err?.message || String(err), apiKey);
        errors.push({
          scenarioId: scenario.id,
          code: err?.code || 'ERROR',
          status: err?.status || 500,
          message: scenarioErr,
        });
      }
      const durationMs = performance.now() - t0;
      scenarioLatencies.push(durationMs);

      // Evaluate raw pre-grounding schema validity & grounding pass rate
      for (const rec of currentCallRecords) {
        totalAttemptedCalls++;
        if (rec.schemaValid) schemaValidCalls++;

        if (rec.rawJson && Array.isArray(rec.rawJson.fills)) {
          for (const rawFill of rec.rawJson.fills) {
            if (!rawFill || typeof rawFill !== 'object') continue;
            if (rawFill.action === 'skip' || rawFill.action === 'defer_combobox') continue;
            const rawVal = typeof rawFill.value === 'string' ? rawFill.value : String(rawFill.value ?? '');
            if (rawVal.trim() === '') continue;

            const matchedField = scenario.fields.find(
              (f) =>
                (rawFill.fieldId && (f.id === rawFill.fieldId || f.name === rawFill.fieldId)) ||
                (typeof rawFill.label === 'string' &&
                  f.label.trim().toLowerCase() === rawFill.label.trim().toLowerCase()),
            );
            if (!matchedField || matchedField.combo) continue;

            proposedAnswersCount++;
            const desc = inferQuestionDescriptor(matchedField);
            const grounding = validateGroundedAnswer(rawVal, scenario.facts, desc);
            if (grounding.valid && grounding.action !== 'skip') {
              groundedProposedCount++;
            }
          }
        }
      }

      // Aggregate usage ONLY from reported counts
      if (planResult?.telemetry?.usage) {
        const u = planResult.telemetry.usage;
        const pTok = typeof u.inputTokens === 'number' ? u.inputTokens : u.promptTokens;
        const cTok = typeof u.outputTokens === 'number' ? u.outputTokens : u.completionTokens;
        const tTok = u.totalTokens;
        if (typeof pTok === 'number' || typeof cTok === 'number' || typeof tTok === 'number') {
          reportedUsageCalls++;
        }
        if (typeof pTok === 'number') inputTokens += pTok;
        if (typeof cTok === 'number') outputTokens += cTok;
        if (typeof tTok === 'number') totalTokens += tTok;
      }

      // Post-grounding evaluation
      const fills = planResult?.fills || [];
      const fillByLabel = new Map();
      for (const fill of fills) {
        fillByLabel.set(fill.label, fill);
      }

      for (const label of expectedLabels) {
        const fill = fillByLabel.get(label);
        if (fill && typeof fill.value === 'string' && fill.value.trim() !== '') {
          returnedAnswerableCount++;
          if (isExactOrEquivalent(fill.value, expectedMap[label])) {
            accurateAnswerableCount++;
          }
        }
      }

      for (const uLabel of unanswerableLabels) {
        const fill = fillByLabel.get(uLabel);
        if (!fill || !fill.value || fill.value.trim() === '') {
          properlyUnresolvedCount++;
        }
      }

      // Check EVERY post-grounding fill for hallucination / contradiction / unanswerable leak
      for (const fill of fills) {
        totalReturnedFillsCount++;
        const field = scenario.fields.find((f) => f.label === fill.label) || { label: fill.label };
        const desc = inferQuestionDescriptor(field);
        const grounding = validateGroundedAnswer(fill.value, scenario.facts, desc);

        const isUnanswerable = unanswerableLabels.includes(fill.label);
        const expectedMatcher = expectedMap[fill.label];
        const contradictsTruth =
          expectedMatcher !== undefined && !isExactOrEquivalent(fill.value, expectedMatcher);

        if (!grounding.valid || grounding.action === 'skip' || isUnanswerable || contradictsTruth) {
          incorrectPostGroundingCount++;
        }
      }

      scenarioSummaries.push({
        id: scenario.id,
        kind: scenario.kind,
        source: scenario.source,
        durationMs: round2(durationMs),
        fillsReturned: fills.length,
        unmappedCount: planResult?.unmapped?.length ?? scenario.fields.length,
        deferredCount: planResult?.deferred?.length ?? 0,
        ...(scenarioErr ? { error: scenarioErr } : {}),
      });
    } else if (scenario.kind === 'choose') {
      if (scenario.unanswerable) {
        totalUnanswerableCount++;
      } else {
        totalExpectedAnswerableCount++;
      }

      let chooseResult = null;
      let scenarioErr = null;
      try {
        chooseResult = await chooseComboboxOption(
          scenario.question,
          scenario.options,
          scenario.facts,
          client,
        );
      } catch (err) {
        scenarioErr = redactSecrets(err?.message || String(err), apiKey);
        errors.push({
          scenarioId: scenario.id,
          code: err?.code || 'ERROR',
          status: err?.status || 500,
          message: scenarioErr,
        });
      }
      const durationMs = performance.now() - t0;
      scenarioLatencies.push(durationMs);

      for (const rec of currentCallRecords) {
        totalAttemptedCalls++;
        if (rec.schemaValid) schemaValidCalls++;

        const rawChoice =
          rec.rawJson && typeof rec.rawJson.choice === 'string' ? rec.rawJson.choice.trim() : '';
        if (rawChoice !== '') {
          proposedAnswersCount++;
          const matchedOption = scenario.options.find(
            (opt) => opt === rawChoice || opt.trim().toLowerCase() === rawChoice.toLowerCase(),
          );
          if (matchedOption) {
            const desc = inferQuestionDescriptor(scenario.question);
            const grounding = validateGroundedAnswer(matchedOption, scenario.facts, desc);
            if (grounding.valid && grounding.action !== 'skip') {
              groundedProposedCount++;
            }
          }
        }
      }

      if (chooseResult?.telemetry?.usage) {
        const u = chooseResult.telemetry.usage;
        const pTok = typeof u.inputTokens === 'number' ? u.inputTokens : u.promptTokens;
        const cTok = typeof u.outputTokens === 'number' ? u.outputTokens : u.completionTokens;
        const tTok = u.totalTokens;
        if (typeof pTok === 'number' || typeof cTok === 'number' || typeof tTok === 'number') {
          reportedUsageCalls++;
        }
        if (typeof pTok === 'number') inputTokens += pTok;
        if (typeof cTok === 'number') outputTokens += cTok;
        if (typeof tTok === 'number') totalTokens += tTok;
      }

      const chosen = chooseResult?.choice ?? null;
      if (scenario.unanswerable) {
        if (chosen === null) {
          properlyUnresolvedCount++;
        } else {
          totalReturnedFillsCount++;
          incorrectPostGroundingCount++;
        }
      } else if (chosen !== null) {
        returnedAnswerableCount++;
        totalReturnedFillsCount++;
        const matches = isExactOrEquivalent(chosen, scenario.expectedChoice);
        const desc = inferQuestionDescriptor(scenario.question);
        const grounding = validateGroundedAnswer(chosen, scenario.facts, desc);
        if (matches) {
          accurateAnswerableCount++;
        }
        if (!matches || !grounding.valid || grounding.action === 'skip') {
          incorrectPostGroundingCount++;
        }
      }

      scenarioSummaries.push({
        id: scenario.id,
        kind: scenario.kind,
        source: scenario.source,
        durationMs: round2(durationMs),
        resolved: chosen !== null,
        ...(scenarioErr ? { error: scenarioErr } : {}),
      });
    }
  }

  const finalHttpCount = typeof getHttpCount === 'function' ? getHttpCount() : httpRequestCount;
  const sortedLatencies = [...scenarioLatencies].sort((a, b) => a - b);
  const avgLatency =
    sortedLatencies.length > 0
      ? sortedLatencies.reduce((acc, v) => acc + v, 0) / sortedLatencies.length
      : 0;

  return {
    client: clientName,
    metrics: {
      schemaValidRate:
        totalAttemptedCalls > 0 ? round2((schemaValidCalls / totalAttemptedCalls) * 100) : 0,
      factualAccuracy:
        returnedAnswerableCount > 0
          ? round2((accurateAnswerableCount / returnedAnswerableCount) * 100)
          : 0,
      groundedResponseRate:
        proposedAnswersCount > 0 ? round2((groundedProposedCount / proposedAnswersCount) * 100) : 0,
      correctFillCoverage:
        totalExpectedAnswerableCount > 0
          ? round2((accurateAnswerableCount / totalExpectedAnswerableCount) * 100)
          : 0,
      incorrectFillRate:
        totalReturnedFillsCount > 0
          ? round2((incorrectPostGroundingCount / totalReturnedFillsCount) * 100)
          : 0,
      unresolvedRate:
        totalUnanswerableCount > 0
          ? round2((properlyUnresolvedCount / totalUnanswerableCount) * 100)
          : 0,
      latencyMs: {
        avg: round2(avgLatency),
        p50: computePercentile(sortedLatencies, 50),
        p95: computePercentile(sortedLatencies, 95),
      },
      tokens: {
        inputTokens,
        outputTokens,
        totalTokens,
        reportedUsageCalls,
      },
      httpRequestCount: finalHttpCount,
    },
    counts: {
      scenariosRun: scenarios.length,
      totalAttemptedCalls,
      schemaValidCalls,
      proposedAnswersCount,
      groundedProposedCount,
      totalExpectedAnswerableCount,
      returnedAnswerableCount,
      accurateAnswerableCount,
      totalReturnedFillsCount,
      incorrectPostGroundingCount,
      totalUnanswerableCount,
      properlyUnresolvedCount,
    },
    errors,
    scenarios: scenarioSummaries,
  };
}

/**
 * Formats benchmark results as a readable comparison table (strictly free of PII or API keys).
 */
export function formatBenchmarkTable(report) {
  if (report.status === 'skipped') {
    return `[${report.mode.toUpperCase()}] Benchmark skipped: ${report.reason}`;
  }

  const legacy = report.results.legacy.metrics;
  const vercel = report.results.vercelAiSdk.metrics;

  const rows = [
    ['Metric', 'Legacy ProviderClient', 'ServerVercelProviderClient'],
    ['---', '---', '---'],
    ['schemaValidRate (%)', `${legacy.schemaValidRate}%`, `${vercel.schemaValidRate}%`],
    ['factualAccuracy (%)', `${legacy.factualAccuracy}%`, `${vercel.factualAccuracy}%`],
    ['groundedResponseRate (%)', `${legacy.groundedResponseRate}%`, `${vercel.groundedResponseRate}%`],
    ['correctFillCoverage (%)', `${legacy.correctFillCoverage}%`, `${vercel.correctFillCoverage}%`],
    ['incorrectFillRate (%)', `${legacy.incorrectFillRate}%`, `${vercel.incorrectFillRate}%`],
    ['unresolvedRate (%)', `${legacy.unresolvedRate}%`, `${vercel.unresolvedRate}%`],
    ['latencyMs (avg / p50 / p95)', `${legacy.latencyMs.avg} / ${legacy.latencyMs.p50} / ${legacy.latencyMs.p95}`, `${vercel.latencyMs.avg} / ${vercel.latencyMs.p50} / ${vercel.latencyMs.p95}`],
    ['tokens (in / out / total)', `${legacy.tokens.inputTokens} / ${legacy.tokens.outputTokens} / ${legacy.tokens.totalTokens}`, `${vercel.tokens.inputTokens} / ${vercel.tokens.outputTokens} / ${vercel.tokens.totalTokens}`],
    ['httpRequestCount', `${legacy.httpRequestCount}`, `${vercel.httpRequestCount}`],
  ];

  const widths = [0, 1, 2].map((col) => Math.max(...rows.map((r) => r[col].length)));
  const header = `=== Comparative Benchmark (${report.mode.toUpperCase()} mode | model: ${report.model}) ===`;
  const lines = rows.map((r) =>
    r.map((cell, i) => cell.padEnd(widths[i])).join(' | '),
  );
  return [header, ...lines].join('\n');
}

/**
 * Runs the comparative benchmark suite in 'mock' or 'live' mode.
 */
export async function runBenchmarkSuite(options = {}) {
  const mode = options.mode === 'live' ? 'live' : 'mock';
  const scenarios = options.scenarios || loadFixtureScenarios();

  if (mode === 'mock') {
    const baseUrl = options.baseUrl || 'https://mock.benchmark.local/v1';
    const model = options.model || 'mock-gpt-4o-mini';
    const simulateTier1Fallback = Boolean(options.simulateTier1Fallback);

    // 1. Legacy ProviderClient benchmark
    const legacyMock = options.legacyFetchFn
      ? {
          fetchFn: async (u, init) => {
            legacyCalls++;
            return options.legacyFetchFn(u, init);
          },
          getHttpRequestCount: () => legacyCalls,
        }
      : createMockBenchmarkFetch({ simulateTier1Fallback: false, wrapLegacyFences: true });
    let legacyCalls = 0;

    const legacyResult = await evaluateClient(
      'ProviderClient',
      async () => ({
        client: new ProviderClient({
          baseUrl,
          apiKey: 'mock-key',
          model,
          fetchFn: legacyMock.fetchFn,
        }),
        getHttpCount: legacyMock.getHttpRequestCount,
      }),
      scenarios,
      { apiKey: 'mock-key' },
    );

    // 2. ServerVercelProviderClient benchmark
    ServerVercelProviderClient.clearCache();
    let vercelCustomCalls = 0;
    const vercelMock = options.vercelFetchFn
      ? {
          fetchFn: async (u, init) => {
            vercelCustomCalls++;
            return options.vercelFetchFn(u, init);
          },
          getHttpRequestCount: () => vercelCustomCalls,
        }
      : createMockBenchmarkFetch({ simulateTier1Fallback, wrapLegacyFences: false });

    const vercelResult = await evaluateClient(
      'ServerVercelProviderClient',
      async () => ({
        client: new ServerVercelProviderClient({
          baseUrl,
          apiKey: 'mock-key',
          model,
          fetchFn: vercelMock.fetchFn,
        }),
        getHttpCount: vercelMock.getHttpRequestCount,
      }),
      scenarios,
      { apiKey: 'mock-key' },
    );

    return {
      mode: 'mock',
      status: 'completed',
      model,
      simulateTier1Fallback,
      scenarioCount: scenarios.length,
      results: {
        legacy: legacyResult,
        vercelAiSdk: vercelResult,
      },
    };
  }

  // Live mode: load .env, bind via createSafeAgent + createSsrfSafeFetch
  const dotEnv = parseDotEnv(options.envPath);
  const baseUrl =
    options.baseUrl ||
    process.env.AI_PROVIDER_DEFAULT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    dotEnv.AI_PROVIDER_DEFAULT_BASE_URL ||
    dotEnv.OPENAI_BASE_URL ||
    'https://api.openai.com/v1';

  const apiKey =
    options.apiKey ||
    process.env.AI_PROVIDER_DEFAULT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    dotEnv.AI_PROVIDER_DEFAULT_API_KEY ||
    dotEnv.OPENAI_API_KEY ||
    '';

  const model =
    options.model ||
    process.env.AI_PROVIDER_DEFAULT_MODEL ||
    process.env.OPENAI_MODEL ||
    dotEnv.AI_PROVIDER_DEFAULT_MODEL ||
    dotEnv.OPENAI_MODEL ||
    'gpt-4o-mini';

  if (!apiKey || apiKey.trim().length === 0) {
    return {
      mode: 'live',
      status: 'skipped',
      reason: 'No OPENAI_API_KEY or AI_PROVIDER_DEFAULT_API_KEY configured in environment or .env',
      model,
      scenarioCount: scenarios.length,
    };
  }

  let safeAgent;
  try {
    safeAgent = await createSafeAgent(baseUrl);
  } catch (err) {
    return {
      mode: 'live',
      status: 'error',
      reason: redactSecrets(err?.message || String(err), apiKey),
      model,
      scenarioCount: scenarios.length,
    };
  }

  const baseSafeFetch = createSsrfSafeFetch(safeAgent);
  const timeoutMs = options.timeoutMs ?? 25_000;

  let legacyHttpCount = 0;
  const legacyCountingFetch = async (input, init) => {
    legacyHttpCount++;
    return baseSafeFetch(input, init);
  };

  const legacyResult = await evaluateClient(
    'ProviderClient',
    async () => ({
      client: new ProviderClient({
        baseUrl: safeAgent.validatedUrl,
        apiKey,
        model,
        timeoutMs,
        fetchFn: legacyCountingFetch,
      }),
      getHttpCount: () => legacyHttpCount,
    }),
    scenarios,
    { apiKey },
  );

  ServerVercelProviderClient.clearCache();
  let vercelHttpCount = 0;
  const vercelCountingFetch = async (input, init) => {
    vercelHttpCount++;
    return baseSafeFetch(input, init);
  };

  const vercelResult = await evaluateClient(
    'ServerVercelProviderClient',
    async () => ({
      client: new ServerVercelProviderClient({
        baseUrl: safeAgent.validatedUrl,
        apiKey,
        model,
        timeoutMs,
        fetchFn: vercelCountingFetch,
      }),
      getHttpCount: () => vercelHttpCount,
    }),
    scenarios,
    { apiKey },
  );

  return {
    mode: 'live',
    status: 'completed',
    model,
    endpointHost: safeAgent.hostname,
    scenarioCount: scenarios.length,
    results: {
      legacy: legacyResult,
      vercelAiSdk: vercelResult,
    },
  };
}

// CLI entry point
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename)
) {
  const args = new Set(process.argv.slice(2));
  const isLive = args.has('--live');
  const isFallback = args.has('--fallback');

  runBenchmarkSuite({
    mode: isLive ? 'live' : 'mock',
    simulateTier1Fallback: isFallback,
  })
    .then((report) => {
      console.log(formatBenchmarkTable(report));
      if (report.status === 'completed') {
        const legacyErrors = report.results.legacy.errors || [];
        const vercelErrors = report.results.vercelAiSdk.errors || [];
        if (legacyErrors.length > 0 || vercelErrors.length > 0) {
          console.log('\nErrors observed (redacted):');
          for (const e of legacyErrors) {
            console.log(`  [Legacy] ${e.scenarioId} (${e.status} ${e.code}): ${e.message}`);
          }
          for (const e of vercelErrors) {
            console.log(`  [Vercel] ${e.scenarioId} (${e.status} ${e.code}): ${e.message}`);
          }
        }
      } else {
        console.log(`\nStatus: ${report.status}${report.reason ? ` - ${report.reason}` : ''}`);
      }
    })
    .catch((err) => {
      console.error('Benchmark execution failed:', redactSecrets(err?.message || String(err)));
      process.exitCode = 1;
    });
}
