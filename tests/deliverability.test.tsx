import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeliverabilityView, GrowthProvider, type Deliverability } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const result = (over: Partial<Deliverability> = {}): Deliverability => ({
  domain: 'portify.example', overall: 'red', checked_at: new Date().toISOString(),
  checks: [
    { key: 'spf', label: 'SPF', status: 'pass', says: 'portify.example publishes one SPF record.', fix: null },
    { key: 'dmarc', label: 'DMARC', status: 'fail', says: 'portify.example publishes no DMARC record.', fix: 'Add a TXT record at _dmarc.portify.example: v=DMARC1; p=none' },
    { key: 'dkim', label: 'DKIM', status: 'not_configured', says: 'No DKIM key was found.', fix: 'Enter the DKIM selector.' },
  ],
  settings: { complaint_rate_max_percent: 0.3, bounce_rate_max_percent: 2, dkim_selector: null },
  ...over,
});

function mount(handler: (method: string, path: string, body?: unknown) => unknown) {
  const request = vi.fn(async (method: string, path: string, body?: unknown) => handler(method, path, body));
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <DeliverabilityView />
    </GrowthProvider>,
  );

  return request;
}

describe('deliverability (G5i)', () => {
  it('shows each check with its state and the exact record to add, and checks again on request', async () => {
    const request = mount(() => ({ data: result() }));

    expect(await screen.findByText('Fix this')).toBeTruthy();
    expect(screen.getByText(/Add a TXT record at _dmarc\.portify\.example: v=DMARC1; p=none/)).toBeTruthy();
    expect(screen.getByText('Not set up')).toBeTruthy();
    expect(screen.getByText(/Something here can send your email to spam/)).toBeTruthy();
    const again = screen.getByRole('button', { name: 'Check again' }) as HTMLButtonElement;
    await waitFor(() => expect(again.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(again);
    });
    expect(request).toHaveBeenCalledWith('GET', 'deliverability?refresh=1', undefined);
  });

  it('saves the lines and the DKIM selector, then shows the new result', async () => {
    const request = mount((method) => ({ data: method === 'PUT' ? result({ overall: 'green', checks: [], settings: { complaint_rate_max_percent: 0.2, bounce_rate_max_percent: 2, dkim_selector: 'google' } }) : result() }));

    fireEvent.change(await screen.findByLabelText('DKIM selector'), { target: { value: 'google' } });
    fireEvent.change(screen.getByLabelText('Spam complaint line (%)'), { target: { value: '0.2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save and check again' }));
    });

    expect(request).toHaveBeenCalledWith('PUT', 'settings/deliverability', { complaint_rate_max_percent: 0.2, bounce_rate_max_percent: 2, dkim_selector: 'google' });
    expect(await screen.findByText(/Everything mailbox providers check is in place/)).toBeTruthy();
  });
});
