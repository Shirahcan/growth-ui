import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrowthProvider, PostSettings, postDraftFrom, postFieldsBody, useGrowthChromeState, type BlogPostDetail } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const post: BlogPostDetail = {
  uuid: 'p1', id: 1, title: 'CRS explained', slug: 'crs-explained', status: 'draft', body_format: 'html', category: { id: 4, name: 'Express Entry' },
  audience: null, stale_reason: null, live: false, has_unpublished_changes: false, published_at: null, scheduled_for: null, updated_at: null, public_url: null,
  dek: null, answer: 'Points decide who is invited.', body_html: '<p>x</p>', page_width: 'reading', layout_key: null, layout_version: null, category_id: 4,
  tags: [], author_name: 'Ada', cover: null, story_id: null, facts: [{ text: 'Draws are every two weeks', review_by: '2026-12-01', source_key: null }],
  meta_title: null, meta_description: 'How the score works', reader_questions: [], cta_kind: 'none', cta_ref: null, add_to_knowledge: false, linkedin_text: null,
  readiness: { score: 60, ready: false, checks: [{ key: 'answer', label: 'A summary', hint: null, ok: true, required: true, weight: 1 }, { key: 'questions', label: 'Reader questions', hint: 'Add at least two.', ok: false, required: true, weight: 1 }] },
  fields_version: 3,
};

const conflict = (version: number, by: string | null) => Object.assign(new Error('stale'), { response: { status: 409, data: { errors: { conflict: { fields_version: version, updated_by: by } } } } });
const refusal = (errors: Record<string, string[]>) => Object.assign(new Error('refused'), { response: { status: 422, data: { errors } } });

function mount(request: ReturnType<typeof vi.fn>, props: Partial<React.ComponentProps<typeof PostSettings>> = {}, onError = vi.fn()) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={onError} onNotice={vi.fn()} words={{ audiences: { applicants: 'Applicants' }, assistant: 'Porter', product: 'Portify' }}>
      <PostSettings uuid="p1" {...props} />
    </GrowthProvider>,
  );
}

/** A server whose stored copy moves on each successful save. */
function server(start: BlogPostDetail = post) {
  let stored = start;
  const request = vi.fn(async (method: string, _path: string, body?: Record<string, unknown>) => {
    if (method === 'GET') return { data: { post: stored, categories: [{ id: 4, name: 'Express Entry', slug: 'express-entry' }] } };
    stored = { ...stored, ...(body as object), fields_version: stored.fields_version + 1 } as BlogPostDetail;

    return { data: { post: stored } };
  });

  return request;
}

const puts = (request: ReturnType<typeof vi.fn>) => request.mock.calls.filter(([m]) => m === 'PUT');

