import { applicationUrlKey } from '../jobs/application-state';

const confirmationHeading =
  /^(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:(?:successfully )?(?:submitted|received|sent|confirmed)|successful)|successfully submitted (?:your |the )?application|submission (?:received|confirmed|successful)|(?:we|we've) (?:have )?received your application|(?:you(?: have|'ve) )?successfully applied|(?:you (?:have )?|you've )?applied successfully)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i;
const confirmationPath =
  /\/(?:confirmation|thank[-_]?you|thankyou|thanks|applied|application[-_](?:submitted|success)|submission[-_]success|success|submitted)\/?$/i;
const pathEvidencePrefix = 'URL confirmation path: ';

function withoutRedundantGreenhouseId(key: string) {
  const url = new URL(key);
  if (url.hostname !== 'boards.greenhouse.io' || url.hash) return key;
  const postingId = url.pathname.match(/^\/[^/]+\/jobs\/(\d+)$/)?.[1];
  const queryIds = url.searchParams.getAll('gh_jid');
  if (!postingId || !queryIds.length || queryIds.some((id) => id !== postingId)) return key;
  url.searchParams.delete('gh_jid');
  return url.href;
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
    if (withoutRedundantGreenhouseId(observedKey) === withoutRedundantGreenhouseId(expectedKey))
      return true;

    // Some ATSs show a shared receipt on the same site and omit the posting ID.
    // Require a success message there, and keep any board prefix tied to the launch URL.
    if (
      current.origin !== expected.origin ||
      new URL(expectedKey).hash ||
      new URL(observedKey).hash ||
      !['confirmed', 'submitted'].includes(status || '') ||
      !confirmationHeading.test(evidence.trim()) ||
      !confirmationPath.test(current.pathname) ||
      new URL(observedKey).search
    )
      return false;
    const receiptPrefix = current.pathname.replace(confirmationPath, '');
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
      confirmationPath.test(text.slice(pathEvidencePrefix.length))
    )
      return true;
    return false;
  }
  if (status === 'failed')
    return /required|invalid|unable to submit|submission failed|error/i.test(evidence);
  return ['in_progress', 'submit_attempted'].includes(status);
}
