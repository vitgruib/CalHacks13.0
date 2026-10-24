import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, test } from 'node:test';

import { createPaperLookup, creditsGrant, grantNumbersIn, normalizeGrantNumber, type PaperLookupOptions } from '../src/sources/papers.ts';

// Real API answers, trimmed (no author names or affiliations), recorded from
// Crossref, PMC's ID converter, PubMed and RePORTER on 2026-10-24.
const FIXTURES = fileURLToPath(new URL('./fixtures/papers/', import.meta.url));

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, '_').replace(/^_+|_+$/g, '');

function fixtureName(url: string, body: string | undefined): string {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  if (parsed.hostname === 'api.crossref.org') return `crossref-${slug(query.get('filter')!.replace(/doi:/g, ''))}.json`;
  if (parsed.pathname.includes('/idconv/')) return `idconv-${slug(query.get('ids')!)}.json`;
  if (parsed.pathname.endsWith('/esearch.fcgi')) return `esearch-${slug(query.get('term')!)}.json`;
  if (parsed.pathname.endsWith('/efetch.fcgi')) return `efetch-${slug(query.get('id')!)}.xml`;
  if (parsed.hostname === 'api.reporter.nih.gov') {
    const request = JSON.parse(body!);
    return `reporter-${slug(request.criteria.core_project_nums.join(','))}-${request.offset}.json`;
  }
  throw new Error(`no fixture name for ${url}`);
}

interface Call {
  url: string;
  headers: Headers;
}

// Serves the recorded answer for each request; anything unrecorded is a 404,
// so an unexpected request fails the test instead of reaching the network.
function fixtureFetch(calls: Call[] = [], tweak: (name: string, text: string) => string = (_, text) => text): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const name = fixtureName(url, init?.body as string | undefined);
    let text: string;
    try {
      text = readFileSync(join(FIXTURES, name), 'utf8');
    } catch {
      return new Response(`no fixture ${name}`, { status: 404 });
    }
    return new Response(tweak(name, text), { headers: { 'content-type': name.endsWith('.xml') ? 'text/xml' : 'application/json' } });
  };
}

let cacheDir: string;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'gg-papers-'));
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

const papersWith = (options: PaperLookupOptions = {}) =>
  createPaperLookup({ fetchImpl: fixtureFetch(), cacheDir, mode: 'live', throttle: false, ...options });

test('clean_paper_has_a_pmcid_and_credits_its_grant', async () => {
  const paper = await papersWith().lookup('https://doi.org/10.3201/EID3208.260433');
  assert.ok(paper);
  assert.equal(paper.doi, '10.3201/eid3208.260433');
  assert.equal(paper.title, 'Doxycycline Resistance and 16S rRNA Mutations in Treponema pallidum');
  assert.equal(paper.pmid, '42521605');
  assert.equal(paper.pmcid, 'PMC13426860');
  assert.deepEqual(paper.grantsCredited, ['R01AI143439', 'R01AI181732']);
  assert.ok(creditsGrant(paper, '5R01AI181732-02'));
  assert.ok(!creditsGrant(paper, 'R01HD115985'));
  assert.deepEqual(paper.updates, []);
  assert.equal(paper.urls.length, 3);
});

test('paper_not_in_pmc_has_no_pmcid_but_still_lists_its_grants', async () => {
  const calls: Call[] = [];
  const paper = await papersWith({ fetchImpl: fixtureFetch(calls) }).lookup('10.1097/OLQ.0000000000002380');
  assert.ok(paper);
  assert.equal(paper.pmcid, null);
  assert.equal(paper.pmid, '42330440'); // found by PubMed search: the converter only knows PMC papers
  assert.deepEqual(paper.grantsCredited, ['R01AI181732']);
  assert.ok(calls.some((call) => call.url.includes('/esearch.fcgi')));
});

