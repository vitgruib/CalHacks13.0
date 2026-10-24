// Each rule against its planted mistake and its decoy (MASTER-PLAN §3).
// Expected values come from the plan's wording, not from running the code.
import { describe, expect, test } from 'vitest';
import {
  canBuyAlone,
  checkInvoice,
  checkPaper,
  freezeState,
  rerouteTarget,
  spendingVerdicts,
  trulyAvailable,
  type GrantForRules,
} from '../src/rules';

const TODAY = '2026-06-15';
const grant = (over: Partial<GrantForRules> = {}): GrantForRules => ({
  id: 'G1', status: 'active', end: '2027-12-31', awarded: 100_000, spent: 40_000, promised: 10_000,
  frozen: false, ...over,
});
const supplies = (price: number) => ({ category: 'lab supplies', price, sharedWith: [], split: [] });
const failed = (vs: { rule: string; pass: boolean }[]) => vs.filter(v => !v.pass).map(v => v.rule);

describe('fund tracker', () => {
  test('truly available is awarded minus spent minus promised', () => {
    expect(trulyAvailable({ awarded: 420_000, spent: 171_400, promised: 12_350 })).toBe(236_250);
  });

  test('a cancellation freezes spending', () => {
    expect(freezeState('active', [{ day: '2026-03-10', kind: 'canceled' }], false)).toMatchObject({
      status: 'canceled', frozen: true,
    });
  });

  test('a court order restores the status but does not unfreeze', () => {
    const s = freezeState('active', [
      { day: '2026-03-10', kind: 'canceled' },
      { day: '2026-04-20', kind: 'court_order' },
    ], false);
    expect(s.status).toBe('restored_by_court');
    expect(s.frozen).toBe(true);
    expect(s.frozenReason).toContain('no payment has arrived');
  });

  test('a payment after the cancellation unfreezes', () => {
    expect(freezeState('active', [
      { day: '2026-03-10', kind: 'canceled' },
      { day: '2026-04-20', kind: 'court_order' },
      { day: '2026-06-20', kind: 'payment_received' },
    ], false)).toEqual({ status: 'active', frozen: false });
  });

  test('a payment before the cancellation does not unfreeze', () => {
    expect(freezeState('active', [
      { day: '2026-02-01', kind: 'payment_received' },
      { day: '2026-03-10', kind: 'canceled' },
    ], false).frozen).toBe(true);
  });

  test('an open source disagreement freezes an otherwise active grant', () => {
    expect(freezeState('active', [], true).frozen).toBe(true);
  });
});

