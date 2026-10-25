// The cast and the starting books. Grants and requests come from
// sim/seed.json (Track C's fake university data); the lab members are
// invented for the hero and are demo data, like everything else here.

import type { Edge, FinanceAgent, FlowNode, Grant, Preset, Researcher, RequestInput } from './types'

export const R01 = 'R01GM061721'
export const R21 = 'R21AI182745'

/** Both grants on 2026-03-09, the day before the cancellation (sim/seed.json numbers). */
export const startGrants = (): Grant[] => [
  {
    id: R01,
    name: 'Mitochondria grant',
    title: 'Biogenesis of the mitochondrial inner membrane',
    pi: 'Dr. Lena Ortiz',
    agency: 'NIH / NIGMS',
    awarded: 420000,
    received: 104415,
    spent: 105305,
    promised: 0,
    available: 314695,
    start: '2025-01-01',
    end: '2027-07-31',
    status: 'active',
    frozen: false,
  },
  {
    id: R21,
    name: 'Antibiotic grant',
    title: 'Investigating ploidy modulation as a strategy to improve antibiotic activity',
    pi: 'Dr. Lena Ortiz',
    agency: 'NIH / NIAID',
    awarded: 275000,
    received: 119070,
    spent: 132610,
    promised: 9590,
    available: 132800,
    start: '2024-08-01',
    end: '2026-08-31',
    status: 'active',
    frozen: false,
  },
]

export const startResearchers = (): Researcher[] => [
  {
    id: 'ortiz',
    name: 'Dr. Lena Ortiz',
    role: 'PI',
    station: 'PI office and whiteboard',
    grantIds: [R01, R21],
    tasks: ['Drafting the mitochondria progress report', 'Reviewing gel images with Sam', 'Sketching aim 3 on the whiteboard', 'Reading reviewer comments'],
    task: 'Sketching aim 3 on the whiteboard',
  },
  {
    id: 'okafor',
    name: 'Dr. Sam Adeyemi',
    role: 'Postdoc',
    station: 'Protein purification bench',
    grantIds: [R01],
    tasks: ['Running a Ni-NTA purification', 'Loading an SDS-PAGE gel', 'Prepping outer membranes', 'Setting up a folding assay'],
    task: 'Prepping outer membranes',
  },
  {
    id: 'raman',
    name: 'Priya Raman',
    role: 'Grad student',
    station: 'Microbiology bench and biosafety cabinet',
    grantIds: [R21],
    tasks: ['Plating E. coli isolates', 'Reading MIC plates', 'Loading the microfluidic chip', 'Logging assay results'],
    task: 'Plating E. coli isolates',
  },
  {
    id: 'silva',
    name: 'Mateo Silva',
    role: 'Grad student',
    station: 'Confocal microscope',
    grantIds: [R01, R21],
    tasks: ['Imaging labeled membranes', 'Calibrating the 63x objective', 'Stitching a tile scan', 'Exporting time-lapse stacks'],
    task: 'Imaging labeled membranes',
  },
  {
    id: 'park',
    name: 'Jun Park',
    role: 'Lab manager',
    station: 'Supply room and -80 °C freezer',
    grantIds: [R01, R21],
    tasks: ['Counting reagent stock', 'Logging the -80 °C freezer', 'Receiving a delivery', 'Restocking pipette tips'],
    task: 'Counting reagent stock',
  },
]

export const AGENTS: FinanceAgent[] = [
  {
    role: 'purchasing',
    // T108: no agent buys. The role keeps its id; the grant manager approves every request and the researcher buys.
    name: 'Request-check agent',
    seat: 'Request checks',
    job: 'Checks every request for the grant manager: picks the grant, runs the six spending rules, and passes, suggests a reroute, or flags it.',
  },
  {
    role: 'bookkeeping',
    name: 'Bookkeeping agent',
    seat: 'Grant accountant',
    job: 'Keeps the fund tracker current from NIH RePORTER, USAspending, cancellation lists, court notices and payments; checks every invoice.',
  },
]

