import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceSettingsView, GrowthProvider, LapsingCard, PeopleView, receiptFileName, receiptText } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, node: React.ReactNode, onNotice = vi.fn()) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={onNotice} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
      {node}
    </GrowthProvider>,
  );
}

const ana = { uuid: 'u-1', email: 'ana@example.com', email_hash: 'h', audience: 'applicants', status: 'subscribed', topics: [], frequency: null, paused_until: null, since: '2026-10-01T09:00:00Z', consent_basis: 'express_double_opt_in', source_ref: null };
const sheet = {
  ...ana,
  consent: { basis: 'express_double_opt_in', basis_words: 'Said yes and confirmed by email', current: true, expires_at: null, where: 'footer', ip_recorded: true },
  blocked: null,
  trail: [
    { at: '2026-10-01T09:05:00Z', what: 'Confirmed by email (double_opt_in)', basis: 'express_double_opt_in', import_batch_ref: null },
    { at: '2026-10-01T09:00:00Z', what: 'Signed up (footer)', basis: null, import_batch_ref: null },
  ],
};

describe('the audience people', () => {
  it('lists people, opens the consent trail, and stopping someone asks first', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET' && path.startsWith('audience/subscribers?')) return { data: { people: [ana], meta: { current_page: 1, last_page: 1, total: 1 } } };
      if (method === 'GET') return { data: { person: sheet } };
      return { data: { person: { ...ana, status: 'unsubscribed' } } };
    });
    mount(request, <PeopleView />);

    fireEvent.click(await screen.findByLabelText('Actions for ana@example.com'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Open', 'Copy address', 'Stop emailing']);
    fireEvent.click(screen.getByText('Stop emailing'));
    expect(await screen.findByText('Stop emailing this person?')).toBeTruthy();
    expect(request).not.toHaveBeenCalledWith('POST', expect.anything(), expect.anything());
    fireEvent.click(screen.getByText('Keep them'));

    fireEvent.click(screen.getByText('ana@example.com'));
    expect(await screen.findByText('Said yes and confirmed by email')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Consent history, newest first' }).textContent).toContain('Signed up (footer)');
  });

  it('the consent receipt names the product, the basis, where, and every dated moment', () => {
    const text = receiptText(sheet as never, 'Portify');
    expect(text).toContain('Consent record for ana@example.com (Portify)');
    expect(text).toContain('Basis: Said yes and confirmed by email');
    expect(text).toContain('First recorded at: footer (IP address kept as evidence)');
    expect(text.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2);
  });

  it('the receipt read lists what each record kept as proof, and the file is named for whom and when', () => {
    const withEvidence = {
      ...sheet,
      trail: [
        { ...sheet.trail[0], evidence: { ip: null, user_agent: null, wording_version: null } },
        { ...sheet.trail[1], evidence: { ip: '203.0.113.9', user_agent: 'Firefox', wording_version: 'footer-v2' } },
      ],
    };
    const lines = receiptText(withEvidence as never, 'Portify').split('\n');
    const signedUp = lines.findIndex((l) => l.endsWith('Signed up (footer)'));
    expect(lines.slice(signedUp + 1, signedUp + 4)).toEqual(['    IP address: 203.0.113.9', '    Browser: Firefox', '    Wording shown: footer-v2']);
    expect(lines.filter((l) => l.startsWith('    '))).toHaveLength(3); // a record that kept nothing adds no lines
    expect(receiptFileName('Ana O+K@example.com', new Date(2026, 10, 14, 0, 30) /* half past midnight, local */)).toBe('consent-receipt-Ana_O_K@example.com-2026-11-14.txt');
  });

  it('the sheet menu downloads the receipt from the evidence read', async () => {
    const created: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:receipt'));
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const notice = vi.fn();
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET' && path.startsWith('audience/subscribers?')) return { data: { people: [ana], meta: { current_page: 1, last_page: 1, total: 1 } } };
      if (path.endsWith('?with=evidence')) return { data: { person: { ...sheet, trail: [{ ...sheet.trail[1], evidence: { ip: '203.0.113.9', user_agent: null, wording_version: null } }] } } };
      return { data: { person: sheet } };
    });
    render(
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={notice} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
        <PeopleView />
      </GrowthProvider>,
    );
    fireEvent.click(await screen.findByText('ana@example.com'));
    await screen.findByText('Said yes and confirmed by email');
    fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Actions for ana@example.com')); // the sheet's menu, not the row's
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy address', 'Copy consent receipt', 'Download consent receipt', 'Stop emailing']);
    fireEvent.click(screen.getByText('Download consent receipt'));

    await waitFor(() => expect(notice).toHaveBeenCalledWith('Consent receipt downloaded.'));
    expect(request.mock.calls.map((c) => c[1])).toContainEqual(expect.stringMatching(/\?with=evidence$/));
    const body = await new Promise<string>((resolve) => {
      const reader = new FileReader(); // jsdom's Blob has no text()
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0] as Blob);
    });
    expect(body).toContain('IP address: 203.0.113.9');
  });

  it('an imported person came from a named list; they never signed up', () => {
    const imported = { ...sheet, consent: { ...sheet.consent, where: 'import', ip_recorded: false, import_list: 'clients_2024' } };
    expect(receiptText(imported as never, 'Portify')).toContain('Came from the imported list: clients_2024');
    expect(receiptText(imported as never, 'Portify')).not.toContain('First recorded at');
  });

  it('the filters reach the service as query parameters', async () => {
    const request = vi.fn(async (_method: string, _path: string) => ({ data: { people: [], meta: { current_page: 1, last_page: 1, total: 0 } } }));
    mount(request, <PeopleView />);
    await screen.findByText(/Nobody is on Portify/);
    fireEvent.click(screen.getByRole('radio', { name: 'Waiting to confirm' }));
    await waitFor(() => expect(request.mock.calls.some((c: unknown[]) => String(c[1]).includes('status=pending'))).toBe(true));
  });
});

