// Scores what the system decided against the answer key (sim/answer-key.json).
// Pure: takes every table's rows after the agents ran (eval/replay.mjs, which
// runs Track B's runSim()), the key, and the seed the run started from.
//
// Outcomes: a mistake is `caught` or `missed`; a decoy is a `false alarm` or
// a `correct pass`. A case the system never got to (no agent or check ran on
// it) is `missed` (or, for a decoy, `not run`) and marked notRun, so the
// scorecard says what isn't built rather than hiding it. Any hold, flag or
// exclusion on a record the key doesn't list is also a false alarm.

export const FEATURES = {
  fund_tracker: 'Fund tracker',
  purchases: 'Purchases',
  invoices: 'Invoices',
  payment_requests: 'Payment requests',
  reports: 'Progress reports',
};

const FREEZE_RULE = 'Grant is active and not frozen';

// A purchasing agent's action, as the request's state shows it.
const REQUEST_ACTION = { waiting_on_manager: 'hold', blocked: 'block', rerouted: 'reroute', bought: 'buy' };

const HOLD_FEATURE = {
  purchase: 'purchases',
  invoice: 'invoices',
  payment_request: 'payment_requests',
  follow_up: 'payment_requests',
  report: 'reports',
  source_disagreement: 'fund_tracker',
};

/** Throws on a key the scorer can't read. */
export function validateKey(key, seed) {
  const problems = [];
  if (!key || !Array.isArray(key.cases) || key.cases.length === 0) throw new Error('answer key: `cases` must be a non-empty array');
  const ids = new Set();
  for (const [i, c] of key.cases.entries()) {
    const at = `case ${c?.id ?? `#${i}`}`;
    for (const f of ['id', 'feature', 'kind', 'refId', 'expected', 'rule']) {
      if (typeof c?.[f] !== 'string' || !c[f]) problems.push(`${at}: missing \`${f}\``);
    }
    if (ids.has(c.id)) problems.push(`${at}: duplicate id`);
    ids.add(c.id);
    if (c.feature && !FEATURES[c.feature]) problems.push(`${at}: unknown feature "${c.feature}"`);
    if (c.kind && c.kind !== 'mistake' && c.kind !== 'decoy') problems.push(`${at}: kind must be mistake or decoy`);
    if (c.alsoAccept && !Array.isArray(c.alsoAccept)) problems.push(`${at}: alsoAccept must be an array`);
    if (c.feature === 'fund_tracker' && !flagKind(c) && c.expected === 'flag') problems.push(`${at}: check names no flag kind`);
  }
  if (seed && key.today && seed.today !== key.today) problems.push(`key is for ${key.today} but the seed is ${seed.today}`);
  if (problems.length) throw new Error(`answer key is malformed:\n  ${problems.join('\n  ')}`);
}

const flagKind = c => /kind: (\w+)/.exec(c.check ?? '')?.[1];
const accepted = c => [c.expected, ...(c.alsoAccept ?? [])];
const table = (tables, ...names) => names.map(n => tables[n]).find(Array.isArray) ?? [];

/**
 * @param {{ tables: Record<string, any[]>, key: any, seed: any }} input
 * @returns the scorecard (also what eval/scorecard.json holds)
 */
