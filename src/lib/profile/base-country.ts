export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const regions = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

export function baseCountry(explicit: unknown, location: unknown, state?: unknown): string | undefined {
  const label = (value: string) => {
    if (/^(?:usa|u\.s\.a?\.?|united states of america)$/i.test(value)) return 'United States';
    if (/^(?:uk|u\.k\.|great britain)$/i.test(value)) return 'United Kingdom';
    if (/^uae$/i.test(value)) return 'United Arab Emirates';
    return /^[a-z]{2}$/i.test(value) ? regions.of(value.toUpperCase()) : value;
  };
  if (typeof explicit === 'string' && explicit.trim()) return label(explicit.trim());
  if (typeof location !== 'string') return undefined;

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean);
  const last = parts.at(-1);
  if (parts.length < 2 || !last) return undefined;
  if (parts.length === 2 && US_STATE_CODES.has(last) &&
      (last === state || !regions.of(last))) return 'United States';

  const country = label(last);
  if (country !== last) return country;
  // Recognize a country name in the address without interpreting other suffixes as countries.
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const name = regions.of(String.fromCharCode(first, second));
      if (name?.toLowerCase() === last.toLowerCase()) return name;
    }
  }
  return undefined;
}
