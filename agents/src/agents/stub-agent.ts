// Placeholder for the purchasing agent (T11). It puts every new request in
// the Inbox, so the path request → agent → Inbox → Log works end to end
// before any real rules exist.

import type { Connection, RequestRow } from '../db/contract.ts';

export function startStubAgent(conn: Connection): () => void {
  const handle = (request: RequestRow) => {
    // SpacetimeDB replays existing rows on reconnect, so skip requests this
    // agent has already answered.
    const answered = conn
      .rows('holds')
      .some(
        (hold) =>
          hold.raisedBy === conn.identity &&
          hold.kind === 'purchase' &&
          hold.refId === String(request.id),
      );
    if (answered) return;

    conn
      .call('raise_hold', {
        kind: 'purchase',
        refId: String(request.id),
        grantId: request.grantId,
        title: `Purchase: ${request.item}`,
        why: 'Stub agent: real rule checks arrive with T11, so every request waits for the grant manager.',
        evidence: [
          { label: 'Price', value: `$${request.price}` },
          { label: 'Grant asked for', value: request.grantId ?? 'none given' },
          { label: 'Purpose', value: request.purpose },
        ],
      })
      .catch((error: unknown) => {
        console.error(`stub agent: could not raise a hold for request ${request.id}`, error);
      });
  };

  for (const request of conn.rows('requests')) handle(request);
  return conn.onInsert('requests', handle);
}
