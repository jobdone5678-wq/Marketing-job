import { demographicOptionKey, isDemographicQuestion } from '../../src/lib/profile/demographic-preferences';

const privateQuestion =
  /\b(?:date of birth|birth date|birthday|birth year|dob|password|passcode|social security|ssn|national (?:id|identification)|passport|gender|sex|pronouns?|race|ethnicity|hispanic|latino|veteran|disability|sexual orientation|criminal history|convictions?|marketing|newsletter|consent|certify|attest|signature|terms of (?:service|use)|privacy policy|agree|acknowledg\w*|opt[ -]?in|captcha)\b/i;
const blockedQuestion =
  /\b(?:date of birth|birth date|birthday|birth year|dob|password|passcode|social security|ssn|national (?:id|identification)|passport|criminal history|convictions?|marketing|newsletter|sms|consent|certify|attest\w*|signature|terms of (?:service|use)|privacy policy|agree|acknowledg\w*|opt[ -]?in|captcha|contact me about future (?:job |career )?opportunities)\b/i;
const manualChoice = /\b(?:age (?:range|group)|demographics?|self identif(?:y|ication)|contact me about future (?:job |career )?opportunities)\b/i;
const factualQuestion =
  /\b(?:authoriz\w*|sponsor\w*|visa|citizen\w*|work permit|right to work|salary|compensation|pay rate|notice period|start date|available to start|availability|relocat\w*|years?|how many|how long|age|degree|education level|qualifications?|certif\w*|licen[cs]\w*|references?|e-?mail|phone|address|name|location|city|country)\b/i;
const directFactualQuestion =
  /^(?:how many|how much|what (?:is|are) your (?:desired|expected|current|target)?\s*(?:salary|compensation|pay|notice|years|age|degree|name|email|phone|address|city|state|country|postal|zip|location)|when (?:can|are) you available|are you (?:legally |currently )?(?:authorized|eligible|willing|at least|18)|will you (?:now or in the future )?require)/i;
const proseQuestion =
  /\b(?:why|describe|tell us|explain|share|summari[sz]e|give an example|walk (?:us|me) through|elaborate|discuss|cover letter|personal statement|motivation|additional (?:information|comments)|anything else|about yourself|approach afterward|what (?:interests|motivates|excites|makes|would|was|is your experience)|how (?:did|have|would) you)\b/i;
const strongProseCue =
  /\b(?:describe|tell us|explain|give an example|walk (?:us|me) through|elaborate|cover letter|personal statement|motivation|about yourself|approach afterward|why (?:do|are|would) you|how (?:did|have|would) you)\b/i;

function fieldSafetyText(field: { label?: string; name?: string; options?: readonly string[] }): string {
  return [field.label, field.name, ...(field.options ?? [])]
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ');
}

export function isBlockedAutofillField(field: { label?: string; type?: string; name?: string; options?: readonly string[] }): boolean {
  const text = fieldSafetyText(field);
  return (
    /^(?:password|hidden|file|submit|button|reset)$/i.test(field.type ?? '') ||
    blockedQuestion.test(text)
  );
}

export function isPrivateAutofillField(field: { label?: string; type?: string; name?: string; options?: readonly string[] }) {
  const text = fieldSafetyText(field);
  return (
    /^(?:password|hidden|file|submit|button|reset)$/i.test(field.type ?? '') ||
    privateQuestion.test(text) || manualChoice.test(text) || isDemographicQuestion(text) ||
    ((field.type === 'checkbox' || field.type === 'radio') && Boolean(demographicOptionKey(field.label ?? '')))
  );
}

export function isUrlField(field: { label?: string; type?: string; id?: string }) {
  return (
    field.type === 'url' ||
    /\b(?:urls?|linked[ -]?in|github|gitlab|bitbucket|website|web site|portfolio|profile link|social media link)\b/i.test(
      `${field.label ?? ''} ${field.id ?? ''}`.replace(/[_-]/g, ' ')
    )
  );
}

export function isAutofillProse(label: string) {
  return (
    proseQuestion.test(label) &&
    !directFactualQuestion.test(label.trim()) &&
    (!factualQuestion.test(label) || strongProseCue.test(label)) &&
    !isPrivateAutofillField({ label }) &&
    !isUrlField({ label })
  );
}
