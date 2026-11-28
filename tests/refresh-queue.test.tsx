import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, RefreshQueueView, type RefreshQueueItem } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(items: RefreshQueueItem[]) {
  const request = vi.fn(async () => ({ data: { items } }));
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <RefreshQueueView postHref={(uuid) => `/admin/growth/blog/${uuid}`} />
    </GrowthProvider>,
  );

  return request;
}

describe('Plan > Needs a refresh (G7f)', () => {
  it('lists each post with its reasons and links to the post', async () => {
    const request = mount([{ uuid: 'u1', title: 'Proof of funds', slug: 'pof', score: 20, reasons: ['2 links are dead'], facts: null,
      dead: [{ url: 'https://ircc.test/gone' }], moved: [], views: { recent: 0, before: 0 } }]);

    const link = await screen.findByRole('link', { name: 'Proof of funds' });
    expect(link.getAttribute('href')).toBe('/admin/growth/blog/u1');
    expect(screen.getByText('2 links are dead')).toBeTruthy();
    expect(screen.getByText('https://ircc.test/gone')).toBeTruthy();
    expect((request.mock.calls[0] as unknown[]).slice(0, 2)).toEqual(['GET', 'plan/refresh-queue']);
  });

  it('says plainly when nothing needs a refresh', async () => {
    mount([]);
    expect(await screen.findByText(/Nothing needs a refresh/)).toBeTruthy();
  });
});