export const NODES: FlowNode[] = [
  ...startResearchers().map(r => ({ id: `r:${r.id}`, kind: 'researcher' as const, side: 'lab' as const, label: r.name, sub: r.role })),
  { id: 'a:purchasing', kind: 'agent', side: 'finance', label: 'Request-check agent', sub: 'Six spending rules' },
  { id: 'a:bookkeeping', kind: 'agent', side: 'finance', label: 'Bookkeeping agent', sub: 'Fund tracker and invoices' },
  { id: 'p:grant_manager', kind: 'person', side: 'finance', label: 'Grant manager', sub: 'The only human who approves' },
  { id: `g:${R01}`, kind: 'grant', side: 'finance', label: 'Mitochondria grant', sub: 'NIH / NIGMS' },
  { id: `g:${R21}`, kind: 'grant', side: 'finance', label: 'Antibiotic grant', sub: 'NIH / NIAID' },
  { id: 's:reporter', kind: 'source', side: 'outside', label: 'NIH RePORTER' },
  { id: 's:usaspending', kind: 'source', side: 'outside', label: 'USAspending' },
  { id: 's:cancellations', kind: 'source', side: 'outside', label: 'Cancellation list', sub: 'Apify scraper' },
  { id: 's:court', kind: 'source', side: 'outside', label: 'Court notice' },
  { id: 's:payments', kind: 'source', side: 'outside', label: 'Payment system' },
  { id: 'p:funder', kind: 'person', side: 'outside', label: 'NIH funder', sub: 'Asks follow-up questions' },
  { id: 'v:vendors', kind: 'vendor', side: 'outside', label: 'Vendors', sub: 'Orders and invoices' },
]

const LAB = startResearchers().map(r => `r:${r.id}`)
const AGENT_IDS = ['a:purchasing', 'a:bookkeeping']
const GRANT_IDS = [`g:${R01}`, `g:${R21}`]

/** The finance network's lines: every route a packet takes in engine.ts, plus who watches or spends each grant. */
export const EDGES: Edge[] = [
  ...LAB.map(id => ({ from: id, to: 'a:purchasing', kinds: ['request', 'pushback', 'verdict'], what: 'Requests and answers' }) satisfies Edge),
  { from: 'a:purchasing', to: 'a:bookkeeping', kinds: ['recheck'], what: 'Check the grant again' },
  ...AGENT_IDS.map(id => ({ from: id, to: 'p:grant_manager', kinds: ['hold', 'decision'], what: 'Asks the grant manager' }) satisfies Edge),
  { from: 's:reporter', to: 'a:bookkeeping', kinds: ['reading'], what: 'Project status' },
  { from: 's:usaspending', to: 'a:bookkeeping', kinds: ['reading'], what: 'Obligations and payments' },
  { from: 's:cancellations', to: 'a:bookkeeping', kinds: ['reading'], what: 'Terminated grants' },
  { from: 's:court', to: 'a:bookkeeping', kinds: ['reading'], what: 'Court orders' },
  { from: 's:payments', to: 'a:bookkeeping', kinds: ['payment'], what: 'Money arriving' },
  ...GRANT_IDS.map(id => ({ from: 'a:bookkeeping', to: id, kinds: [], what: 'Keeps its books and freeze' }) satisfies Edge),
  ...GRANT_IDS.map(id => ({ from: 'a:purchasing', to: id, kinds: [], what: 'Checks requests against it' }) satisfies Edge),
  ...GRANT_IDS.map(id => ({ from: id, to: 'v:vendors', kinds: ['charge'], what: 'Orders paid' }) satisfies Edge),
  { from: 'v:vendors', to: 'a:bookkeeping', kinds: ['invoice'], what: 'Invoices to check' },
]

export const SOURCE_NODE: Record<string, string> = {
  'NIH RePORTER': 's:reporter',
  USAspending: 's:usaspending',
  'Cancellation list (Apify)': 's:cancellations',
  'Court notice': 's:court',
  'Payment system': 's:payments',
}

/** The seven requests waiting in sim/seed.json (rq-101 to rq-107), each given to a lab member. */
export const SEED_REQUESTS: Record<string, RequestInput & { id: string }> = {
  gloves: { id: 'rq-101', researcherId: 'okafor', item: 'Nitrile gloves, 10 cases', category: 'lab supplies', price: 640, grantId: R01, purpose: 'Membrane prep for aim 2. The court restored the grant, so the money is coming.' },
  agar: { id: 'rq-102', researcherId: 'raman', item: 'Agar plates, 40 packs', category: 'lab supplies', price: 1180, grantId: R21, purpose: 'Assay validation runs before the grant ends' },
  espresso: { id: 'rq-103', researcherId: 'park', item: 'Espresso machine for the lab', category: 'general office', price: 890, grantId: R21, purpose: 'Lab morale during the final push' },
  confocal: { id: 'rq-104', researcherId: 'silva', item: 'Confocal microscope service contract, 12 months', category: 'equipment service', price: 3600, grantId: R01, sharedWith: [R01, R21], purpose: 'Annual service of the shared confocal; imaging for both grants' },
  pump: { id: 'rq-105', researcherId: 'okafor', item: 'Peristaltic pump with controller', category: 'equipment', price: 6850, grantId: R01, purpose: 'Continuous-flow folding experiments, aim 3' },
  detergent: { id: 'rq-106', researcherId: 'okafor', item: 'Membrane protein detergent screening kit, 4 plates', category: 'reagents', price: 5000, grantId: R01, purpose: 'BamA detergent screen, round 2' },
  proteomics: { id: 'rq-107', researcherId: 'ortiz', item: 'Proteomics core: 10 hours of mass spec', category: 'core facility services', price: 1800, grantId: R01, sharedWith: [R01, R21], split: [{ grantId: R01, share: 0.6 }, { grantId: R21, share: 0.4 }], purpose: 'Samples from both projects: 6 hours mitochondria, 4 hours antibiotic' },
}

