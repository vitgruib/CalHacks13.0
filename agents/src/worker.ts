// Starts the three agents, each on its own connection and identity, and
// registers each identity's role with the database. The bookkeeping and the
// payment and report agents each run two loops on their one identity.

import { startTracker, type Tracker } from './agents/bookkeeping.ts';
import { startInvoices } from './agents/invoices.ts';
import { startPaymentRequests } from './agents/payment-requests.ts';
import { startPurchasing } from './agents/purchasing.ts';
import { startReportChecker } from './agents/report-checker.ts';
import type { AgentHandle } from './agents/types.ts';
import type { Connection, Db } from './db/contract.ts';
import { memoryTokens, type TokenStore } from './identity.ts';
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
  { sources = [], papers, tokens = memoryTokens() }: WorkerOptions = {},
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
    startPurchasing({ conn: sessions.purchasing, tracker, papers: lookup }),
    startInvoices({ conn: sessions.bookkeeping, tracker, papers: lookup }),
    startPaymentRequests({ conn: sessions.payment_report, tracker, papers: lookup }),
    startReportChecker({ conn: sessions.payment_report, tracker, papers: lookup }),
  ];

  return {
    sessions,
    tracker,
    async idle() {
      // One agent's action can wake another (a payment unfreezes a grant, and
      // purchasing buys what was waiting), so wait until a whole round passes
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
