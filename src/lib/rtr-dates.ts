// Agreement dates come from OCR, from a recruiter typing them in, and from legacy rows. The
// database columns are DATE, so anything that is not a real `YYYY-MM-DD` value makes the whole
// insert fail (`invalid input syntax for type date`). The OCR fallback used to return the raw
// text it found in the document ("11/09/2026", "Nov 9, 2026"), which is why uploading an
// agreement could silently fail to save.

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * Normalise any human readable date into `YYYY-MM-DD`. Returns `null` when the value cannot be
 * understood so callers can fall back to a safe default instead of writing a broken date.
 */
export function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // 2026-11-09 / 2026-11-09T10:00:00Z
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (isRealDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }

  // 11/09/2026, 11-09-26, 11.09.2026
  const numeric = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (isRealDate(year, month, day)) return `${year}-${pad(month)}-${pad(day)}`;
  }

  // Nov 9, 2026 / November 9 2026 / 9 Nov 2026
  const monthFirst = raw.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = Number(monthFirst[3]);
    if (month !== undefined && isRealDate(year, month, day)) {
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
  }

  const dayFirst = raw.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const day = Number(dayFirst[1]);
    const year = Number(dayFirst[3]);
    if (month !== undefined && isRealDate(year, month, day)) {
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
  }

  // 2026 Nov 9
  const yearFirst = raw.match(/^(\d{4})\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})$/);
  if (yearFirst) {
    const month = MONTHS[yearFirst[2].toLowerCase()];
    const day = Number(yearFirst[3]);
    const year = Number(yearFirst[1]);
    if (month !== undefined && isRealDate(year, month, day)) {
      return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
  }

  return null;
}

/** Today in `YYYY-MM-DD` using the server's local calendar day. */
export function todayIsoDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
