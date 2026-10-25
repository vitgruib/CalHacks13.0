// Starts the agents, each on its own connection and identity, and registers
// each identity's role with the database. The bookkeeping agent runs the
// invoice check and Ask's item check; the payment and report agent runs two
// loops (cut in T105). There is no purchasing agent (T108): every request
// goes to the grant office.

import { startTracker, type Tracker } from './agents/bookkeeping.ts';
import { startInvoices } from './agents/invoices.ts';
import { startItemChecks } from './agents/item-check.ts';
import { startPaymentRequests } from './agents/payment-requests.ts';
import { startReportChecker } from './agents/report-checker.ts';
import type { AgentHandle } from './agents/types.ts';
import type { Connection, Db } from './db/contract.ts';
import { memoryDay, memoryTokens, type DayStore, type TokenStore } from './identity.ts';
import { ROLES, type Role } from './roles.ts';
import { createPaperLookup, type PaperLookup } from './sources/papers.ts';
import type { SourceClient } from './sources/types.ts';

export interface WorkerOptions {
  // Government sources the fund tracker reads (none by default).
  sources?: SourceClient[];
  // Public records about papers; defaults to the cached Crossref/PubMed client.
  papers?: PaperLookup;
  // Where agent tokens are kept (fileTokens for a real server); in memory by default.
  tokens?: TokenStore;
  // The last clock day the worker saw, kept like the tokens (fileDay for a real server).
  lastDay?: DayStore;
}

export interface Worker {
  sessions: Record<Role, Connection>;
  // Other agents call tracker.refresh(grantId) right before money moves.
  tracker: Tracker;
  // Resolves once no agent has anything left to do and the database is quiet.
  idle(): Promise<void>;
  stop(): void;
}

export async function startWorker(
  db: Db,
  { sources = [], papers, tokens = memoryTokens(), lastDay = memoryDay() }: WorkerOptions = {},
): Promise<Worker> {
  const sessions = {} as Record<Role, Connection>;
  for (const role of ROLES) {
    const conn = await db.connect({ token: tokens.load(role) });
    tokens.save(role, conn.token);
    await conn.call('register_agent', { role });
    sessions[role] = conn;
  }

  const tracker = startTracker(sessions.bookkeeping, sources);
  const lookup = papers ?? createPaperLookup();
  const agents: AgentHandle[] = [
    startItemChecks({ conn: sessions.bookkeeping }),
    startInvoices({ conn: sessions.bookkeeping, tracker, papers: lookup }),
    startPaymentRequests({ conn: sessions.payment_report, tracker, papers: lookup, lastDay }),
    startReportChecker({ conn: sessions.payment_report, tracker, papers: lookup }),
  ];

  return {
    sessions,
    tracker,
    async idle() {
      // One agent's action can wake another (an invoice check after a source
      // check), so wait until a whole round passes
      // with no new change.
      for (let round = 0; round < 100; round++) {
        const before = db.version();
        await db.settled();
        await tracker.idle();
        await Promise.all(agents.map((agent) => agent.idle()));
        await db.settled();
        if (db.version() === before) return;
      }
      throw new Error('worker: still busy after 100 rounds; two agents may be answering each other forever');
    },
    stop() {
      tracker.stop();
      for (const agent of agents) agent.stop();
      for (const conn of Object.values(sessions)) conn.disconnect();
    },
  };
}
