/**
 * FreeHire AI Autofill Engine: Batch Form Planner
 *
 * Ports FreeHire Plan algorithm to TypeScript with:
 * - 4-6 question batching
 * - Surrounding neighbor question context preservation
 * - Previously resolved field context across batches
 * - Strictly typed grounding validation (rejecting ungrounded fills)
 * - Combobox widget deferral for interactive Choose step
 *
 * Attribution: Based on strelov1/freehire@2843637c09fb818fb64d4e7979638ff350b500c7 (MIT License)
 */

import type { VerifiedFact } from './verified-facts.ts';
import { validateGroundedAnswer } from './grounded.ts';
import type { ProviderClient } from './provider-client.ts';

export interface Field {
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  combo?: boolean;
  options?: string[];
  frame?: number;
  form?: number;
  id?: string;
  name?: string;
}

export interface Fill {
  label: string;
  value: string;
  frame?: number;
  form?: number;
  fieldId?: string;
  evidenceIds?: string[];
  grounded?: boolean;
}

export interface FormContext {
  pageTitle?: string;
  jobTitle?: string;
  company?: string;
  url?: string;
  batchSize?: number;
  previouslyResolved?: Record<string, string>;
}

export interface PlanResult {
  fills: Fill[];
  unmapped: string[];
  deferred: string[];
  batchCount: number;
}

const SYSTEM_PROMPT = `You map a candidate's profile onto a job-application form.

You are given the form's fields (each with its label, type, and whether it is a
custom-widget combobox) and the candidate's profile. Return the values to write.

Rules:
- Only use values present in the profile. If a field has no basis in the profile,
  leave it out. Never invent, guess, or write a placeholder.
- Where "combo" is true the field is a custom dropdown whose options are not
  visible yet. Include it, with an empty value, only if you expect the profile to
  answer it; the real options will be read from the page and you will be asked to
  pick one. Leave it out entirely if the profile plainly cannot answer it.
- For a native select, the value must be one of its listed options exactly.
- For a checkbox, the value is "true" or "false". A field carrying "options" is a
  group of checkboxes: the value is one of those options, or several separated by
  commas.
- A field may take part of a profile value (e.g. the city out of a location).
- Address each field by its label, copied exactly as given.

Respond with JSON: {"fills":[{"label":"...","value":"..."}]}`;

/**
 * Formats VerifiedFact Map into a plain object for prompt serialization.
 */
function factsToProfileObject(facts: Map<string, VerifiedFact>): Record<string, any> {
  const profile: Record<string, any> = {};
  for (const [id, fact] of facts.entries()) {
    profile[id] = fact.value;
  }
  return profile;
}

/**
 * Infers canonical metadata from field label to aid typed grounding validation.
 */
export function inferQuestionDescriptor(field: Field): {
  id?: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  canonical_name: string;
  category: string;
} {
  const label = field.label || '';
  const norm = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  let canonical = '';
  let category = '';

  if (/\b(first\s*name|last\s*name|full\s*name|legal\s*name|candidate\s*name|your\s*name)\b/.test(norm)) {
    canonical = 'name';
    category = 'personal';
  } else if (/\b(email|email\s*address)\b/.test(norm)) {
    canonical = 'email';
    category = 'contact';
  } else if (/\b(phone|mobile|cell|telephone)\b/.test(norm)) {
    canonical = 'phone';
    category = 'contact';
  } else if (/\b(city|current\s*city)\b/.test(norm)) {
    canonical = 'city';
    category = 'location';
  } else if (/\b(state|province|region)\b/.test(norm)) {
    canonical = 'state';
    category = 'location';
  } else if (/\b(country|residence|nation)\b/.test(norm)) {
    canonical = 'country';
    category = 'location';
  } else if (/\b(zip|postal|postcode|zipcode)\b/.test(norm)) {
    canonical = 'postal_code';
    category = 'location';
  } else if (/\b(address|street)\b/.test(norm)) {
    canonical = 'full_address';
    category = 'location';
  } else if (/\b(linkedin)\b/.test(norm)) {
    canonical = 'linkedin_url';
    category = 'contact';
  } else if (/\b(github)\b/.test(norm)) {
    canonical = 'github_url';
    category = 'contact';
  } else if (/\b(website|portfolio)\b/.test(norm)) {
    canonical = 'website';
    category = 'contact';
  } else if (/\b(sponsor|visa)\b/.test(norm)) {
    canonical = 'needs_sponsorship';
    category = 'work_auth';
  } else if (/\b(authoriz|authorized|legal\s*right\s*to\s*work)\b/.test(norm)) {
    canonical = 'authorized_in_usa';
    category = 'work_auth';
  } else if (/\b(years?\s*of\s*experience|total\s*experience|experience\s*years)\b/.test(norm)) {
    canonical = 'total_experience_years';
    category = 'experience';
  } else if (/\b(degree|education|highest\s*qualification|highest\s*education)\b/.test(norm)) {
    canonical = 'highest_qualification';
    category = 'education';
  } else if (/\b(certifi|license)\b/.test(norm)) {
    canonical = 'certifications';
    category = 'certification';
  } else {
    canonical = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    id: field.id,
    label: field.label,
    type: field.type,
    options: field.options,
    required: field.required,
    canonical_name: canonical,
    category,
  };
}

