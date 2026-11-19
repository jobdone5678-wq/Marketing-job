import { applicationConfirmationPath, applicationUrlKey } from '../jobs/application-state';

const confirmationHeading =
  /^(?:thank you for (?:applying|your application|submitting your application)|(?:your )?(?:job )?application (?:has been |was |is )?(?:(?:successfully )?(?:submitted|received|sent|confirmed)|successful)|(?:(?:you (?:have )?|you've )?successfully submitted|(?:you (?:have )?|you've )submitted) (?:your |the )?(?:job )?application|submission (?:received|confirmed|successful)|(?:we(?: have|'ve)?) (?:successfully )?received your application|(?:you(?: have|'ve) )?successfully applied|(?:you (?:have )?|you've )?applied successfully)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i;
const pathEvidencePrefix = 'URL confirmation path: ';

function withoutRedundantPostingIds(key: string) {
  const url = new URL(key);
  if (!url.search || url.hash) return key;
  const postingId = url.pathname.split('/').at(-1);
  if (!postingId || !/^[\w-]*\d[\w-]*$/.test(postingId)) return key;
  const params = url.searchParams;
  for (const name of new Set(params.keys())) {
    if (name !== 'for' && name !== 'token' && params.getAll(name).every((id) => id === postingId))
      params.delete(name);
  }
  return url.origin + url.pathname + url.search;
}

export function allowedCaptureUrl(
  observed: string,
  application: string,
  status?: string,
  evidence = ''
) {
  try {
    const current = new URL(observed),
      expected = new URL(application);
    if (
      current.protocol !== 'https:' ||
      expected.protocol !== 'https:' ||
      current.username ||
      current.password
    )
      return false;
    if (
      evidence.startsWith(pathEvidencePrefix) &&
      evidence.slice(pathEvidencePrefix.length) !== current.pathname.toLowerCase()
    )
      return false;
    const observedKey = applicationUrlKey(observed),
      expectedKey = applicationUrlKey(application);
    if (!observedKey || !expectedKey) return false;
    if (withoutRedundantPostingIds(observedKey) === withoutRedundantPostingIds(expectedKey))
      return true;

    // Some ATSs show a shared receipt on the same site and omit the posting ID.
    // Require a success message there, and keep any board prefix tied to the launch URL.
    if (
      new URL(observedKey).origin !== new URL(expectedKey).origin ||
      new URL(expectedKey).hash ||
      new URL(observedKey).hash ||
      !['confirmed', 'submitted'].includes(status || '') ||
      !confirmationHeading.test(evidence.trim()) ||
      !applicationConfirmationPath.test(current.pathname) ||
      new URL(observedKey).search
    )
      return false;
    const receiptPrefix = current.pathname.replace(applicationConfirmationPath, '');
    const postingPath = new URL(expectedKey).pathname;
    return !receiptPrefix || postingPath.startsWith(receiptPrefix + '/');
  } catch {
    return false;
  }
}
export function validateObservation(status: string, evidence: string) {
  if (status === 'started') return false;
  if (status === 'submitted' || status === 'confirmed') {
    const text = evidence.replace(/\s+/g, ' ').trim();
    if (
      /\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(
        text
      )
    )
      return false;
    if (confirmationHeading.test(text)) return true;
    if (
      text.startsWith(pathEvidencePrefix) &&
      applicationConfirmationPath.test(text.slice(pathEvidencePrefix.length))
    )
      return true;
    return false;
  }
  if (status === 'failed')
    return /required|invalid|unable to submit|submission failed|error/i.test(evidence);
  return ['in_progress', 'submit_attempted'].includes(status);
}
