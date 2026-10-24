import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { createReporterSource } from '../src/sources/reporter.ts';

// Fixtures are real RePORTER answers from 2026-10-24, trimmed by the client
// itself (test/fixtures/reporter/).
const TODAY = '2026-10-24';
const SEARCH_URL = 'https://api.reporter.nih.gov/v2/projects/search';
const PROJECT_INFO_URL = 'https://reporter.nih.gov/services/Projects/ProjectInfo';

let cacheDir: string;
let warn: ReturnType<typeof mock.method>;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'gg-reporter-'));
  warn = mock.method(console, 'warn', () => {});
});

afterEach(() => {
  mock.restoreAll();
  rmSync(cacheDir, { recursive: true, force: true });
});

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`./fixtures/reporter/${name}.json`, import.meta.url), 'utf8'));
}

// Changes a fixture before it's served, or returns a Response to send instead.
type Edit = (json: Record<string, unknown>) => unknown;

// Serves the fixtures the way RePORTER would and records every request.
function fakeReporter(edits: { search?: Edit; projectInfo?: Edit } = {}) {
  const requests: Array<{ url: string; body: { criteria: { project_nums: string[] }; include_fields?: string[] } | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });
    const [json, edit] =
      url === SEARCH_URL
        ? [fixture(`search-${body.criteria.project_nums[0]}`), edits.search]
        : [fixture(`project-info-${new URL(url).searchParams.get('projectId')}`), edits.projectInfo];
    const answer = edit ? edit(json) : json;
    return answer instanceof Response ? answer : Response.json(answer);
  };
  const projectInfoRequests = () => requests.filter((request) => request.url.startsWith(PROJECT_INFO_URL)).map((request) => request.url);
  return { fetchImpl, requests, projectInfoRequests };
}

function reporter(fetchImpl: typeof fetch, today = TODAY) {
  return createReporterSource({ fetchImpl, cacheDir, mode: 'live', today: () => today, minIntervalMs: 0 });
}

const warnings = () => warn.mock.calls.map((call) => String(call.arguments[0]));

test('active_grant_reads_as_active_from_its_latest_year', async () => {
  const fake = fakeReporter();
  const reading = await reporter(fake.fetchImpl).read('R01AI181732');

  assert.deepEqual(reading, {
    grantId: 'R01AI181732',
    source: 'NIH RePORTER',
    status: 'active',
    awarded: 4_602_065,
    paid: null,
    endDate: '2029-06-30',
    url: 'https://reporter.nih.gov/project-details/11395670',
  });
  assert.deepEqual(fake.projectInfoRequests(), [`${PROJECT_INFO_URL}?projectId=11395670`]);
  assert.deepEqual(warnings(), []);
});

test('awarded_sums_every_year_and_the_supplement', async () => {
  const reading = await reporter(fakeReporter().fetchImpl).read('R01HD115985');
  // FY2024, FY2025, FY2026 and the FY2026 supplement; equals USAspending's
  // total_obligation for this award.
  assert.equal(reading?.awarded, 697_555 + 705_616 + 647_937 + 100_000);
});

test('within_the_latest_year_the_grant_record_beats_a_later_supplement', async () => {
  const reading = await reporter(fakeReporter().fetchImpl).read('R01HD115985');
  // 5R01HD115985-03 (notice 2026-06-23) over 3R01HD115985-03S1 (2026-08-11).
  assert.equal(reading?.url, 'https://reporter.nih.gov/project-details/11377103');
  assert.equal(reading?.status, 'active');
});

test('terminated_latest_year_reads_as_canceled', async () => {
  const reading = await reporter(fakeReporter().fetchImpl).read('R01MH122754');
  assert.equal(reading?.status, 'canceled', 'a termination wins over the end date having passed');
  assert.equal(reading?.endDate, '2025-12-01');
  assert.equal(reading?.url, 'https://reporter.nih.gov/project-details/10827399');
});

test('a_flag_left_on_an_older_year_does_not_cancel_the_grant', async () => {
  const fake = fakeReporter();
  const reading = await reporter(fake.fetchImpl).read('R01EY028739');
  assert.equal(reading?.status, 'active');
  assert.deepEqual(fake.projectInfoRequests(), [`${PROJECT_INFO_URL}?projectId=11379582`]);
});