/** A post's own fields on growth-service (S5 step 2): autosaved, guarded against a stale copy. */
describe('the post settings', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the post’s fields and its readiness, the address read-only', async () => {
    mount(server());

    expect(((await screen.findByLabelText('Title')) as HTMLInputElement).value).toBe('CRS explained');
    expect((screen.getByLabelText('Web address part') as HTMLInputElement).readOnly).toBe(true);
    expect((screen.getByLabelText('Web address part') as HTMLInputElement).value).toBe('/crs-explained');
    expect(screen.getByText('1 thing left')).toBeTruthy();
    expect(screen.getByText('Add at least two.')).toBeTruthy();
    expect(screen.getByLabelText('Page width')).toBeTruthy(); // a written post
  });

  it('names the post in the host’s top bar under the Blog crumb, and links a designed post to its designer', async () => {
    function Bar() {
      const chrome = useGrowthChromeState();

      return <div data-testid="bar">{chrome.title}|{chrome.parent?.label ?? ''}</div>;
    }
    const designed = { ...post, body_format: 'pml' as const, title: '' };
    render(
      <GrowthProvider product="portify" request={server(designed) as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
        <Bar />
        <PostSettings uuid="p1" designHref={(p) => (p.body_format === 'pml' ? `/design/${p.uuid}` : null)} />
      </GrowthProvider>,
    );

    expect((await screen.findByRole('link', { name: 'Open the design' })).getAttribute('href')).toBe('/design/p1');
    expect(screen.getByTestId('bar').textContent).toBe('Untitled post|Blog');
  });

  it('a written post has no designer link', async () => {
    mount(server(), { designHref: (p) => (p.body_format === 'pml' ? `/design/${p.uuid}` : null) });
    expect(await screen.findByLabelText('Title')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open the design' })).toBeNull();
  });

  it('saves a moment after the last change, from the version it saw, and the next save from the one it got back', async () => {
    const request = server();
    mount(request);
    const title = await screen.findByLabelText('Title');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(title, { target: { value: 'CRS explained, 2026' } });
    fireEvent.change(title, { target: { value: 'CRS explained for 2026' } });
    expect(puts(request)).toHaveLength(0);
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await waitFor(() => expect(puts(request)).toHaveLength(1));
    expect(puts(request)[0]?.[2]).toMatchObject({ title: 'CRS explained for 2026', if_fields_version: 3 });

    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Ada L.' } });
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    await waitFor(() => expect(puts(request)).toHaveLength(2));
    expect(puts(request)[1]?.[2]).toMatchObject({ author_name: 'Ada L.', if_fields_version: 4 });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved'));
  });

  it('a copy someone saved over is never written: keep mine resends from their version, load the latest refetches', async () => {
    let refuseOnce = true;
    const base = server();
    const request = vi.fn(async (method: string, path: string, body?: Record<string, unknown>) => {
      if (method === 'PUT' && refuseOnce) {
        refuseOnce = false;
        throw conflict(7, 'ada@example.com');
      }

      return base(method, path, body);
    });
    mount(request);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Mine' } });

    expect(await screen.findByText(/Someone \(ada@example.com\) saved this post after you opened it/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes');

    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    await waitFor(() => expect(puts(request)).toHaveLength(2));
    expect(puts(request)[1]?.[2]).toMatchObject({ title: 'Mine', if_fields_version: 7 });
    await waitFor(() => expect(screen.queryByText(/saved this post after you opened it/)).toBeNull());
  });

  it('a refused value is said in place and the change stays unsaved', async () => {
    const onError = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === 'GET') return { data: { post, categories: [] } };
      throw refusal({ meta_description: ['The search description may be 200 characters at most.'] });
    });
    mount(request, {}, onError);
    fireEvent.change(await screen.findByLabelText('Search description'), { target: { value: 'x' } });

    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toBe('The search description may be 200 characters at most.');
    expect(screen.getByRole('status').textContent).toBe('Unsaved changes');
    expect(onError).not.toHaveBeenCalled();
  });

  it('a designed post has no page width; a service ending asks which service; the ending reads in the product’s words', async () => {
    mount(server({ ...post, body_format: 'pml', cta_kind: 'service', cta_ref: 'pfl-support' }), {
      ctaWords: { booking: 'Find a licensed consultant' },
      serviceRefHint: 'The last part of the service’s marketplace link.',
    });

    await screen.findByLabelText('Title');
    expect(screen.queryByLabelText('Page width')).toBeNull();
    expect((screen.getByLabelText('Which service') as HTMLInputElement).value).toBe('pfl-support');
    expect(screen.getByText('The last part of the service’s marketplace link.')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Find a licensed consultant' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Nothing' })).toBeTruthy();
  });

  it('leaving with a change still waiting sends it', async () => {
    const request = server();
    const view = mount(request);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Left mid-edit' } });
    view.unmount();

    await waitFor(() => expect(puts(request)).toHaveLength(1));
    expect(puts(request)[0]?.[2]).toMatchObject({ title: 'Left mid-edit', if_fields_version: 3 });
  });

  it('stores only real rows and words: empty facts and questions are dropped, empty words are null', () => {
    const draft = {
      ...postDraftFrom(post),
      title: '  ',
      facts: [{ text: ' ', review_by: null, source_key: null }, { text: 'Fee is $85', review_by: '', source_key: null }],
      reader_questions: [{ q: '', a: 'orphan answer' }, { q: 'Who can apply?', a: ' Anyone ' }],
      cta_kind: 'booking' as const,
      cta_ref: 'left over',
    };
    expect(postFieldsBody(draft)).toMatchObject({
      title: null,
      facts: [{ text: 'Fee is $85', review_by: null, source_key: null }],
      reader_questions: [{ q: 'Who can apply?', a: 'Anyone' }],
      cta_ref: null,
    });
  });
});