test('corrected_paper_lists_the_correction_from_crossref_and_pubmed', async () => {
  const paper = await papersWith().lookup('10.1136/bmj-2022-072924');
  assert.ok(paper);
  assert.equal(paper.pmcid, 'PMC10535030');
  assert.deepEqual(paper.grantsCredited, ['R01CA197422']);
  assert.deepEqual(paper.updates, [
    {
      kind: 'correction',
      noticeDoi: '10.1136/bmj.r2557',
      noticePmid: null,
      title: 'Correction: Ionising radiation and cardiovascular disease: systematic review and meta-analysis',
      date: '2025-12-12',
      source: 'Crossref',
      via: 'publisher',
    },
    {
      kind: 'correction',
      noticeDoi: '10.1136/bmj.r2557',
      noticePmid: '41386776',
      title: 'Correction: Ionising radiation and cardiovascular disease: systematic review and meta-analysis.',
      date: '2025-12-12',
      source: 'PubMed',
      via: null,
    },
  ]);
});

test('retracted_paper_lists_a_retraction_update', async () => {
  const paper = await papersWith().lookup('10.1016/S0140-6736(20)31180-6');
  assert.ok(paper);
  assert.equal(paper.pmid, '32450107');
  const retractions = paper.updates.filter((update) => update.kind === 'retraction');
  assert.ok(
    retractions.some(
      (update) => update.source === 'Crossref' && update.via === 'retraction-watch' && update.noticeDoi === '10.1016/s0140-6736(20)31324-6' && update.date === '2020-06-05',
    ),
  );
  assert.ok(retractions.some((update) => update.source === 'PubMed' && update.noticePmid === '32511943' && update.noticeDoi === '10.1016/s0140-6736(20)31324-6'));
  assert.ok(paper.updates.some((update) => update.kind === 'expression_of_concern' && update.source === 'PubMed'));
  // CommentIn links are discussion, not changes to the paper.
  assert.ok(paper.updates.every((update) => update.kind !== 'other'));
});

test('affiliation_correction_keeps_the_notice_title_for_the_materiality_check', async () => {
  const paper = await papersWith().lookup('10.1001/jamanetworkopen.2023.2937');
  assert.ok(paper);
  assert.deepEqual(paper.grantsCredited, ['P30MH062246', 'P30AG024409']);
  // JAMA sends errata to PubMed but not to Crossref.
  assert.deepEqual(paper.updates, [
    {
      kind: 'correction',
      noticeDoi: '10.1001/jamanetworkopen.2023.54465',
      noticePmid: '38214934',
      title: 'Error in Affiliation.',
      date: '2024-01-02',
      source: 'PubMed',
      via: null,
    },
  ]);
});

test('doi_crossref_does_not_know_returns_null_without_asking_pubmed', async () => {
  const calls: Call[] = [];
  const papers = papersWith({ fetchImpl: fixtureFetch(calls) });
  assert.equal(await papers.lookup('10.5555/grantguard-not-a-real-doi'), null);
  assert.equal(calls.length, 1);
  // "Not found" is saved too, so it holds offline.
  const offline = createPaperLookup({ cacheDir, mode: 'offline' });
  assert.equal(await offline.lookup('10.5555/grantguard-not-a-real-doi'), null);
});

test('grant_numbers_are_normalized_to_core_project_numbers', () => {
  assert.equal(normalizeGrantNumber('5R01HD115985-03'), 'R01HD115985');
  assert.equal(normalizeGrantNumber('1R01AI181732-01A1'), 'R01AI181732');
  assert.equal(normalizeGrantNumber('R01 EY028739'), 'R01EY028739');
  assert.equal(normalizeGrantNumber('r01-ey-028739'), 'R01EY028739');
  assert.equal(normalizeGrantNumber('K23AT010879.'), 'K23AT010879');
  assert.equal(normalizeGrantNumber('UL1 TR001860'), 'UL1TR001860');
  assert.equal(normalizeGrantNumber('NIH R01 HD115985'), 'R01HD115985');
  assert.equal(normalizeGrantNumber('EY06190'), 'EY006190'); // institute + serial only, as some papers print it
  assert.equal(normalizeGrantNumber('MR/K013351/1'), null);
  assert.equal(normalizeGrantNumber('001'), null);
  assert.deepEqual(grantNumbersIn('R01 EY028739, P30 EY001730'), ['R01EY028739', 'P30EY001730']);
  assert.ok(creditsGrant({ grantsCredited: ['EY028739'] }, 'R01EY028739'));
  assert.ok(!creditsGrant({ grantsCredited: ['EY028739'] }, 'R01EY028740'));
});

