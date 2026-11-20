import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider } from '../src/GrowthProvider';
import { newTemplateSteps } from '../src/templates/NewTemplateSteps';
import { useNewTemplateFlow } from '../src/templates/useNewTemplateFlow';

/** Growth templates D2 (owner 2026-11-20): a template made blank, as a copy, or from a post with its words chosen. */
function wrap(request: ReturnType<typeof vi.fn>) {
  return ({ children }: { children: ReactNode }) => (
    <GrowthProvider product="portify" request={request as never} hrefFor={(() => '#') as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      {children}
    </GrowthProvider>
  );
}

const call = (request: ReturnType<typeof vi.fn>, method: string, path: string) => request.mock.calls.find((c) => c[0] === method && c[1] === path);

describe('making a template', () => {
  it('asks what it is for, where it starts and its name; the words only for a post or newsletter', () => {
    const request = vi.fn(async () => ({ data: { layouts: [], posts: [] } }));
    const { result } = renderHook(() => useNewTemplateFlow(), { wrapper: wrap(request) });

    expect(newTemplateSteps(result.current).map((s) => s.id)).toEqual(['kind', 'start', 'name']);
    act(() => result.current.patch({ kind: 'post', start: 'copy' }));
    expect(newTemplateSteps(result.current).map((s) => s.id)).toEqual(['kind', 'start', 'source', 'name']);
    act(() => result.current.patch({ start: 'item' }));
    expect(newTemplateSteps(result.current).map((s) => s.id)).toEqual(['kind', 'start', 'source', 'words', 'name']);
  });

  it('a blank one and a copy go to the create row; a post goes to its own row with the words chosen', async () => {
    const request = vi.fn(async () => ({ data: { layout: { key: 'made', kind: 'post', name: 'Made', version: 1, status: 'active', parts: 1 }, layouts: [], posts: [{ uuid: 'p-1', title: 'LMIA guide' }] } }));
    const { result } = renderHook(() => useNewTemplateFlow(), { wrapper: wrap(request) });

    act(() => result.current.patch({ kind: 'post', start: 'blank', name: 'Short answer' }));
    await act(async () => { await result.current.create(); });
    expect(call(request, 'POST', 'layouts')?.[2]).toEqual({ kind: 'post', name: 'Short answer' });

    act(() => result.current.patch({ start: 'copy', from: 'full-guide', name: 'Classic copy' }));
    await act(async () => { await result.current.create(); });
    expect(request.mock.calls.filter((c) => c[0] === 'POST' && c[1] === 'layouts').at(-1)?.[2]).toEqual({ kind: 'post', name: 'Classic copy', from: 'full-guide' });

    act(() => result.current.patch({ start: 'item', from: 'p-1', words: 'keep', name: 'LMIA template' }));
    await act(async () => { await result.current.create(); });
    expect(call(request, 'POST', 'layouts/from-post/p-1')?.[2]).toEqual({ name: 'LMIA template', words: 'keep' });

    await waitFor(() => expect(call(request, 'GET', 'blog/posts')).toBeTruthy());
  });

  it('keeps the service refusing a name in its own words', async () => {
    const request = vi.fn(async (method: string) => {
      if (method === 'POST') throw new Error('A template already has that name. Choose another.');

      return { data: { layouts: [] } };
    });
    const { result } = renderHook(() => useNewTemplateFlow({ kind: 'email', start: 'blank', name: 'Weekly' }), { wrapper: wrap(request) });

    let made: unknown = 'not yet';
    await act(async () => { made = await result.current.create(); });

    expect(made).toBeNull();
    expect(result.current.refusal).toBe('A template already has that name. Choose another.');
  });
});
