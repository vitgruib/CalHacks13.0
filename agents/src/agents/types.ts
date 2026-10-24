// What every agent gets from the worker, and what it hands back.

import type { Connection } from '../db/contract.ts';
import type { PaperLookup } from '../sources/papers.ts';
import type { Tracker } from './bookkeeping.ts';

export interface AgentContext {
  // This agent's own connection: the module checks every action by its identity.
  conn: Connection;
  // Call tracker.refresh(grantId) right before money moves.
  tracker: Tracker;
  // Public records about papers (Crossref, PubMed, PMC), cached for offline use.
  papers: PaperLookup;
}

export interface AgentHandle {
  // Resolves once the agent has nothing left to do.
  idle(): Promise<void>;
  stop(): void;
}

export interface WorkQueue {
  // Runs work after everything queued before it. Never rejects: a failure is
  // logged under the agent's name, so one bad row can't stop the agent.
  push(label: string, work: () => Promise<void>): Promise<void>;
  idle(): Promise<void>;
}

// One job at a time per agent, so two triggers (a new row and its update)
// can't act on the same request twice.
export function workQueue(agent: string): WorkQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    push(label, work) {
      tail = tail.then(work).catch((error: unknown) => {
        console.error(`${agent}: ${label} failed:`, error instanceof Error ? error.message : error);
      });
      return tail;
    },
    idle: () => tail,
  };
}