test('grant_publications_lists_the_pmids_reporter_links', async () => {
  const papers = papersWith();
  assert.deepEqual(await papers.grantPublications('R01AI181732'), ['42330440', '42521605']);
  assert.deepEqual(await papers.grantPublications('5R01AI181732-02'), ['42330440', '42521605']);
  await assert.rejects(papers.grantPublications('EY028739'), /not an NIH core project number/);
});

test('offline_lookup_repeats_the_live_answer', async () => {
  const live = await papersWith().lookup('10.1016/S0140-6736(20)31180-6');
  const failing: typeof fetch = async () => {
    throw new Error('network down');
  };
  const offline = await createPaperLookup({ fetchImpl: failing, cacheDir, mode: 'offline' }).lookup('10.1016/S0140-6736(20)31180-6');
  assert.deepEqual(offline, live);
});

test('saved_copies_keep_no_names_affiliations_or_contact_email', async () => {
  const calls: Call[] = [];
  const withPeople = (name: string, text: string) => {
    if (name.startsWith('crossref-')) {
      const json = JSON.parse(text);
      for (const item of json.message.items) item.author = [{ given: 'Testa', family: 'Persona', affiliation: [{ name: 'Example U' }] }];
      return JSON.stringify(json);
    }
    if (name.endsWith('.xml')) {
      return text.replace(
        '</ArticleTitle>',
        '</ArticleTitle><AuthorList><Author><LastName>Persona</LastName><ForeName>Testa</ForeName><AffiliationInfo><Affiliation>Example U</Affiliation></AffiliationInfo></Author></AuthorList>',
      );
    }
    return text;
  };
  const papers = papersWith({ fetchImpl: fixtureFetch(calls, withPeople), contactEmail: 'lab@example.test' });
  const paper = await papers.lookup('10.1001/jamanetworkopen.2023.2937');
  assert.ok(paper);

  const crossref = calls.filter((call) => call.url.includes('api.crossref.org'));
  assert.ok(crossref.length > 0 && crossref.every((call) => call.headers.get('user-agent')?.includes('mailto:lab@example.test')));
  const ncbi = calls.filter((call) => call.url.includes('ncbi.nlm.nih.gov'));
  assert.ok(ncbi.length > 0 && ncbi.every((call) => call.url.endsWith('&email=lab%40example.test')));

  for (const file of readdirSync(cacheDir)) {
    const saved = readFileSync(join(cacheDir, file), 'utf8');
    // (The notice title "Error in Affiliation." may stay: it names no one.)
    assert.doesNotMatch(saved, /Persona|Testa|Example U|example\.test|"author"|"affiliation"|<Affiliation/, file);
  }
  assert.doesNotMatch(JSON.stringify(paper), /Persona|example\.test/);
});

test('a_failed_source_names_the_doi_and_the_url', async () => {
  const broken: typeof fetch = async (input, init) =>
    String(input).includes('/efetch.fcgi') ? new Response('busy', { status: 500 }) : fixtureFetch()(input, init);
  await assert.rejects(
    papersWith({ fetchImpl: broken }).lookup('10.3201/eid3208.260433'),
    /DOI 10\.3201\/eid3208\.260433: could not read https:\/\/eutils\.ncbi\.nlm\.nih\.gov\/entrez\/eutils\/efetch\.fcgi\?.*500/,
  );
});
