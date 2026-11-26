import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, ResultsView, type ResultsData } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const data = (period: ResultsData['period'], over: Partial<ResultsData> = {}): ResultsData => ({
  period, from: '2026-10-27', conversions_known: true,
  new_subscribers: [{ label: 'PR guide', kind: 'Blog post', total: 2 }],
  reader_sources: [{ source: 'search', total: 9 }, { source: 'ai_assistant', total: 1 }],
  reader_to_booking: [{ slug: 'pr-guide', title: 'PR guide', readers: 9, subscribed: 2, booked: 1, rate: 50 }],
  ...over,
});

function mount(props: Parameters<typeof ResultsView>[0], request = vi.fn(), onError = vi.fn()) {
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={onError} onNotice={vi.fn()}>
      <ResultsView {...props} />
    </GrowthProvider>,
  );

  return { request, onError };
}

describe('Growth > Results', () => {
  it('reads the kit row by default and shows the three sections in plain words', async () => {
    const request = vi.fn(async (..._args: unknown[]) => ({ data: data('30d') }));
    mount({}, request);
    expect(await screen.findByText('Search engines')).toBeTruthy();
    expect(screen.getByText('AI assistants')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(request.mock.calls[0]?.slice(0, 2)).toEqual(['GET', 'results?period=30d']);
    expect(screen.getByText(/then became a customer afterwards/)).toBeTruthy();
  });

  it('asks the host for each period when it supplies the data, in its own words', async () => {
    const load = vi.fn(async (p: ResultsData['period']) => data(p));
    const { request } = mount({ load, bookedMeans: 'opened a case' });
    await screen.findByText('PR guide', { selector: 'td' });
    fireEvent.click(screen.getByRole('radio', { name: 'This quarter' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith('quarter'));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText(/then opened a case afterwards/)).toBeTruthy();
  });

  it('a host that owns the period draws no picker and is followed', async () => {
    const load = vi.fn(async (p: ResultsData['period']) => data(p));
    mount({ load, period: 'month' });
    await screen.findByText('Search engines');
    expect(screen.queryByRole('radiogroup', { name: 'Period' })).toBeNull();
    expect(load).toHaveBeenCalledWith('month');
  });

  it('an unknown booking reads Unknown with the reason, never 0', async () => {
    mount({ load: async (p) => data(p, { conversions_known: false, reader_to_booking: [{ slug: 'pr-guide', title: 'PR guide', readers: 9, subscribed: 2, booked: null, rate: null }] }) });
    expect(await screen.findByText('Unknown')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Bookings could not be read just now');
  });

  it('a failed read hands the error to the host and offers a retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(data('30d'));
    const { onError } = mount({ load });
    expect(await screen.findByText('The results could not be loaded.')).toBeTruthy();
    expect(onError).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByText('Search engines')).toBeTruthy();
  });
});
