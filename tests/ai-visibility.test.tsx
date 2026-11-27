import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiVisibilityPanel, GrowthProvider, type AiVisibilityData } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const data = (over: Partial<AiVisibilityData> = {}): AiVisibilityData => ({
  period: '30d', own_hosts: ['portify.test'], cost: { web_searches: 1 },
  visits: [{ kind: 'post', ref: 'wp-ext', title: 'Work permit extensions', visits: 3 }],
  questions: [{ question: 'How long does a work permit extension take in Canada?', last_check: null }],
  ...over,
});

function mount(first: AiVisibilityData, after?: AiVisibilityData) {
  const request = vi.fn(async (method: string, path: string) => {
    if (method === 'GET') return { data: request.mock.calls.filter((c) => c[0] === 'GET').length > 1 && after ? after : first };
    return { data: {} };
  });
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <AiVisibilityPanel period="30d" />
    </GrowthProvider>,
  );

  return request;
}

describe('AI assistants (G6d)', () => {
  it('opening it only reads; the check runs on the button, which says its cost', async () => {
    const checked = data({ questions: [{ question: 'How long does a work permit extension take in Canada?', last_check: { question: 'q', cited: true, position: 2, sources: [], checked_at: '2026-11-27T12:00:00Z' } }] });
    const request = mount(data(), checked);
    expect(await screen.findByText('Work permit extensions')).toBeTruthy();
    expect(request.mock.calls.every((c) => c[0] === 'GET')).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check now (1 web search)' }));
    });
    expect(request).toHaveBeenCalledWith('POST', 'results/ai-visibility/check', {});
    await waitFor(() => expect(screen.getByText(/Your site is result 2/)).toBeTruthy());
  });

  it('without a site address it says so and cannot check', async () => {
    mount(data({ own_hosts: [] }));
    expect(await screen.findByText(/address is not set/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Check now/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
