// submission_date is a calendar date; do not shift it through UTC/local time conversion.
export function inSubmissionDateRange(value: string | null | undefined, from: string, to: string) {
  if (from && to && from > to) return false;
  if (!from && !to) return true;
  const date = value?.slice(0, 10);
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to));
}

export function dailySubmissionCounts(rows: { submission_date?: string | null }[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const date = row.submission_date?.slice(0, 10);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) counts.set(date, (counts.get(date) || 0) + 1);
  }
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) => b.date.localeCompare(a.date));
}

export function submissionDatePreset(preset: 'today' | 'week' | 'month', now = new Date()) {
  const localDate = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'week') start.setDate(start.getDate() - 6);
  if (preset === 'month') start.setDate(1);
  return { from: localDate(start), to: localDate(now) };
}
