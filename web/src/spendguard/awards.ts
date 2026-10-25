// Synthetic award documents for SpendGuard's demo: the funded aims, the
// approved experimental models and the award terms of the two grants, as short
// numbered passages the report can quote. The grant IDs and dates are real NIH
// records; this text is made up for the demo and is not the actual award.
import type { Grant } from '../data/types'

export interface Passage { id: string; ref: string; text: string }

/** Experimental model kinds a plan can mention, with the words that signal each. */
export const MODEL_KINDS: Record<string, { label: string; words: string[] }> = {
  organoid: { label: 'patient-derived organoids', words: ['organoid', 'patient-derived', 'patient derived'] },
  mouse: { label: 'mouse models', words: ['mouse', 'mice', 'murine', 'transgenic'] },
  cell_line: { label: 'established cell lines', words: ['cell line', 'cell-line', 'cultured cells', 'hek293', 'sh-sy5y'] },
  human_tissue: { label: 'human tissue', words: ['post-mortem', 'postmortem', 'human tissue', 'biopsy', 'biopsies'] },
  zebrafish: { label: 'zebrafish', words: ['zebrafish'] },
}

export interface AwardDoc {
  grantId: string
  /** Words that tie an experiment to the funded aims. */
  aimTerms: string[]
  /** Disease words the award is about; a plan that names none leaves its target unclear. */
  diseaseTerms: string[]
  /** Model kinds the approved plan describes, with the passage that says so. */
  approvedModels: Record<string, string>
  passages: Passage[]
}

const TERMS = (end: string): Passage[] => [
  { id: 't-equip', ref: 'Award terms §4.2', text: 'Equipment purchases of $5,000 or more require prior written approval from the awarding agency. Quotes should be kept on file for any equipment over $1,000.' },
  { id: 't-service', ref: 'Award terms §4.3', text: 'External services (core facilities, sequencing, contract research) must be competitively priced. A written quote is required for any single service over $3,500.' },
  { id: 't-travel', ref: 'Award terms §4.5', text: 'Travel must be to present award-funded work or to meet an approved collaborator. International travel requires prior approval.' },
  { id: 't-people', ref: 'Award terms §4.6', text: 'Personnel costs must match each person\'s effort on the award\'s aims, and be consistent with the institution\'s pay policy.' },
  { id: 't-end90', ref: 'Award terms §5.1', text: 'Supplies bought in the last 90 days of the performance period are often refused by auditors unless they are needed to finish the funded work.' },
  { id: 't-period', ref: 'Award terms §5.2', text: `The performance period ends ${end}. Costs must be incurred by that date; a no-cost extension needs agency approval.` },
]

export const awardFor = (g: Grant, extra: Passage[] = []): AwardDoc => {
  const doc = AWARDS[g.id] ?? GENERIC
  return { ...doc, grantId: g.id, passages: [...doc.passages, ...TERMS(g.end), ...extra] }
}

const GENERIC: AwardDoc = {
  grantId: '', aimTerms: [], diseaseTerms: [], approvedModels: {},
  passages: [{ id: 'a-none', ref: 'Award', text: 'No approved research plan is on file for this grant.' }],
}

const AWARDS: Record<string, AwardDoc> = {
  R21AI182745: {
    grantId: 'R21AI182745',
    aimTerms: ['rna', 'therapeutic', 'oligonucleotide', 'antisense', 'sirna', 'neuro', 'neuron', 'compound', 'drug', 'treatment', 'target', 'transcript'],
    diseaseTerms: ['neuro', 'als', 'alzheimer', 'parkinson', 'huntington', 'brain', 'neuron'],
    approvedModels: { cell_line: 'm-models', mouse: 'm-models' },
    passages: [
      { id: 'a-1', ref: 'Specific Aim 1', text: 'Design and screen RNA therapeutics (antisense oligonucleotides and siRNA) against targets implicated in neurological disease.' },
      { id: 'a-2', ref: 'Specific Aim 2', text: 'Test lead candidates in established neuronal cell lines and in mouse models of neurological disease, and measure their effect on target RNA levels.' },
      { id: 'm-models', ref: 'Approved research plan, Experimental models', text: 'Experiments use established neuronal cell lines and C57BL/6 mouse models of neurological disease.' },
    ],
  },
  R01GM061721: {
    grantId: 'R01GM061721',
    aimTerms: ['imaging', 'image', 'probe', 'alzheimer', 'amyloid', 'tau', 'brain', 'intervention', 'therapy', 'treatment', 'pet', 'mri'],
    diseaseTerms: ['alzheimer', 'dementia', 'brain', 'amyloid', 'tau'],
    approvedModels: { mouse: 'm-models', human_tissue: 'm-models' },
    passages: [
      { id: 'a-1', ref: 'Specific Aim 1', text: 'Develop imaging probes that track the response of the brain to therapeutic interventions in Alzheimer\'s disease.' },
      { id: 'a-2', ref: 'Specific Aim 2', text: 'Validate the probes in transgenic mouse models of Alzheimer\'s disease and in post-mortem human brain tissue.' },
      { id: 'm-models', ref: 'Approved research plan, Experimental models', text: 'Experiments use transgenic Alzheimer\'s mouse models and post-mortem human brain tissue obtained through the institutional brain bank.' },
    ],
  },
}
