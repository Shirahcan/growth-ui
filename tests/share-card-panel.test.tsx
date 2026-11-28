import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, ShareCardPanel, type ShareCardState } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(card: ShareCardState) {
  const request = vi.fn(async (method: string) => ({ data: { card }, message: method === 'POST' ? 'Drawing the card. It is ready in about a minute.' : 'Card.' }));
  const onNotice = vi.fn();
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={onNotice} words={{ audiences: {}, product: 'Portify' }}>
      <ShareCardPanel kind="post" uuid="11111111-1111-4111-8111-111111111111" />
    </GrowthProvider>,
  );

  return { request, onNotice };
}

describe('share card panel (G7e4)', () => {
  it('shows the drawn card and queues a redraw on the button', async () => {
    const { request, onNotice } = mount({ enabled: true, status: 'rendered', url: 'https://portify.test/media/card.png', alt: 'Proof of funds', reason: null });

    expect((await screen.findByRole('img', { name: 'Proof of funds' })).getAttribute('src')).toBe('https://portify.test/media/card.png');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Draw it again' }));
    });
    expect(request).toHaveBeenCalledWith('POST', 'cards/post/11111111-1111-4111-8111-111111111111/redraw', {});
    expect(onNotice).toHaveBeenCalledWith('Drawing the card. It is ready in about a minute.');
    expect(screen.getByText(/being drawn/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Draw it again' })).toBeNull();
  });

  it('says why a card is missing, and offers no button while unpublished or switched off', async () => {
    mount({ enabled: true, status: 'unpublished', url: null, alt: null, reason: 'The card is drawn when this is published.' });
    expect(await screen.findByText('The card is drawn when this is published.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
