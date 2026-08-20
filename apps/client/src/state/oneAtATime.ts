/**
 * One request on the wire at a time.
 *
 * A battle has two things that talk to the server on their own schedule: auto-battle,
 * which asks for a few turns every couple of seconds, and Skip, which asks for whatever is
 * left. They must not overlap. Two `act` calls in flight against the same session would
 * both slice the event log at a length the other has already moved past, which reaches the
 * player as replayed turns — the same hit landing twice on a champion who is already down.
 *
 * `busy` in the store answers "is something in flight" and is what the *buttons* read.
 * This answers "let me have my turn", which is what a caller who needs its own work to
 * actually happen has to wait on.
 *
 * A job that throws does not wedge the queue: failures belong to the caller, which records
 * them wherever it records errors, and the next job runs regardless.
 */
export function oneAtATime(): (work: () => Promise<void>) => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return async function only(work: () => Promise<void>): Promise<void> {
    // A loop rather than a single await: several callers can be waiting on the same job,
    // and each of them has to re-check rather than assume the wire is theirs.
    while (inFlight) await inFlight;
    const running = work().catch(() => undefined);
    inFlight = running;
    try {
      await running;
    } finally {
      if (inFlight === running) inFlight = null;
    }
  };
}
