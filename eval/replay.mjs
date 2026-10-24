// Runs a seed through the system and returns every table's rows afterwards.
// Nothing here reads the answer key: the key only enters in judge.mjs, after
// every decision has been made.
//
// Two runs:
// - `agents`: Track B's runSim() (agents/src/sim.ts) as is. The seed goes
//   into Track A's real module and all agents run until quiet. An agent that
//   isn't built yet does nothing, so its cases score as "not run".
// - `standIns`: the same run, then a plain call to the action each unbuilt
//   agent would make on every record still waiting for it. The module still
//   makes every decision; this only shows how far the rules alone get.
import { runSim } from '../agents/src/sim.ts';
import { addDays } from '../server/src/rules.ts';

/** What the stand-in run does in place of an agent that isn't built yet. */
export const STAND_INS = {
  purchases: 'evaluate_request on each request still submitted; scores the module\'s rule verdicts (no hold / block / reroute choice).',
  invoices: 'check_invoice on each unchecked invoice.',
  payment_requests: 'draft_payment_request for the month after each grant\'s latest request, once that month has ended.',
  reports: 'record_paper_facts with the facts already on each paper in the seed (no public-records lookup).',
};

/** End of the month that `day` falls in. */
function monthEnd(day) {
  const d = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {any} seed a parsed sim/seed.json-shaped world
 * @param {{ standIns?: boolean }} options
 * @returns {Promise<{ tables: Record<string, any[]>, errors: string[] }>}
 */
export async function replay(seed, { standIns = false } = {}) {
  const run = await runSim({ seedJson: JSON.stringify(seed) });
  const errors = [];
  try {
    if (standIns) {
      const as = run.worker.sessions;
      const rows = t => as.bookkeeping.rows(t);
      const attempt = async (conn, action, args, what) => {
        try {
          await conn.call(action, args);
        } catch (e) {
          errors.push(`${action} ${what}: ${e instanceof Error ? e.message : e}`);
        }
      };
      const today = as.bookkeeping.today();

      for (const r of rows('request').filter(x => x.state === 'submitted' && x.verdicts.length === 0)) {
        await attempt(as.purchasing, 'evaluate_request', { requestId: r.id, split: r.split }, r.id);
      }
      for (const inv of rows('invoice').filter(x => !x.checked && x.state !== 'paid' && x.state !== 'rejected')) {
        await attempt(as.bookkeeping, 'check_invoice', { invoiceId: inv.id }, inv.id);
      }
      for (const g of rows('grant')) {
        const latest = rows('paymentRequest').filter(x => x.grantId === g.id).sort((a, b) => (a.to < b.to ? -1 : 1)).at(-1);
        const from = latest ? addDays(latest.to, 1) : g.start;
        const to = monthEnd(from);
        if (to >= today) continue; // that month isn't over yet
        await attempt(as.payment_report, 'draft_payment_request', {
          grantId: g.id, from, to, explanation: `Reimbursement of direct costs on ${g.id} for ${from} to ${to} (stand-in draft).`,
        }, `${g.id} ${from}..${to}`);
      }
      for (const p of rows('reportPaper').filter(x => !x.checked)) {
        await attempt(as.payment_report, 'record_paper_facts', {
          paperId: p.id, creditsGrantId: p.creditsGrantId, pmcid: p.pmcid, correction: p.correction,
        }, p.id);
      }
      await run.worker.idle();
    }
    const conn = run.worker.sessions.bookkeeping;
    const tables = Object.fromEntries(Object.keys(run.tables).map(t => [t, conn.rows(t)]));
    return { tables, errors };
  } finally {
    run.stop();
  }
}
