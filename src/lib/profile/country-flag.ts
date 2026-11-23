export function getCountryFlagUrl(code?: string | null): string {
  if (!code) return '';
  const clean = code.trim().toLowerCase();
  if (!clean) return '';
  return `https://hatscripts.github.io/circle-flags/flags/${clean}.svg`;
}