describe('the lapse warning and the audience settings', () => {
  it('warns with dates when consent runs out, and says nothing when nobody is affected', async () => {
    const request = vi.fn(async () => ({ data: { lapsing: { window_days: 30, total: 3, subscribed: 2, pending: 1, by_date: [{ date: '2026-11-20', subscribed: 1, pending: 1 }, { date: '2026-12-01', subscribed: 1, pending: 0 }] } } }));
    mount(request, <LapsingCard />);
    expect(await screen.findByText("3 people's consent runs out in the next 30 days")).toBeTruthy();

    const none = vi.fn(async () => ({ data: { lapsing: { window_days: 30, total: 0, subscribed: 0, pending: 0, by_date: [] } } }));
    const { container } = mount(none, <LapsingCard />);
    await waitFor(() => expect(none).toHaveBeenCalled());
    expect(container.textContent).not.toContain('consent runs out');
  });

  it('names what is not set yet and saves topics as keys', async () => {
    const request = vi.fn(async (method: string) => method === 'GET'
      ? { data: { audience: { double_opt_in: null, topics: null, regular_gap_days: 14, import_purge_days: null, lapse_warning_days: 30 } } }
      : { data: { audience: { double_opt_in: true, topics: [{ key: 'express_entry_draws', label: 'Express Entry draws' }], regular_gap_days: 14, import_purge_days: null, lapse_warning_days: 30 } } });
    mount(request, <AudienceSettingsView />);
    expect(await screen.findByText(/Not set yet: whether sign-ups confirm by email; the newsletter topics; how long unanswered imported people are kept/)).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Yes, confirm by email' }));
    fireEvent.change(screen.getByLabelText('Newsletter topics'), { target: { value: 'Express Entry draws' } });
    fireEvent.click(screen.getByText('Save audience settings'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('PUT', 'settings/audience', expect.objectContaining({ double_opt_in: true, topics: [{ label: 'Express Entry draws', key: 'express_entry_draws' }] })));
  });
});
