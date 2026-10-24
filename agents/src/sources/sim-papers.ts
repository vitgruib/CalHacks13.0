// The sim world's public record for its made-up papers. sim/seed.json lists
// papers under Crossref's test prefix (10.5555/...), which no registry knows,
// so this answers lookup() for those DOIs from the seed's own paper facts
// (which grant the acknowledgments name, the PMCID, any correction notice)
// and hands every other DOI to the real Crossref/PubMed client. The report
// checker then reads a sim paper and a real one the same way.
//
// Only public facts come from here. Whether the lab's report already
// discloses a correction is the report's business (reportPaper.correction
// .disclosed), not the registry's, so it is left out.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { normalizeGrantNumber, type PaperLookup, type PaperRecord, type PaperUpdate } from './papers.ts';

export interface SimPaper {
  doi: string;
  title: string;
  // The grant the paper's acknowledgments name.
  creditsGrantId: string;
  pmcid?: string;
  // The correction or retraction notice on record, in the seed's words.
  correction?: { kind: string; note: string };
}

export interface SimPaperLookupOptions {
  // Asked for every DOI the sim world doesn't know.
  real: PaperLookup;
  // Defaults to the papers in sim/seed.json.
  papers?: SimPaper[];
}

const SIM_SEED = fileURLToPath(new URL('../../../sim/seed.json', import.meta.url));

// Lower case, without a doi.org prefix, as Crossref keys DOIs.
const doiKey = (doi: string) =>
  doi
    .trim()
    .replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '')
    .toLowerCase();

export function simPapersFromSeed(seedJson: string): SimPaper[] {
  const seed = JSON.parse(seedJson) as { papers?: Array<SimPaper & { correction?: { kind: string; note: string; disclosed?: boolean } }> };
  return (seed.papers ?? []).map(({ doi, title, creditsGrantId, pmcid, correction }) => ({
    doi,
    title,
    creditsGrantId,
    pmcid,
    correction: correction ? { kind: correction.kind, note: correction.note } : undefined,
  }));
}

function seedPapers(): SimPaper[] {
  try {
    return simPapersFromSeed(readFileSync(SIM_SEED, 'utf8'));
  } catch {
    // A worker deployed without sim/ still checks real papers.
    return [];
  }
}

// "Correction (2026-03-02): what changed" becomes a dated notice whose title
// is what changed, the shape a real notice arrives in.
const NOTICE_HEAD = /^(?:correction|retraction|retracted|expression of concern)\s*\(?(\d{4}-\d{2}-\d{2})\)?\s*:?\s*/i;

function noticeOf(correction: { kind: string; note: string }): PaperUpdate {
  const head = NOTICE_HEAD.exec(correction.note);
  const date = head?.[1] ?? /\d{4}-\d{2}-\d{2}/.exec(correction.note)?.[0] ?? null;
  return {
    kind: correction.kind === 'retraction' ? 'retraction' : 'correction',
    noticeDoi: null,
    noticePmid: null,
    title: (head ? correction.note.slice(head[0].length) : correction.note).trim() || null,
    date,
    source: 'Crossref',
    via: 'sim world',
  };
}

function recordOf(paper: SimPaper): PaperRecord {
  return {
    doi: doiKey(paper.doi),
    title: paper.title,
    pmid: null,
    pmcid: paper.pmcid ?? null,
    grantsCredited: [normalizeGrantNumber(paper.creditsGrantId) ?? paper.creditsGrantId],
    otherAwards: [],
    updates: paper.correction ? [noticeOf(paper.correction)] : [],
    urls: [`sim/seed.json (${doiKey(paper.doi)})`],
  };
}

const SIM_LOOKUPS = new WeakSet<PaperLookup>();

// True for a lookup made here, so the report checker doesn't wrap one twice.
export const isSimPaperLookup = (lookup: PaperLookup): boolean => SIM_LOOKUPS.has(lookup);

export function createSimPaperLookup({ real, papers = seedPapers() }: SimPaperLookupOptions): PaperLookup {
  const byDoi = new Map(papers.map((paper) => [doiKey(paper.doi), paper]));
  const lookup: PaperLookup = {
    async lookup(doi) {
      const paper = byDoi.get(doiKey(doi));
      return paper ? recordOf(paper) : real.lookup(doi);
    },
    grantPublications: (grant) => real.grantPublications(grant),
  };
  SIM_LOOKUPS.add(lookup);
  return lookup;
}
