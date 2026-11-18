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

/** The service's fuller answer (2026-11-18): its limits and the draft as the page will receive it. */
const SEO_FULL = {
  ...SEO,
  limits: { title_max: 60, meta_min: 150, meta_max: 155, url_max: 75 },
  preview: {
    slug: 'work-permits', url: 'https://portify.example/blog/work-permits', title: 'Who can apply for a work permit', answer: 'Most people with a job offer.',
    meta_title: '', meta_description: 'Most people with a job offer can apply.', author_name: 'Ada Okafor', published_at: null, updated_at: '2026-11-18T10:00:00Z',
    category: { slug: 'work', name: 'Work and LMIA' }, cover: null, reader_questions: [{ q: 'Do I need an LMIA?', a: 'Usually.' }],
    robots: { index: true, follow: true }, canonical_url: null, social: { title: null, description: null },
  },
};
const FULL_FIELDS = { values: { ...FIELDS.values, title: 'Who can apply for a work permit', slug: 'work-permits', meta_title: '', meta_description: 'Short.', robots_index: true, robots_follow: true, canonical_url: '', social_title: '', social_description: '' }, revision: 3 };
const SITE = { origin: 'https://portify.example', name: 'Portify', language: 'en-CA' };

function fullRequest(put?: (path: string, body: unknown) => unknown) {
  return vi.fn(async (method: string, path: string, body?: unknown) => {
    if (method === 'GET' && path.endsWith('/document/seo')) return { data: SEO_FULL };
    if (method === 'GET' && path.endsWith('/document/fields')) return { data: FULL_FIELDS };
    if (method === 'PUT') return put ? put(path, body) : { data: { revision: 4 } };
    throw new Error(`unexpected ${method} ${path}`);
  });
}

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
    const onSaved = vi.fn();
    mount(request, { onSaved });

    const focus = (await screen.findByDisplayValue('work permit')) as HTMLInputElement;
    fireEvent.change(focus, { target: { value: 'canada work permit' } });
    await act(async () => { fireEvent.blur(focus); });
    expect(onSaved).toHaveBeenCalledTimes(1);

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

  it('has the reference studio’s four tabs, and the snippet meters use the product’s own limits', async () => {
    const onDraftSnippet = vi.fn();
    mount(fullRequest(), { site: SITE, onDraftSnippet });

    expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['General', 'Advanced', 'Schema', 'Social']);
    expect(await screen.findByDisplayValue('Short.')).toBeTruthy();
    expect(screen.getByText(/6 \/ 150 to 155/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Draft the title and description with the assistant' }));
    expect(onDraftSnippet).toHaveBeenCalled();
  });

  it('Advanced: switching a post out of search saves it at once and says what it means', async () => {
    const request = fullRequest();
    mount(request, { site: SITE });

    fireEvent.click(await screen.findByRole('tab', { name: 'Advanced' }));
    await act(async () => { fireEvent.click(await screen.findByRole('switch', { name: 'Show this post in search results' })); });
    expect(request).toHaveBeenCalledWith('PUT', 'blog/posts/p1/document/fields/robots_index', { value: false, revision: '3', session: 'growth-seo:p1' });
  });

  it('Advanced: a refused canonical address is said on the field, not as a page error', async () => {
    const refused = Object.assign(new Error('invalid'), { response: { status: 422, data: { errors: { value: ['The canonical address must be a full https address.'] } } } });
    const request = fullRequest(() => { throw refused; });
    const { onError } = mount(request, { site: SITE });

    fireEvent.click(await screen.findByRole('tab', { name: 'Advanced' }));
    const box = await screen.findByLabelText('Canonical address');
    fireEvent.change(box, { target: { value: 'http://elsewhere.example' } });
    await act(async () => { fireEvent.blur(box); });

    expect((await screen.findByRole('alert')).textContent).toBe('The canonical address must be a full https address.');
    expect(onError).not.toHaveBeenCalled();
  });

  it('Schema: the structured data the page will emit, from the page’s own builder', async () => {
    mount(fullRequest(), { site: SITE });

    fireEvent.click(await screen.findByRole('tab', { name: 'Schema' }));
    expect(await screen.findByText(/FAQ, built from the 1 questions the post answers/)).toBeTruthy();
    const json = screen.getByLabelText('The structured data, as the page emits it').textContent ?? '';
    expect(json).toContain('"FAQPage"');
    expect(json).toContain('https://portify.example/blog/category/work');
  });

  it('Social: the share card falls back to the search words, and its own title saves on leaving the box', async () => {
    const request = fullRequest();
    mount(request, { site: SITE });

    fireEvent.click(await screen.findByRole('tab', { name: 'Social' }));
    expect(await screen.findByText('Most people with a job offer can apply.')).toBeTruthy();
    expect(screen.getByText('portify.example')).toBeTruthy();
    const title = screen.getByLabelText('Title when shared');
    fireEvent.change(title, { target: { value: 'Work in Canada with a job offer' } });
    await act(async () => { fireEvent.blur(title); });
    expect(request).toHaveBeenCalledWith('PUT', 'blog/posts/p1/document/fields/social_title', { value: 'Work in Canada with a job offer', revision: '3', session: 'growth-seo:p1' });
  });

  it('without the site’s details, Schema and Social say so rather than guessing an address', async () => {
    mount(fullRequest());

    fireEvent.click(await screen.findByRole('tab', { name: 'Schema' }));
    expect(screen.getByText(/needs the site.s own details/)).toBeTruthy();
  });
});
