/**
 * An on-demand AI writer's run on growth-service (G7d2). The request that asks returns at once with a pending run;
 * this polls `writer-runs/{uuid}` until the run is done or failed, so no request ever waits on the model.
 */
export interface WriterRun<T = unknown> {
  uuid: string;
  kind: string;
  status: 'pending' | 'done' | 'failed';
  result: T | null;
  error: string | null;
}

export class WriterRunFailed extends Error {}

export interface WaitOptions {
  /** How often to ask, in ms. */
  everyMs?: number;
  /** Give up after this long, in ms (the worker's own limit is 3 minutes). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Polls until the run settles. `read(uuid)` is the host's GET of `writer-runs/{uuid}` through its own proxy, returning
 * the run. Resolves with the result; rejects with WriterRunFailed carrying the writer's own reason.
 */
export async function waitForWriterRun<T>(first: WriterRun<T>, read: (uuid: string) => Promise<WriterRun<T>>, opts: WaitOptions = {}): Promise<T> {
  const every = opts.everyMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 200_000);
  let run = first;
  while (run.status === 'pending') {
    if (opts.signal?.aborted) throw new WriterRunFailed('Stopped.');
    if (Date.now() > deadline) throw new WriterRunFailed('The writer is taking longer than expected. Try again in a minute.');
    await new Promise((r) => setTimeout(r, every));
    run = await read(run.uuid);
  }
  if (run.status === 'failed' || run.result === null) throw new WriterRunFailed(run.error ?? 'The writer could not finish.');

  return run.result;
}