/**
 * Plans form fill values in batches of 4-6 questions while preserving neighbor context.
 */
export async function planFormBatch(
  fields: Field[],
  facts: Map<string, VerifiedFact>,
  client: ProviderClient,
  context?: FormContext,
): Promise<PlanResult> {
  if (!fields || fields.length === 0) {
    return { fills: [], unmapped: [], deferred: [], batchCount: 0 };
  }

  // Batch size: 4-6 questions (default 5)
  const batchSize = Math.max(4, Math.min(6, context?.batchSize ?? 5));
  const batchCount = Math.ceil(fields.length / batchSize);

  const profile = factsToProfileObject(facts);
  const previouslyResolved: Record<string, string> = {
    ...(context?.previouslyResolved || {}),
  };

  const allFills: Fill[] = [];
  const deferredSet = new Set<string>();

  for (let i = 0; i < batchCount; i++) {
    const start = i * batchSize;
    const end = Math.min(fields.length, start + batchSize);
    const targetFields = fields.slice(start, end);

    // Neighbor fields: surrounding fields in the form outside this batch
    const neighborFields = fields
      .filter((_, idx) => idx < start || idx >= end)
      .map((f) => ({
        label: f.label,
        type: f.type || 'text',
        required: !!f.required,
        combo: !!f.combo,
      }));

    const userPayload = {
      fields: targetFields.map((f) => ({
        label: f.label,
        type: f.type || 'text',
        required: !!f.required,
        combo: !!f.combo,
        options: f.options,
      })),
      fieldsToFill: targetFields.map((f) => ({
        label: f.label,
        type: f.type || 'text',
        required: !!f.required,
        combo: !!f.combo,
        options: f.options,
      })),
      neighborFields,
      neighbors: neighborFields,
      previouslyResolved: { ...previouslyResolved },
      context: {
        jobTitle: context?.jobTitle,
        company: context?.company,
        url: context?.url,
        previouslyResolved: { ...previouslyResolved },
      },
      profile,
    };

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: JSON.stringify(userPayload, null, 2) },
    ];

    const completion = await client.generateChatCompletion(messages, {
      responseFormat: 'json_object',
    });

    const parsed = completion.rawJson || {};
    const fillsRaw = Array.isArray(parsed.fills) ? parsed.fills : [];

    for (const rawFill of fillsRaw) {
      if (!rawFill || typeof rawFill.label !== 'string') continue;
      const targetField = targetFields.find(
        (f) => f.label.trim().toLowerCase() === rawFill.label.trim().toLowerCase(),
      );
      if (!targetField) continue;

      const fillValue = typeof rawFill.value === 'string' ? rawFill.value : String(rawFill.value ?? '');

      // Check for combo deferral: combo field with empty value
      if (targetField.combo && fillValue.trim() === '') {
        deferredSet.add(targetField.label);
        previouslyResolved[targetField.label] = '[deferred combobox]';
        continue;
      }

      // If value is non-empty, run question-specific grounding check
      if (fillValue.trim() !== '') {
        const descriptor = inferQuestionDescriptor(targetField);
        const grounding = validateGroundedAnswer(fillValue, facts, descriptor);

        if (grounding.valid && grounding.action !== 'skip') {
          allFills.push({
            label: targetField.label,
            value: fillValue,
            frame: targetField.frame,
            form: targetField.form,
            fieldId: targetField.id,
            evidenceIds: grounding.evidenceIds,
            grounded: true,
          });
          previouslyResolved[targetField.label] = fillValue;
        }
      }
    }
  }

  const filledLabels = new Set(allFills.map((f) => f.label));
  const deferred = Array.from(deferredSet);

  const unmapped = fields
    .filter((f) => !filledLabels.has(f.label) && !deferredSet.has(f.label))
    .map((f) => f.label);

  return {
    fills: allFills,
    unmapped,
    deferred,
    batchCount,
  };
}
