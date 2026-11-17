import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrowthProvider } from '../src';
import { PostSeoPanel, PostSeoScore, seoScoreColor, type PostSeoPanelProps } from '../src/blog/PostSeoPanel';

const SEO = {
  score: 74,
  pass: 85,
  serp: { url: 'portify.shirah.co › blog › work-permits', title: 'Who can apply for a work permit | Portify', description: 'Most people with a job offer can apply.' },
  groups: [
    { name: 'Basic SEO', errors: 1, items: [{ label: 'Focus keyword is set', ok: true, weight: 4, field: 'focus_keyword' }, { label: 'Focus keyword in the first 10% of the content', ok: false, weight: 5, part: 'hook' }] },
    { name: 'Title readability', errors: 0, items: [{ label: 'Title contains a number', ok: true, weight: 2, field: 'title' }] },
  ],
};

const FIELDS = { values: { focus_keyword: 'work permit', secondary_keywords: 'lmia, job offer' }, revision: 3 };

function requestFor(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (method: string, path: string) => {
    const key = `${method} ${path}`;
    if (key in overrides) return overrides[key];
    if (method === 'GET' && path.endsWith('/document/seo')) return { data: SEO };
    if (method === 'GET' && path.endsWith('/document/fields')) return { data: FIELDS };
    if (method === 'PUT') return { data: { revision: 4 } };
    throw new Error(`unexpected ${key}`);
  });
}

function mount(request: ReturnType<typeof vi.fn>, props: Partial<PostSeoPanelProps> = {}) {
  const onError = vi.fn();

  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={((t: string) => `/admin/growth/${t}`) as never} onError={onError} onNotice={vi.fn()}
      words={{ audiences: {}, assistant: 'Porter', product: 'Portify' }}>
      <PostSeoPanel uuid="p1" {...props} />
    </GrowthProvider>,
  );

  return { onError };
}

/** The post's search panel (owner 2026-11-17, T2: the reference studio's Rank Math sidebar), as a slide-in panel's content. */
describe('the post search panel', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the score against the pass mark, the search preview, the keywords and the grouped checks', async () => {
    mount(requestFor());

    expect(await screen.findByText('74/100')).toBeTruthy();
    expect(screen.getByText('The pass mark is 85.')).toBeTruthy();
    expect(screen.getByText('Who can apply for a work permit | Portify')).toBeTruthy();
    expect(await screen.findByDisplayValue('work permit')).toBeTruthy();
    expect(screen.getByLabelText('Keywords in use').textContent).toBe('work permitlmiajob offer');
    expect(screen.getByText('1 to fix')).toBeTruthy();
    expect(screen.getByText('All passed')).toBeTruthy();
  });

  it('opens where a check is fixed: a part of the design or a field', async () => {
    const onJump = vi.fn();
    mount(requestFor(), { onJump });

    fireEvent.click(await screen.findByRole('button', { name: /Focus keyword in the first 10% of the content/ }));
    expect(onJump).toHaveBeenCalledWith({ part: 'hook' });
    fireEvent.click(screen.getByRole('button', { name: /Title contains a number/ }));
    expect(onJump).toHaveBeenCalledWith({ field: 'title' });
  });

  it('saves a keyword on leaving the box, with the fields revision, then reads the checks again', async () => {
    const request = requestFor();
    mount(request);

    const focus = (await screen.findByDisplayValue('work permit')) as HTMLInputElement;
    fireEvent.change(focus, { target: { value: 'canada work permit' } });
    await act(async () => { fireEvent.blur(focus); });

    expect(request).toHaveBeenCalledWith('PUT', 'blog/posts/p1/document/fields/focus_keyword', { value: 'canada work permit', revision: '3', session: 'growth-seo:p1' });
    await waitFor(() => expect(request.mock.calls.filter(([m, p]) => m === 'GET' && String(p).endsWith('/document/seo')).length).toBe(2));
  });

  it('a keyword changed elsewhere meanwhile is never overwritten: it says so and offers the latest', async () => {
    const conflict = Object.assign(new Error('changed'), { response: { status: 409 } });
    const request = requestFor();
    request.mockImplementation(async (method: string, path: string) => {
      if (method === 'PUT') throw conflict;
      if (path.endsWith('/document/seo')) return { data: SEO };
      return { data: FIELDS };
    });
    mount(request);

    const focus = (await screen.findByDisplayValue('work permit')) as HTMLInputElement;
    fireEvent.change(focus, { target: { value: 'something else' } });
    await act(async () => { fireEvent.blur(focus); });

    expect(screen.getByRole('alert').textContent).toContain('changed somewhere else');
    expect(screen.getByRole('button', { name: 'Load the latest' })).toBeTruthy();
  });

  it('the score chip is coloured good, fair or poor and opens the panel', () => {
    const onOpen = vi.fn();
    render(<PostSeoScore score={74} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: /Search score 74 out of 100/ }));
    expect(onOpen).toHaveBeenCalled();
    expect([seoScoreColor(90), seoScoreColor(60), seoScoreColor(20)]).toEqual(['#15803D', '#C27803', '#C62828']);
  });
});