/** Buttons a viewer can press to send their own request through the real rules. */
export const PRESETS: Preset[] = [
  { label: 'Pipette tips, 20 racks', expect: 'accept', researcherId: 'park', item: 'Pipette tips, 20 racks', category: 'lab supplies', price: 380, grantId: R01, purpose: 'Folding assays' },
  { label: 'Lab pizza night', expect: 'reject', researcherId: 'raman', item: 'Pizza for lab meeting', category: 'food', price: 140, grantId: R21, purpose: 'Friday lab meeting' },
  { label: 'Agar on the ending grant', expect: 'refine', researcherId: 'raman', item: 'Mueller-Hinton agar, 20 sleeves', category: 'lab supplies', price: 960, grantId: R21, purpose: 'MIC plates for the last validation round' },
  { label: 'Ultracentrifuge rotor', expect: 'hold', researcherId: 'okafor', item: 'Ultracentrifuge rotor, Ti-45', category: 'equipment', price: 9400, grantId: R01, purpose: 'Membrane fractionation, aim 1' },
  { label: 'Shared sequencing run', expect: 'refine', researcherId: 'silva', item: 'Sequencing core: one NovaSeq lane', category: 'core facility services', price: 2200, grantId: R01, sharedWith: [R01, R21], purpose: 'Samples from both projects' },
]

export const PAPERS = [
  { id: 'p-10', researcherId: 'raman', grantId: R21, title: 'Membrane permeability limits beta-lactam uptake in a microfluidic assay', creditsGrantId: R01, pmcid: 'PMC11000010' },
  { id: 'p-04', researcherId: 'okafor', grantId: R01, title: 'Folding kinetics of OmpF under osmotic stress', creditsGrantId: R01, pmcid: 'PMC11000004', correction: { kind: 'material', disclosed: false, note: 'Correction (2026-03-02): the Figure 3 rate constants were re-measured; one conclusion in the abstract is revised.' } },
  { id: 'p-02', researcherId: 'silva', grantId: R01, title: 'Lateral pressure profiles shape BamA folding', creditsGrantId: R01, pmcid: 'PMC11000002' },
]

/** inv-030 from sim/seed.json: a bill for an order canceled on 2026-03-02. */
export const CANCELED_ORDER_INVOICE = {
  invoice: { id: 'inv-030', vendor: 'BioReagents Inc', amount: 2400, received: '2026-06-11' },
  order: { id: 'o-030', vendor: 'BioReagents Inc', amount: 2400, placed: '2026-02-20', state: 'canceled', canceledOn: '2026-03-02' },
  approvals: [{ amount: 2400, day: '2026-02-20', by: 'grant_manager' }],
}

/** Routine buys for after the story, so the lab never goes quiet. */
export const ROUTINE: RequestInput[] = [
  { researcherId: 'okafor', item: 'DDM detergent, 5 g', category: 'reagents', price: 890, grantId: R01, purpose: 'Solubilizing outer membrane proteins' },
  { researcherId: 'park', item: 'Nitrile gloves, 4 cases', category: 'lab supplies', price: 256, grantId: R01, purpose: 'Restock' },
  { researcherId: 'silva', item: 'Glass-bottom imaging dishes, 100', category: 'lab supplies', price: 410, grantId: R01, purpose: 'Live-cell imaging' },
  { researcherId: 'okafor', item: 'Precast SDS-PAGE gels, 2 boxes', category: 'reagents', price: 520, grantId: R01, purpose: 'Purity checks' },
  { researcherId: 'raman', item: 'Cation-adjusted broth, 500 mL x 6', category: 'reagents', price: 330, grantId: R21, purpose: 'MIC panels' },
  { researcherId: 'park', item: 'Office chair for the write-up room', category: 'furniture', price: 420, grantId: R01, purpose: 'Write-up room' },
]
