/**
 * FreeHire AI Autofill Engine: Combobox Option Selector
 *
 * Ports FreeHire Choose algorithm to TypeScript:
 * - Reads live options captured from DOM combobox widgets
 * - Constrains LLM to selecting an exact option from offered list
 * - Rejects unoffered or hallucinated choices
 * - Rejects choices contradicting candidate verified facts (e.g. visa sponsorship negation)
 * - Returns choice: null when profile does not answer the question
 *
 * Attribution: Based on strelov1/freehire@2843637c09fb818fb64d4e7979638ff350b500c7 (MIT License)
 */

import type { VerifiedFact } from './verified-facts';
import { uniqueConfirmedChoice, validateGroundedAnswer } from './grounded';
import type { ProviderClient, TokenUsageTelemetry } from './provider-client';
import { type Field, inferQuestionDescriptor } from './planner';

export interface ChooseResult {
  choice: string | null;
  evidenceIds?: string[];
  reason?: string;
  telemetry?: {
    usage?: TokenUsageTelemetry;
    durationMs?: number;
  };
}

const CHOOSE_PROMPT = `You are answering ONE question on a job-application form by
picking from the options it offers.

You are given the question, the exact options available, and the candidate's
profile. Pick the single option the profile supports.

Rules:
- Return an option copied exactly from the list. Never return anything else.
- If the profile does not answer the question, return an empty choice —
  declining is the correct answer whenever nothing in the profile supports any
  of the options.
- A location option is supported by the candidate's location (a profile of
  "Berlin, Germany" supports the option "Germany"). A visa-sponsorship,
  notice-period, salary or relocation option is supported when the profile
  states the matching field (visa_sponsorship_needed, notice_period,
  desired_salary, willing_to_relocate) and that value is consistent with the
  option.
- Never infer a claim the profile does not state.

Respond with JSON: {"choice":"..."}`;

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
 * Chooses an exact option from live DOM captured combobox options.
 */
export async function chooseComboboxOption(
  question: Field,
  options: string[],
  facts: Map<string, VerifiedFact>,
  client: ProviderClient,
): Promise<ChooseResult> {
  if (!options || options.length === 0) {
    return { choice: null, reason: 'No options provided' };
  }

  const descriptor = inferQuestionDescriptor(question);
  const confirmed = uniqueConfirmedChoice(options, facts, descriptor);
  if (confirmed) return confirmed;

  const profile = factsToProfileObject(facts);

  const userPayload = {
    question: question.label,
    required: !!question.required,
    options,
    profile,
  };

  const messages = [
    { role: 'system' as const, content: CHOOSE_PROMPT },
    { role: 'user' as const, content: JSON.stringify(userPayload) },
  ];

  const completion = await client.generateChatCompletion(messages, {
    responseFormat: 'json_prompt',
    schemaName: 'choose',
  });

  const telemetry =
    completion.usage !== undefined || completion.durationMs !== undefined
      ? {
          ...(completion.usage !== undefined ? { usage: completion.usage } : {}),
          ...(completion.durationMs !== undefined ? { durationMs: completion.durationMs } : {}),
        }
      : undefined;
  const telemetryField = telemetry !== undefined ? { telemetry } : {};

  const parsed = completion.rawJson || {};
  const rawChoice = typeof parsed.choice === 'string' ? parsed.choice.trim() : '';

  if (!rawChoice) {
    return {
      choice: null,
      reason: 'Model declined to answer or profile lacks support',
      ...telemetryField,
    };
  }

  // Find exact matching option in the offered options list (case-insensitive / trimmed)
  const matchingOptions = options.filter((opt) => opt.trim().toLowerCase() === rawChoice.toLowerCase());
  const matchedOption = matchingOptions.length === 1 ? matchingOptions[0] : undefined;

  if (!matchedOption) {
    return {
      choice: null,
      reason: `Model choice "${rawChoice}" did not identify a unique offered option`,
      ...telemetryField,
    };
  }

  // Validate that the choice is grounded in candidate facts
  const grounding = validateGroundedAnswer(matchedOption, facts, descriptor);

  if (!grounding.valid || grounding.action === 'skip') {
    return {
      choice: null,
      reason: grounding.reason || `Choice "${matchedOption}" is not grounded in verified facts`,
      ...telemetryField,
    };
  }

  return {
    choice: matchedOption,
    evidenceIds: grounding.evidenceIds,
    ...telemetryField,
  };
}
