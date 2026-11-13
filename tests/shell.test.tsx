import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, ProductPicker, useGrowth, useGrowthChrome, useGrowthChromeState, type GrowthChrome } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

/** A host's bridge: reads the chrome and "draws" it, as Portify's layout passes it to its top bar. */
function HostBar() {
  const chrome = useGrowthChromeState();

  return (
    <div data-testid="bar">
      {chrome.title}|{chrome.subtitle ?? ''}|{chrome.activeTab ?? ''}|{chrome.actions.map((a) => a.label).join(',')}
    </div>
  );
}

function Screen({ title }: { title: string }) {
  const chrome = useMemo<GrowthChrome>(() => ({ title, subtitle: 'Guides that answer real questions', activeTab: 'blog', actions: [{ key: 'new', label: 'New post', onSelect: () => {} }] }), [title]);
  useGrowthChrome(chrome);

  return <p>body</p>;
}

function Probe({ onReady }: { onReady: (g: ReturnType<typeof useGrowth>) => void }) {
  onReady(useGrowth());

  return null;
}

describe('chrome hand-off', () => {
  it('a screen hands its title, tab and actions to the host bar, and takes them back on unmount', () => {
    const { rerender } = render(
      <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} onError={vi.fn()}>
        <HostBar />
        <Screen title="Blog" />
      </GrowthProvider>,
    );
    expect(screen.getByTestId('bar').textContent).toBe('Blog|Guides that answer real questions|blog|New post');

    rerender(
      <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} onError={vi.fn()}>
        <HostBar />
      </GrowthProvider>,
    );
    expect(screen.getByTestId('bar').textContent).toBe('|||');
  });

  it('the screen body never renders the title itself', () => {
    render(
      <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} onError={vi.fn()}>
        <Screen title="Blog" />
      </GrowthProvider>,
    );
    expect(screen.queryByText('Blog')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('product context', () => {
  it('a product host calls its proxy with no as_product and may edit', async () => {
    const request = vi.fn().mockResolvedValue({});
    let g!: ReturnType<typeof useGrowth>;
    render(
      <GrowthProvider product="portify" request={request} hrefFor={hrefFor} onError={vi.fn()}>
        <Probe onReady={(x) => (g = x)} />
      </GrowthProvider>,
    );

    await g.request('GET', 'whoami');
    expect(request).toHaveBeenCalledWith('GET', 'whoami', undefined);
    expect(g.canEdit).toBe(true);
    expect(g.picker).toBeNull();
  });

  it('hides tabs the host has not mounted, keeping the canonical order', () => {
    let g!: ReturnType<typeof useGrowth>;
    render(
      <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} enabledTabs={['results', 'overview']} onError={vi.fn()}>
        <Probe onReady={(x) => (g = x)} />
      </GrowthProvider>,
    );
    expect(g.tabs.map((t) => t.key)).toEqual(['overview', 'results']);
  });

  it('refuses to guess between a product host and the estate host', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<GrowthProvider request={vi.fn()} hrefFor={hrefFor} onError={vi.fn()}><p /></GrowthProvider>)).toThrow(/exactly one/);
  });
});

describe('estate picker', () => {
  const products = [
    { key: 'portify', label: 'Portify' },
    { key: 'mploynow', label: 'MployNow' },
  ];

  it('reads across products read-only, then edits one product with as_product', async () => {
    const request = vi.fn().mockResolvedValue({});
    let g!: ReturnType<typeof useGrowth>;
    render(
      <GrowthProvider estate={{ products }} request={request} hrefFor={hrefFor} onError={vi.fn()}>
        <ProductPicker />
        <Probe onReady={(x) => (g = x)} />
      </GrowthProvider>,
    );

    expect(g.scope).toEqual({ kind: 'across' });
    expect(g.canEdit).toBe(false);
    await g.request('GET', 'posts');
    expect(request).toHaveBeenLastCalledWith('GET', 'posts', undefined);

    act(() => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mploynow' } });
    });
    expect(g.canEdit).toBe(true);
    await g.request('GET', 'posts?status=draft');
    expect(request).toHaveBeenLastCalledWith('GET', 'posts?status=draft&as_product=mploynow', undefined);
  });

  it('a product host shows no picker', () => {
    const { container } = render(
      <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} onError={vi.fn()}>
        <ProductPicker />
      </GrowthProvider>,
    );
    expect(container.querySelector('select')).toBeNull();
  });
});