test('end_date_passed_reads_as_ended', async () => {
  const fake = fakeReporter();
  const reading = await reporter(fake.fetchImpl).read('R01DE030445');
  assert.equal(reading?.status, 'ended');
  assert.equal(reading?.endDate, '2025-04-30');

  const onItsLastDay = await reporter(fake.fetchImpl, '2025-04-30').read('R01DE030445');
  assert.equal(onItsLastDay?.status, 'active');
});

test('project_info_failure_leaves_status_unknown', async () => {
  const fake = fakeReporter({ projectInfo: () => new Response('Service Unavailable', { status: 503 }) });
  const reading = await reporter(fake.fetchImpl).read('R01AI181732');

  assert.equal(reading?.status, null);
  assert.equal(reading?.awarded, 4_602_065, 'the search answer still counts');
  assert.equal(reading?.endDate, '2029-06-30');
  assert.equal(warnings().length, 1);
  assert.match(warnings()[0], /R01AI181732/);
  assert.match(warnings()[0], /ProjectInfo\?projectId=11395670/);
});

test('project_info_without_the_termination_field_leaves_status_unknown', async () => {
  const fake = fakeReporter({
    projectInfo: ({ post_award_action_type: _dropped, ...rest }) => rest,
  });
  const reading = await reporter(fake.fetchImpl).read('R01AI181732');

  assert.equal(reading?.status, null);
  assert.match(warnings()[0] ?? '', /R01AI181732.*status unknown/);
});

test('no_record_reads_as_null', async () => {
  const fake = fakeReporter();
  assert.equal(await reporter(fake.fetchImpl).read('DEMO-GRANT-A'), null);
  assert.deepEqual(fake.projectInfoRequests(), [], 'nothing to ask ProjectInfo about');
});

test('search_failure_names_the_grant_and_the_url', async () => {
  const fake = fakeReporter({ search: () => new Response('Bad Gateway', { status: 502 }) });
  await assert.rejects(
    reporter(fake.fetchImpl).read('R01AI181732'),
    /R01AI181732.*https:\/\/api\.reporter\.nih\.gov\/v2\/projects\/search.*502/,
  );
});

test('person_names_are_never_asked_for_or_saved', async () => {
  // Stands in for the person fields RePORTER sends when it ignores
  // include_fields, and that ProjectInfo always sends.
  const person = { contact_pi_name: 'TEST PERSON', principal_investigators: [{ full_name: 'TEST PERSON' }] };
  const fake = fakeReporter({
    search: (json) => ({
      ...json,
      results: (json.results as object[]).map((record) => ({ ...record, ...person, program_officers: [] })),
    }),
    projectInfo: (json) => ({ ...json, ...person, po_name: 'TEST PERSON', contact_pi: { email: 'test@example.test' } }),
  });
  await reporter(fake.fetchImpl).read('R01AI181732');

  const asked = fake.requests[0].body?.include_fields;
  assert.ok(Array.isArray(asked) && asked.length > 0, 'the search names the fields it wants');
  assert.doesNotMatch(JSON.stringify(asked), /PiNames|PoNames|ContactPi|ProgramOfficer|PrincipalInvestigator/i);

  const saved = readdirSync(cacheDir).map((file) => readFileSync(join(cacheDir, file), 'utf8'));
  assert.equal(saved.length, 2);
  for (const text of saved) {
    assert.doesNotMatch(text, /TEST PERSON|pi_name|principal_investigator|program_officer|contact_pi|po_name|email/i);
  }
});

test('offline_reads_return_the_same_reading_as_live', async () => {
  const live = await reporter(fakeReporter().fetchImpl).read('R01HD115985');
  const offline = await createReporterSource({
    cacheDir,
    mode: 'offline',
    today: () => TODAY,
    fetchImpl: async () => {
      throw new Error('offline must not touch the network');
    },
  }).read('R01HD115985');
  assert.deepEqual(offline, live);
});

test('live_requests_are_spaced_out', async () => {
  const times: number[] = [];
  const fake = fakeReporter();
  const timed: typeof fetch = async (input, init) => {
    times.push(Date.now());
    return fake.fetchImpl(input, init);
  };
  await createReporterSource({ fetchImpl: timed, cacheDir, mode: 'live', today: () => TODAY, minIntervalMs: 60 }).read(
    'R01AI181732',
  );
  assert.equal(times.length, 2);
  // A little slack for timer jitter.
  assert.ok(times[1] - times[0] >= 50, `requests were ${times[1] - times[0]} ms apart`);
});