describe('spending rules', () => {
  test('a clean supply buy on a healthy grant passes every rule', () => {
    expect(canBuyAlone(spendingVerdicts(supplies(640), grant(), TODAY))).toBe(true);
  });

  test('planted: supplies in the grant\'s last 90 days are flagged with the audit case', () => {
    const vs = spendingVerdicts(supplies(1_180), grant({ end: '2026-08-01' }), TODAY);
    expect(failed(vs)).toEqual(["Not in the grant's last 90 days"]);
    expect(vs.find(v => !v.pass)?.auditCase).toMatch(/WVU/);
  });

  test('planted: an unallowable item is blocked', () => {
    const vs = spendingVerdicts({ ...supplies(890), category: 'general office' }, grant(), TODAY);
    expect(failed(vs)).toEqual(['Category allowed']);
  });

  test('planted: a buy over the card limit cannot go through alone', () => {
    expect(failed(spendingVerdicts(supplies(5_001), grant(), TODAY))).toEqual(['Under the card limit ($5,000)']);
  });

  test('decoy: a buy exactly at the card limit passes', () => {
    expect(canBuyAlone(spendingVerdicts(supplies(5_000), grant(), TODAY))).toBe(true);
  });

  test('planted: a shared cost charged 100% to one grant is flagged', () => {
    const req = { category: 'equipment', price: 3_000, sharedWith: ['G1', 'G2'], split: [] };
    expect(failed(spendingVerdicts(req, grant(), TODAY))).toEqual(['Shared cost split across the grants it serves']);
  });

  test('decoy: a correct shared-cost split passes', () => {
    const g1 = grant();
    const g2 = grant({ id: 'G2' });
    const req = { category: 'equipment', price: 3_000, sharedWith: ['G1', 'G2'], split: [{ grantId: 'G1', share: 0.6 }, { grantId: 'G2', share: 0.4 }] };
    expect(canBuyAlone(spendingVerdicts(req, g1, TODAY, new Map([['G1', g1], ['G2', g2]])))).toBe(true);
  });

  test('a frozen grant fails, and the reason is the freeze reason', () => {
    const vs = spendingVerdicts(supplies(640), grant({ status: 'restored_by_court', frozen: true, frozenReason: 'Court order, no payment.' }), TODAY);
    expect(failed(vs)).toEqual(['Grant is active and not frozen']);
    expect(vs[0].detail).toBe('Court order, no payment.');
  });

  test('not enough truly available money fails', () => {
    expect(failed(spendingVerdicts(supplies(4_000), grant({ spent: 90_000, promised: 7_000 }), TODAY)))
      .toEqual(['Enough truly available money']);
  });

  test('a request blocked by the 90-day rule reroutes to a grant with time and money', () => {
    const ending = grant({ id: 'B', end: '2026-08-01' });
    const other = grant({ id: 'A' });
    expect(rerouteTarget(supplies(1_180), ending, TODAY, [ending, other])).toBe('A');
  });

  test('an unallowable item is not rerouted', () => {
    const g = grant();
    expect(rerouteTarget({ ...supplies(890), category: 'general office' }, g, TODAY, [g, grant({ id: 'A' })])).toBeUndefined();
  });
});

describe('invoice check', () => {
  const order = { id: 'o1', vendor: 'V', amount: 1_150, placed: '2026-05-01', state: 'open' };

  test('planted: an invoice for a canceled order is held with its timeline', () => {
    const v = checkInvoice({ amount: 2_400, received: '2026-06-11' },
      { ...order, amount: 2_400, placed: '2026-02-20', state: 'canceled', canceledOn: '2026-03-02' }, []);
    expect(v.matched).toBe(false);
    expect(v.mismatch).toContain('canceled on 2026-03-02');
    expect(v.timeline.map(e => e.day)).toEqual(['2026-02-20', '2026-03-02', '2026-06-11']);
  });

  test('planted: an invoice for a different amount than approved is held', () => {
    const v = checkInvoice({ amount: 1_400, received: '2026-06-08' }, order, [{ amount: 1_150, day: '2026-05-01', by: 'purchasing' }]);
    expect(v.matched).toBe(false);
    expect(v.mismatch).toContain('$1,150');
  });

  test('decoy: an invoice matching an approved change to the order passes', () => {
    const v = checkInvoice({ amount: 1_290, received: '2026-06-08' }, { ...order, state: 'changed', changedAmount: 1_290 },
      [{ amount: 1_290, day: '2026-05-04', by: 'grant_manager' }]);
    expect(v.matched).toBe(true);
  });
});

describe('report checker', () => {
  const ok = { grantId: 'A', creditsGrantId: 'A', pmcid: 'PMC1' };

  test('planted: a paper crediting the wrong grant is held', () => {
    expect(checkPaper({ ...ok, creditsGrantId: 'B' }).result).toBe('held');
  });

  test('planted: a paper missing its PMCID is held', () => {
    expect(checkPaper({ ...ok, pmcid: undefined }).result).toBe('held');
  });

  test('planted: an undisclosed material correction is held', () => {
    expect(checkPaper({ ...ok, correction: { kind: 'material', disclosed: false, note: 'Figure 3 corrected.' } }).result).toBe('held');
  });

  test('decoy: an author-affiliation correction is a note, not a hold', () => {
    expect(checkPaper({ ...ok, correction: { kind: 'minor', disclosed: false, note: 'Affiliation corrected.' } }).result).toBe('note');
  });

  test('decoy: a retracted paper cited to discuss the retraction (disclosed) is not held', () => {
    expect(checkPaper({ ...ok, correction: { kind: 'retraction', disclosed: true, note: 'Retracted; discussed.' } }).result).toBe('ok');
  });
});
