import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider } from '../src/GrowthProvider';
import { createPostSteps, type CreatePostStepsOptions } from '../src/blog/CreatePostSteps';
import { useCreatePostFlow } from '../src/blog/useCreatePostFlow';
import { TemplateCards, stillPage } from '../src/blog/TemplateCards';

/** The template picker as preview cards (owner 2026-11-17: "preview cards (similar to what MS Word does)"). */
const layouts = [
  { key: 'full-guide', name: 'Classic', parts: 9 },
  { key: 'news', name: 'News', parts: 4 },
];
const tree = [{ primitive: 'heading', props: { text: 'The question your post answers' } }];

function Step({ options }: { options: CreatePostStepsOptions }) {
  const flow = useCreatePostFlow({ defaultTemplate: 'full-guide' });

  return <>{createPostSteps(flow, options)[0]?.render()}</>;
}

function mount(request: ReturnType<typeof vi.fn>, options: CreatePostStepsOptions = {}) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={(() => '#') as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <Step options={options} />
    </GrowthProvider>,
  );
}

describe('the template preview cards', () => {
  it('frames the reader page the host gives, at a desktop width, with no scripts (growth templates D3)', () => {
    const { container } = render(
      <TemplateCards
        templates={[{ key: 'full-guide', name: 'Classic', parts: 9 }]}
        previews={{ 'full-guide': { nodes: [], tree: null, frame: '/blog/template-preview/abc' } }}
        value="full-guide"
        onChange={vi.fn()}
        renderPreview={() => <p>drawn</p>}
      />,
    );

    expect(screen.getByText('Drawing the preview…')).toBeTruthy();
    expect(screen.queryByText('drawn')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('draws the reader page as a still picture: no scripts, its addresses kept', () => {
    const page = '<html><head><link rel="stylesheet" href="/_next/a.css"><script src="/_next/x.js"></script><link rel="modulepreload" as="script" href="/_next/y.js"></head><body><h1>A clear question</h1><script>self.__next=1</script><noscript><iframe src="/tag"></iframe></noscript></body></html>';
    const still = stillPage(page, 'http://localhost/blog/template-preview/abc');

    expect(still).toContain('<h1>A clear question</h1>');
    expect(still).toContain('<base href="http://localhost/blog/template-preview/abc">');
    expect(still).toContain('href="/_next/a.css"');
    expect(still).not.toMatch(/<script|<noscript|modulepreload/i);
  });

  it('asks the host for the reader page of each template and prefers it over the drawn starter', async () => {
    const request = vi.fn(async (_method: string, path: string) => {
      if (path === 'layouts?kind=post') return { data: { layouts } };
      if (path === 'layouts/full-guide?starter=1') return { data: { starter: { nodes: [], tree } } };

      throw new Error('no');
    });
    const framePreview = vi.fn(async (key: string) => (key === 'full-guide' ? `/blog/template-preview/${key}` : null));
    function Framed() {
      const flow = useCreatePostFlow({ defaultTemplate: 'full-guide', framePreview });

      return <>{createPostSteps(flow, { renderPreview: () => <p>drawn</p> })[0]?.render()}</>;
    }
    const { container } = render(
      <GrowthProvider product="portify" request={request as never} hrefFor={(() => '#') as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
        <Framed />
      </GrowthProvider>,
    );

    await waitFor(() => expect(framePreview).toHaveBeenCalledWith('full-guide'));
    await waitFor(() => expect(screen.queryByText('drawn')).toBeNull());
    expect(framePreview).toHaveBeenCalledWith('news');
  });

  it('asks the service for each template as a new post would start, and the host draws it on the card', async () => {
    const request = vi.fn(async (_method: string, path: string) => {
      if (path === 'layouts?kind=post') return { data: { layouts } };
      if (path === 'layouts/full-guide?starter=1') return { data: { starter: { nodes: [{ primitive: 'heading' }], tree } } };

      throw new Error('That template could not be drawn.');
    });
    mount(request, { renderPreview: (t) => <p>drawn: {(t[0] as { props: { text: string } }).props.text}</p> });

    expect(await screen.findByText('drawn: The question your post answers')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Classic' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Classic' }).getAttribute('aria-describedby')).toBeTruthy();
    expect(request.mock.calls.map((c) => c.slice(0, 2))).toContainEqual(['GET', 'layouts/news?starter=1']);
    // A template that cannot be drawn keeps its card, with its shape instead of a picture.
    await waitFor(() => expect(document.querySelectorAll('.gr-shape').length).toBe(1));
  });

  it('is one radio group: the picked card is the tab stop, arrows move the choice, a click picks', () => {
    function Harness() {
      const [value, setValue] = useState<string | null>('full-guide');

      return <TemplateCards templates={layouts} previews={{}} value={value} onChange={setValue} />;
    }
    render(<Harness />);
    const classic = screen.getByRole('radio', { name: 'Classic' });
    const news = screen.getByRole('radio', { name: 'News' });

    expect(classic.tabIndex).toBe(0);
    expect(news.tabIndex).toBe(-1);
    fireEvent.keyDown(classic, { key: 'ArrowRight' });
    expect(news.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(news);
    fireEvent.click(classic);
    expect(classic.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByText('Drawing the preview…')).toHaveLength(2);
  });
});
