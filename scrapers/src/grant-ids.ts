// NIH grant numbers. A full number like "1R01GM000001-01" or
// "3K99DK136503-02S1" is: application type (1 digit, optional), activity code
// (3 chars, e.g. R01, K99, UE5), institute (2 letters), serial (6 digits),
// then "-" + support year and an optional suffix (S1 supplement, A1 amended).
// The core project number (R01GM000001) is what stays the same across years,
// so it's how the lab's grants are matched.

const FULL_NUMBER = /^(?:\d)?([A-Z][A-Z0-9]{2})([A-Z]{2})(\d{6})(?:-(\d{2})([A-Z]\d+)?)?$/;

export interface ParsedGrantNumber {
  core: string; // R01GM000001
  supplement: string | null; // "S1" for 3K99DK136503-02S1, else null
}

export function parseGrantNumber(raw: string | null | undefined): ParsedGrantNumber | null {
  if (typeof raw !== 'string') return null;
  const text = raw.toUpperCase().replace(/\s+/g, '');
  const match = FULL_NUMBER.exec(text);
  if (!match) return null;
  const [, activity, institute, serial, , suffix] = match;
  return { core: activity + institute + serial, supplement: suffix?.startsWith('S') ? suffix : null };
}

/** "1R01GM000001-01" → "R01GM000001"; null when it isn't an NIH grant number. */
export function coreProjectNumber(raw: string | null | undefined): string | null {
  return parseGrantNumber(raw)?.core ?? null;
}

/** The lab's grant IDs from a comma-separated list, normalized; unreadable entries are dropped. */
export function parseGrantList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[,;\n]+/).map(coreProjectNumber).filter((id): id is string => id !== null))];
}