export function judge({ tables, key, seed }) {
  validateKey(key, seed);
  const t = {
    grant: table(tables, 'grant', 'grants'),
    flag: table(tables, 'flag', 'flags'),
    hold: table(tables, 'hold', 'holds'),
    request: table(tables, 'request', 'requests'),
    invoice: table(tables, 'invoice', 'invoices'),
    paymentRequest: table(tables, 'paymentRequest', 'payment_request', 'paymentRequests'),
    reportPaper: table(tables, 'reportPaper', 'report_paper', 'papers'),
  };
  const openFlags = t.flag.filter(f => f.open);
  const openHolds = t.hold.filter(h => h.open);
  const seedPrIds = new Set(seed.paymentRequests.map(p => p.id));
  const newPrs = t.paymentRequest.filter(p => !seedPrIds.has(p.id));

  // Things the seed already had open are history, not the system's decisions.
  const seedHolds = new Set(seed.holds.filter(h => !h.decision).map(h => `${h.kind}:${h.refId}`));
  const seedFlags = new Set(seed.flags.filter(f => f.open).map(f => `${f.kind}:${f.grantId}`));
  const newFlags = openFlags.filter(f => !seedFlags.has(`${f.kind}:${f.grantId}`));
  const newHolds = openHolds.filter(h => !seedHolds.has(`${h.kind}:${h.refId}`));
  const explained = new Set(); // hold ids and flag ids a case accounts for

  const verdictFor = (r, rule) => {
    const vs = (r?.verdicts ?? []).filter(v => v.rule.startsWith(rule));
    if (vs.length === 0) return undefined;
    return { pass: vs.every(v => v.pass), detail: vs.map(v => v.detail).join(' ') };
  };

  const judges = {
    fund_tracker(c) {
      const g = t.grant.find(x => x.id === c.grantId);
      if (c.expected === 'flag') {
        const kind = flagKind(c);
        const flags = newFlags.filter(f => f.kind === kind && f.grantId === c.grantId);
        flags.forEach(f => explained.add(`flag:${f.id}`));
        const holds = newHolds.filter(h => h.kind === 'source_disagreement' && flags.some(f => String(f.id) === h.refId));
        holds.forEach(h => explained.add(`hold:${h.id}`));
        if (flags.length) {
          return { got: 'flag', detail: `${kind} flag: ${flags[0].summary}${holds.length ? ' Sent to the Inbox.' : ''}${g?.frozen ? ' Grant frozen.' : ''}` };
        }
        return { got: 'no flag', detail: `No open ${kind} flag on ${c.grantId}.` };
      }
      // A grant event the system should not act on alone: the grant stays frozen.
      // `restored_by_court` and frozen means no payment has arrived since the cancellation.
      const kind = flagKind(c);
      const flags = kind ? newFlags.filter(f => f.kind === kind && f.grantId === c.grantId) : [];
      flags.forEach(f => explained.add(`flag:${f.id}`));
      const extra = !kind ? '' : flags.length ? ` ${kind} flag: ${flags[0].summary}` : ` No ${kind} flag.`;
      if (!g) return { got: 'no grant', detail: `No grant ${c.grantId}.` };
      if (g.frozen && g.status === 'restored_by_court' && (!kind || flags.length)) return { got: 'hold', detail: `Still frozen: ${g.frozenReason ?? ''}${extra}` };
      return { got: g.frozen ? `frozen (${g.status})` : 'unfrozen', detail: `${c.grantId} is ${g.status}, ${g.frozen ? 'frozen' : 'not frozen'}.${extra}` };
    },

    purchases(c) {
      const r = t.request.find(x => x.id === c.refId);
      if (!r) return { got: 'no request', detail: `No request ${c.refId}.` };
      const action = REQUEST_ACTION[r.state];
      const v = verdictFor(r, c.rule);
      newHolds.filter(h => h.kind === 'purchase' && h.refId === c.refId).forEach(h => explained.add(`hold:${h.id}`));
      if (!v && !action) {
        const evaluated = (r.verdicts ?? []).length > 0;
        return {
          got: evaluated ? 'rule not checked' : 'not evaluated', notRun: true,
          detail: evaluated ? `The module didn't check "${c.rule}" for ${c.refId}.` : `No verdicts on ${c.refId}.`,
        };
      }
      if (c.kind === 'decoy') {
        // A decoy may still wait for an unrelated reason (grant A's freeze).
        if (v && !v.pass) return { got: 'rule fails', alarm: true, detail: v.detail };
        return { got: 'pass', detail: v ? v.detail : `${action}.` };
      }
      if (action) {
        // The purchasing agent acted: score its choice too.
        const ok = accepted(c).includes(action) && (!v || !v.pass);
        return { got: action, caught: ok, detail: `${r.state}${v ? `; ${c.rule}: ${v.detail}` : ''}` };
      }
      // Verdicts only (no agent acted): caught when the cited rule fails.
      return v.pass
        ? { got: 'rule passes', detail: v.detail }
        : { got: 'rule fails', caught: true, detail: `${v.detail} (verdict only; no agent chose ${accepted(c).join(' / ')})` };
    },

    invoices(c) {
      const inv = t.invoice.find(x => x.id === c.refId);
      if (!inv) return { got: 'no invoice', detail: `No invoice ${c.refId}.` };
      if (!inv.checked) return { got: 'not checked', notRun: true, detail: 'Nobody checked this invoice.' };
      newHolds.filter(h => h.kind === 'invoice' && h.refId === c.refId).forEach(h => explained.add(`hold:${h.id}`));
      const got = inv.state === 'held' ? 'hold' : inv.state === 'matched' || inv.state === 'paid' ? 'pass' : inv.state;
      return { got, detail: inv.mismatch ?? `Invoice ${inv.state}.` };
    },

    payment_requests(c) {
      const prs = newPrs.filter(p => p.grantId === c.grantId);
      if (prs.length === 0) return { got: 'no request drafted', notRun: true, detail: `No new payment request for ${c.grantId}.` };
      prs.forEach(p => newHolds.filter(h => h.kind === 'payment_request' && h.refId === p.id).forEach(h => explained.add(`hold:${h.id}`)));
      const ex = prs.flatMap(p => p.excluded.filter(e => e.requestId === c.refId).map(e => ({ p, e })));
      const inc = prs.filter(p => p.includedRequestIds.includes(c.refId));
      const where = p => `${p.id} (${p.from} to ${p.to})`;
      if (inc.length) return { got: 'include', detail: `Included in ${inc.map(where).join(', ')}.` };
      if (ex.length) return { got: 'exclude', detail: `Left out of ${where(ex[0].p)}: ${ex[0].e.why}` };
      return { got: 'not mentioned', detail: `Neither included nor left out of ${prs.map(where).join(', ')}.` };
    },

    reports(c) {
      const p = t.reportPaper.find(x => x.id === c.refId);
      if (!p) return { got: 'no paper', detail: `No paper ${c.refId}.` };
      if (!p.checked) return { got: 'not checked', notRun: true, detail: 'Nobody checked this paper.' };
      newHolds.filter(h => h.kind === 'report' && h.refId === c.refId).forEach(h => explained.add(`hold:${h.id}`));
      const failed = (p.checks ?? []).filter(x => !x.pass);
      const got = p.result === 'held' ? 'hold' : p.result === 'ok' ? 'pass' : p.result;
      return { got, detail: failed.length ? failed.map(x => x.detail).join(' ') : `Result: ${p.result}.` };
    },
  };

  const cases = key.cases.map(c => {
    const j = judges[c.feature](c);
    const hit = j.caught ?? accepted(c).includes(j.got);
    let outcome;
    if (c.kind === 'mistake') outcome = hit ? 'caught' : 'missed';
    else if (j.notRun) outcome = 'not run';
    else outcome = j.alarm || !hit ? 'false alarm' : 'correct pass';
    return {
      id: c.id, feature: c.feature, kind: c.kind, refId: c.refId, expected: accepted(c).join(' or '),
      got: j.got, outcome, notRun: !!j.notRun && outcome !== 'caught', detail: j.detail,
    };
  });

  // Anything else the system held, flagged or left out is a false alarm.
  const keyed = new Set(key.cases.flatMap(c => [c.refId, ...(c.relatedIds ?? [])]));
  const extras = [];
  for (const h of newHolds) {
    if (explained.has(`hold:${h.id}`) || keyed.has(h.refId)) continue;
    if (h.kind === 'payment_request' || h.kind === 'follow_up') continue; // always go to the grant manager, by design
    if (h.kind === 'source_disagreement' && newFlags.some(f => String(f.id) === h.refId && explained.has(`flag:${f.id}`))) continue;
    extras.push({ feature: HOLD_FEATURE[h.kind] ?? 'other', refId: h.refId, what: `${h.kind} hold: ${h.why}` });
  }
  for (const f of newFlags) {
    if (!explained.has(`flag:${f.id}`)) extras.push({ feature: 'fund_tracker', refId: f.grantId, what: `${f.kind} flag: ${f.summary}` });
  }
  const seedSubmitted = new Set(seed.requests.filter(r => r.state === 'submitted').map(r => r.id));
  for (const r of t.request) {
    if (!seedSubmitted.has(r.id) || keyed.has(r.id)) continue;
    const failed = (r.verdicts ?? []).filter(v => !v.pass && !v.rule.startsWith(FREEZE_RULE));
    if (failed.length || r.state === 'blocked') extras.push({ feature: 'purchases', refId: r.id, what: `fails ${failed.map(v => v.rule).join('; ') || r.state}` });
  }
  for (const p of newPrs) {
    for (const e of p.excluded) if (!keyed.has(e.requestId)) extras.push({ feature: 'payment_requests', refId: e.requestId, what: `left out of ${p.id}: ${e.why}` });
  }

  const count = list => ({
    caught: list.filter(x => x.outcome === 'caught').length,
    missed: list.filter(x => x.outcome === 'missed').length,
    falseAlarms: list.filter(x => x.outcome === 'false alarm').length,
    correctPasses: list.filter(x => x.outcome === 'correct pass').length,
    notRun: list.filter(x => x.notRun).length,
    mistakes: list.filter(x => x.kind === 'mistake').length,
    decoys: list.filter(x => x.kind === 'decoy').length,
  });
  const features = Object.entries(FEATURES).map(([feature, label]) => {
    const n = count(cases.filter(x => x.feature === feature));
    const extra = extras.filter(x => x.feature === feature).length;
    return { feature, label, ...n, falseAlarms: n.falseAlarms + extra, unlistedFalseAlarms: extra };
  });
  const all = count(cases);
  return {
    seed: 'sim/seed.json',
    key: 'sim/answer-key.json',
    today: seed.today,
    totals: { ...all, falseAlarms: all.falseAlarms + extras.length, unlistedFalseAlarms: extras.length },
    features,
    cases,
    unlistedFalseAlarms: extras,
  };
}
