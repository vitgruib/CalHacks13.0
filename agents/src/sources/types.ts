import type { Source, SourceReadingRow } from '../db/contract.ts';

// What a source says about one grant right now. null fields mean the source
// doesn't say.
export type Reading = Omit<SourceReadingRow, 'id' | 'fetchedAt'>;

export interface SourceClient {
  source: Source;
  // Resolves to null when the source has no record of the grant. Looks up
  // only the grant asked for: never the whole dataset.
  read(grantId: string): Promise<Reading | null>;
}
