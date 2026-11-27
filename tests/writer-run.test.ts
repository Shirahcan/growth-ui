import { describe, expect, it, vi } from 'vitest';
import { waitForWriterRun, WriterRunFailed, type WriterRun } from '../src';

const run = (status: WriterRun['status'], result: unknown = null, error: string | null = null): WriterRun => ({ uuid: 'u1', kind: 'landing_copy', status, result, error });

describe('writer runs (G7d2)', () => {
  it('polls a pending run until it is done', async () => {
    const read = vi.fn().mockResolvedValueOnce(run('pending')).mockResolvedValueOnce(run('done', { copy: { headline: 'Hi' } }));
    await expect(waitForWriterRun(run('pending'), read, { everyMs: 1 })).resolves.toEqual({ copy: { headline: 'Hi' } });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a failed run rejects with the writer\'s own reason', async () => {
    const read = vi.fn().mockResolvedValue(run('failed', null, 'The writer could not be reached just now.'));
    await expect(waitForWriterRun(run('pending'), read, { everyMs: 1 })).rejects.toThrow(new WriterRunFailed('The writer could not be reached just now.'));
  });
});
