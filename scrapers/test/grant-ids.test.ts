import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coreProjectNumber, parseGrantList, parseGrantNumber } from '../src/grant-ids.ts';

test('full_nih_numbers_normalize_to_the_core_project_number', () => {
  const cases: Array<[string, string | null]> = [
    ['1R01GM000001-01', 'R01GM000001'],
    ['5K01HL173859-03', 'K01HL173859'],
    ['3K99DK136503-02S1', 'K99DK136503'],
    ['2T32HG010463-06A1', 'T32HG010463'],
    ['R01GM000001', 'R01GM000001'],
    [' 1 R01 GM000001-01 ', 'R01GM000001'],
    ['r21ai000002', 'R21AI000002'],
    ['UE5NS070697', 'UE5NS070697'],
    ['N/A', null],
    ['not a grant', null],
    ['R01GM00001', null],
  ];
  for (const [raw, core] of cases) assert.equal(coreProjectNumber(raw), core, raw);
});

test('a_supplement_suffix_is_kept_apart_from_the_core_number', () => {
  assert.deepEqual(parseGrantNumber('3K99DK136503-02S1'), { core: 'K99DK136503', supplement: 'S1' });
  assert.deepEqual(parseGrantNumber('2T32HG010463-06A1'), { core: 'T32HG010463', supplement: null });
});

test('the_lab_grant_list_is_normalized_and_deduplicated', () => {
  assert.deepEqual(parseGrantList('R01GM000001, 5R01GM000001-03,r21ai000002;junk'), ['R01GM000001', 'R21AI000002']);
  assert.deepEqual(parseGrantList(undefined), []);
});
