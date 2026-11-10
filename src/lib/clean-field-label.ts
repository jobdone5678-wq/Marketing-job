/**
 * Sanitizes raw ATS form labels into clear, human-readable question/field titles.
 *
 * Strips:
 * - System field keys (e.g. `_systemfield_name`)
 * - ATS UUIDs and hash identifiers
 * - Placeholder hints (e.g. `Type here...`, `Pick date...`, `Start typing...`, `hello@example.com...`)
 * - Consecutive duplicated words (e.g. `Name Name` -> `Full Name`, `Phone number Phone number` -> `Phone Number`)
 * - Preserves intact questions (ending in `?`)
 */
export function cleanFieldLabel(rawLabel: string, key?: string): string {
  let text = String(rawLabel || '').trim();

  // 1. Strip system field prefixes, UUIDs, hex tokens, and data attribute identifiers
  text = text.replace(/_systemfield_\w+/gi, ' ');
  text = text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ' ');
  text = text.replace(/\b[0-9a-f]{16,}\b/gi, ' ');

  // 2. Strip placeholder hints like 'Type here...', 'hello@example.com...', 'Pick date...', etc.
  text = text.replace(/\b(type\s*here|start\s*typing|pick\s*date|select|choose|enter\s*here|e\.g\.)\b\.*/gi, ' ');
  text = text.replace(/hello@example\.com\.*/gi, ' ');
  text = text.replace(/1-415-555-1234\.*/gi, ' ');
  text = text.replace(/https?:\/\/\S+/gi, ' ');

  // 3. Extract question if present (e.g. 'What is the earliest date you could start working on this project?')
  const qMatch = text.match(/([A-Z0-9][^?]*\?)/i);
  if (qMatch) {
    const q = qMatch[1].trim().replace(/\s+/g, ' ');
    if (q.length > 5) return q;
  }

  // 4. Remove punctuation artifacts
  text = text.replace(/[\*\:…\.\,\_]+/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();

  // 5. Deduplicate repeated words (e.g. 'Name Name' -> 'Name', 'Phone number Phone number' -> 'Phone number')
  const words = text.split(' ').filter(Boolean);
  const uniqueWords: string[] = [];
  for (const w of words) {
    if (!uniqueWords.some(u => u.toLowerCase() === w.toLowerCase())) {
      uniqueWords.push(w);
    }
  }
  const deduped = uniqueWords.join(' ');

  // 6. Common field canonical mappings
  const lower = deduped.toLowerCase();
  const keyLower = String(key || '').toLowerCase();

  if (/^(full\s*)?name$/i.test(lower) || /^(full_?name|name)$/i.test(keyLower)) {
    return 'Full Name';
  }
  if (/^first\s*name$/i.test(lower) || /first_?name/i.test(keyLower)) {
    return 'First Name';
  }
  if (/^last\s*name$/i.test(lower) || /last_?name/i.test(keyLower)) {
    return 'Last Name';
  }
  if (lower.includes('email') || keyLower.includes('email')) {
    return 'Email Address';
  }
  if (lower.includes('phone') || lower.includes('mobile') || keyLower.includes('phone') || keyLower.includes('mobile')) {
    return 'Phone Number';
  }
  if (lower === 'location' || lower.includes('city') || keyLower.includes('location') || keyLower.includes('city')) {
    return 'Location';
  }
  if (lower.includes('linkedin') || keyLower.includes('linkedin')) {
    return 'LinkedIn Profile';
  }
  if (lower.includes('github') || keyLower.includes('github')) {
    return 'GitHub Profile';
  }
  if (lower.includes('portfolio') || lower.includes('website') || keyLower.includes('portfolio') || keyLower.includes('website')) {
    return 'Portfolio / Website';
  }
  if (lower.includes('salary') || lower.includes('compensation') || keyLower.includes('salary') || keyLower.includes('compensation')) {
    return 'Desired Salary / Compensation';
  }

  if (deduped.length >= 2) {
    if (deduped.length <= 50) {
      return deduped.replace(/\b\w/g, c => c.toUpperCase());
    }
    return deduped.charAt(0).toUpperCase() + deduped.slice(1);
  }

  if (key) {
    const cleanKey = key.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    if (cleanKey && cleanKey.length > 1) return cleanKey;
  }

  return rawLabel || 'Field';
}
