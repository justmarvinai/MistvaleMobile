import { describe, expect, it } from 'vitest';
import { oneAtATime } from './oneAtATime';

/** A promise plus the handles to settle it from the test. */
function deferred(): { promise: Promise<void>; resolve: () => void; reject: () => void } {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((ok, no) => {
    resolve = ok;
    reject = () => no(new Error('nope'));
  });
  return { promise, resolve, reject };
}

describe('one request on the wire', () => {
  it('never lets two jobs overlap', async () => {
    const only = oneAtATime();
    const first = deferred();
    const second = deferred();
    const order: string[] = [];

    const a = only(async () => {
      order.push('a:start');
      await first.promise;
      order.push('a:end');
    });
    const b = only(async () => {
      order.push('b:start');
      await second.promise;
      order.push('b:end');
    });

    // b has not begun: a is still holding the wire.
    await Promise.resolve();
    expect(order).toEqual(['a:start']);

    first.resolve();
    await a;
    second.resolve();
    await b;

    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('hands the wire on when a job fails, rather than wedging', async () => {
    const only = oneAtATime();
    let ran = false;

    await only(() => Promise.reject(new Error('the network')));
    await only(async () => {
      ran = true;
    });

    expect(ran).toBe(true);
  });

  it('resolves rather than rejecting, so a caller can carry on', async () => {
    const only = oneAtATime();
    await expect(only(() => Promise.reject(new Error('the network')))).resolves.toBeUndefined();
  });

  it('is finished when the caller it belongs to is', async () => {
    const only = oneAtATime();
    const gate = deferred();
    let done = false;

    const job = only(async () => {
      await gate.promise;
      done = true;
    });
    expect(done).toBe(false);
    gate.resolve();
    await job;
    expect(done).toBe(true);
  });
});
