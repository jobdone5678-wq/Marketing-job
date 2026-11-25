const privateQuestion =
  /\b(?:date of birth|birth date|birthday|birth year|dob|password|passcode|social security|ssn|national (?:id|identification)|passport|gender|sex|pronouns?|race|ethnicity|hispanic|latino|veteran|disability|sexual orientation|criminal history|convictions?|marketing|newsletter|consent|certify|attest|signature|terms of (?:service|use)|privacy policy|agree|acknowledg\w*|opt[ -]?in|captcha)\b/i;
const factualQuestion =
  /\b(?:authoriz\w*|sponsor\w*|visa|citizen\w*|work permit|right to work|salary|compensation|pay rate|notice period|start date|available to start|availability|relocat\w*|years?|how many|how long|age|degree|education level|qualifications?|certif\w*|licen[cs]\w*|references?|e-?mail|phone|address|name|location|city|country)\b/i;
const proseQuestion =
  /\b(?:why|describe|tell us|explain|share|summari[sz]e|give an example|cover letter|personal statement|motivation|additional (?:information|comments)|anything else|about yourself|what (?:interests|motivates|excites|makes|would|is your experience))\b/i;

export function isPrivateAutofillField(field: { label?: string; type?: string; name?: string }) {
  const text = `${field.label ?? ''} ${field.name ?? ''}`
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ');
  return (
    /^(?:password|hidden|file|submit|button|reset)$/i.test(field.type ?? '') ||
    privateQuestion.test(text)
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
    !factualQuestion.test(label) &&
    !isPrivateAutofillField({ label }) &&
    !isUrlField({ label })
  );
}
