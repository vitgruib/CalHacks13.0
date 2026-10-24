import type { GrantStatus, Source } from '../db/contract.ts';

// What a source says about one grant right now. null fields mean the source
// doesn't say.
export interface Reading {
  grantId: string;
  source: Source;
  status: GrantStatus | null;
  awarded: number | null;
  paid: number | null;
  endDate: string | null;
  url: string;
}

export interface SourceClient {
  source: Source;
  // Resolves to null when the source has no record of the grant. Looks up
  // only the grant asked for: never the whole dataset.
  read(grantId: string): Promise<Reading | null>;
  // Optional: runs once before the reads of a check a person or agent asked
  // for (reason 'check_now' or 'before_money_moves'), e.g. to start a fresh
  // scraper run. Never throws; resolves to a note for the check's log line.
  beforeCheck?(reason: string): Promise<string | undefined>;
}
