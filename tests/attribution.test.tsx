import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttributionView, GrowthProvider, paidWords, type AttributionData } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const data = (over: Partial<AttributionData> = {}): AttributionData => ({
  period: 'quarter', from: '2026-10-01', known: true, unknown_because: null, credited: 1, without_reading: 0,
  first_touch: [{ kind: 'post', ref: 'ee-draws', title: 'Express Entry draws explained', people: 1, cases: 1, paid: { CAD: 1250 } }],
  last_touch: [{ kind: 'campaign', ref: 'c-1', title: 'November news', people: 1, cases: 1, paid: { CAD: 1250 } }],
  ...over,
});

function mount(answer: AttributionData) {
  const request = vi.fn(async () => ({ data: answer }));
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <AttributionView period="quarter" bookedMeans="opened a case" />
    </GrowthProvider>,
  );

  return request;
}

describe('what led to paid work (G6c4)', () => {
  it('shows first touch, then last touch, with totals per item', async () => {
    const request = mount(data());

    expect(await screen.findByText('Express Entry draws explained')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('GET', 'results/attribution?period=quarter', undefined);
    expect(screen.getByText('CAD 1,250')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Last touch' }));
    });
    expect(screen.getByText('November news')).toBeTruthy();
    expect(screen.getByText('(Newsletter)')).toBeTruthy();
  });

  it('says why when paid work cannot be read, and what it saw when nothing was read first', async () => {
    mount(data({ known: false, unknown_because: 'This product does not say what its people went on to buy.', first_touch: [], last_touch: [] }));
    expect(await screen.findByText(/This product does not say what its people went on to buy/)).toBeTruthy();
  });

  it('never adds two currencies together', () => {
    expect(paidWords({ CAD: 1250, USD: 80 })).toBe('CAD 1,250, USD 80');
    expect(paidWords({})).toBe('-');
  });
});
