import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, createPostSteps, useCreatePostFlow, type CreatePostFlow, type CreatePostStepsOptions } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
const layouts = [
  { key: 'full-guide', name: 'Classic', parts: 9 },
  { key: 'news', name: 'News', parts: 4 },
];

/** A host wizard in miniature: draws the steps and keeps the flow for the test to drive. */
function Host({ onFlow, defaultTemplate, options, at = 0, start }: { onFlow: (f: CreatePostFlow) => void; defaultTemplate?: string; options?: CreatePostStepsOptions; at?: number; start?: 'document' | 'template' }) {
  const flow = useCreatePostFlow({ defaultTemplate, start });
  onFlow(flow);
  const step = createPostSteps(flow, options)[at]!;

  return <div>{step.render()}<p data-testid="valid">{step.validate() ?? 'ok'}</p></div>;
}

function mount(request: ReturnType<typeof vi.fn>, defaultTemplate?: string, options?: CreatePostStepsOptions, at = 0, start?: 'document' | 'template') {
  let flow: CreatePostFlow | null = null;
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <Host onFlow={(f) => { flow = f; }} defaultTemplate={defaultTemplate} options={options} at={at} start={start} />
    </GrowthProvider>,
  );

  return () => flow as unknown as CreatePostFlow;
}

/** Creating a post (blog on growth-service F1): pick a template, the post starts as its structure. */
describe('creating a post', () => {
  it('offers the post templates with the product’s default picked, and creates the post from the one chosen', async () => {
    const request = vi.fn(async (method: string, path: string, body?: unknown) => {
      if (method === 'GET') return { data: { layouts } };

      return { data: { post: { uuid: 'new-1', body_format: 'pml', layout_key: (body as { layout_key: string }).layout_key } } };
    });
    const flow = mount(request, 'full-guide');

    expect(await screen.findByRole('radio', { name: 'Classic' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Classic' }).getAttribute('aria-checked')).toBe('true');
    expect(request.mock.calls[0]?.slice(0, 2)).toEqual(['GET', 'layouts?kind=post']);
    expect(screen.getByText('9 parts')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'News' }));
    let created: Awaited<ReturnType<CreatePostFlow['create']>> = null;
    await act(async () => {
      created = await flow().create();
    });

    expect(request).toHaveBeenLastCalledWith('POST', 'blog/posts', { layout_key: 'news' });
    expect(created).toMatchObject({ uuid: 'new-1', layout_key: 'news' });
  });

  it('offers starting from a document with an optional cover, and asks for the document only when that is the choice', async () => {
    const documents = { accept: '.pdf,.docx,.txt,.md', maxMb: 5, assistant: 'Porter' };
    const flow = mount(vi.fn(async () => ({ data: { layouts } })), 'full-guide', { documents }, 1);

    expect(screen.getByRole('radio', { name: 'Start with the template’s guidance' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('valid').textContent).toBe('ok');

    fireEvent.click(screen.getByRole('radio', { name: 'Start from a document' }));
    expect(await screen.findByText(/Porter reads it and fills every part/)).toBeTruthy();
    expect(screen.getByLabelText('A cover photo (optional)')).toBeTruthy();
    expect(screen.getByTestId('valid').textContent).toBe('Choose the document, or start with the template’s guidance.');

    act(() => flow().setDocument(new File(['words'], 'guide.md', { type: 'text/markdown' })));
    await waitFor(() => expect(screen.getByTestId('valid').textContent).toBe('ok'));
    expect(screen.getByText('guide.md')).toBeTruthy();
  });

  it('a host’s Import a post opens the flow already on Start from a document, and the author can still switch', async () => {
    const documents = { accept: '.pdf,.docx,.txt,.md', maxMb: 5, assistant: 'Porter' };
    mount(vi.fn(async () => ({ data: { layouts } })), 'full-guide', { documents }, 1, 'document');

    expect(screen.getByRole('radio', { name: 'Start from a document' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('valid').textContent).toBe('Choose the document, or start with the template’s guidance.');
    fireEvent.click(screen.getByRole('radio', { name: 'Start with the template’s guidance' }));
    await waitFor(() => expect(screen.getByTestId('valid').textContent).toBe('ok'));
  });

  it('without a host that reads documents there is no second step', () => {
    let steps = 0;
    function Count() {
      steps = createPostSteps(useCreatePostFlow()).length;

      return null;
    }
    render(<GrowthProvider product="portify" request={vi.fn(async () => ({ data: { layouts } })) as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}><Count /></GrowthProvider>);
    expect(steps).toBe(1);
  });

  it('says plainly when the blog has no post templates, and the step cannot go on', async () => {
    mount(vi.fn(async () => ({ data: { layouts: [] } })));

    expect(await screen.findByText(/no post templates set up yet/)).toBeTruthy();
    expect(screen.getByTestId('valid').textContent).toBe('Pick a template to start from.');
  });

  it('a refused create is said on the step in the service’s words', async () => {
    const refused = Object.assign(new Error('refused'), { response: { status: 422, data: { errors: { layout_key: ['"News" is retired, so a new post cannot start from it.'] } } } });
    const request = vi.fn(async (method: string) => {
      if (method === 'GET') return { data: { layouts } };
      throw refused;
    });
    const flow = mount(request);
    await screen.findByRole('radio', { name: 'Classic' });

    await act(async () => {
      await flow().create();
    });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('"News" is retired, so a new post cannot start from it.'));
  });
});
