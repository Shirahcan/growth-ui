import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, campaignSteps, useCampaignFlow } from '../src';

// The real editor is ai-ui's (its own tests cover it); here a textarea stands in so the flow can be driven.
vi.mock('@shirahcan/ai-ui/editor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea aria-label="The email body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
type Call = [string, string, unknown?];

/** Drives the steps the way a host's wizard shell does: render the current one, check it, move on. */
function Wizard({ uuid = null }: { uuid?: string | null }) {
  const flow = useCampaignFlow(uuid);
  const steps = campaignSteps(flow);
  const [at, setAt] = useState(0);
  const [why, setWhy] = useState<string | null>(null);

  if (flow.loading) return <p>Loading the draft</p>;

  return (
    <div>
      <h1>{steps[at]!.title}</h1>
      {steps[at]!.render()}
      {why ? <p role="alert">{why}</p> : null}
      <button type="button" onClick={() => { const w = steps[at]!.validate(); setWhy(w); if (w === null) setAt(at + 1); }}>Next</button>
    </div>
  );
}

function mount(handler: (method: string, path: string, body?: unknown) => unknown, uuid: string | null = null) {
  const calls: Call[] = [];
  const request = vi.fn(async (method: string, path: string, body?: unknown) => {
    calls.push([method, path, body]);
    const out = handler(method, path, body);
    if (out instanceof Error) throw out;

    return out;
  });
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <Wizard uuid={uuid} />
    </GrowthProvider>,
  );

  return calls;
}

const CHECKS_OK = [{ key: 'mail_account', label: 'Sent from Portify’s own account', pass: true, blocking: true, detail: 'It goes from news@portify.example.' }];

function service(checks = CHECKS_OK) {
  return (method: string, path: string, _body?: unknown): unknown => {
    if (path === 'settings/audience') return { data: { audience: { topics: [{ key: 'ee', label: 'Express Entry draws' }] } } };
    if (path === 'campaigns/estimate') return { data: { reach: 42 } };
    if (path === 'audience/groups' || path.startsWith('audience/')) return { data: { groups: [], lists: [], reach: 42, left_out: [] } };
    if (method === 'POST' && path === 'campaigns') return { data: { campaign: { uuid: 'c-9' } } };
    if (path === 'campaigns/c-9/checks') return { data: { checks } };
    if (path === 'campaigns/c-9/send') return { data: { campaign: { uuid: 'c-9', status: 'sending', kind: 'alert', subject: 'Draw tonight', sent_count: 0, recipients_total: 42, failed_count: 0, open_count: 0, click_count: 0 } } };

    return { data: {} };
  };
}

async function next() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  });
}

describe('campaignSteps', () => {
  it('writes an alert, saves it as the checks open, and sends that same draft', async () => {
    const calls = mount(service());

    fireEvent.click(await screen.findByRole('radio', { name: 'Alert' }));
    await next();
    expect(await screen.findByText(/Reaches 42 people today/)).toBeTruthy();
    expect(screen.getByText('(only people who asked for every update)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What is it about? (optional)'), { target: { value: 'ee' } });
    await next();

    await next();
    expect(screen.getByRole('alert').textContent).toBe('Write a subject line.');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Draw tonight' } });
    fireEvent.change(screen.getByLabelText('The email body'), { target: { value: '<p>A draw happened tonight: 2,500 invitations at CRS 520.</p>' } });
    await next();

    expect(await screen.findByText('It goes from news@portify.example.')).toBeTruthy();
    const created = calls.find((c) => c[0] === 'POST' && c[1] === 'campaigns');
    expect(created?.[2]).toMatchObject({ kind: 'alert', subject: 'Draw tonight', topic: 'ee', target: { mode: 'all' } });
    await next();
    await next(); // now

    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    expect(await screen.findByText('Sending. The list shows how many it has reached so far.')).toBeTruthy();
    expect(calls.filter((c) => c[0] === 'POST' && c[1] === 'campaigns')).toHaveLength(1); // one draft, never two
    expect(calls.some((c) => c[0] === 'PUT' && c[1] === 'campaigns/c-9')).toBe(true); // the send saved that same draft
    expect(calls.some((c) => c[1] === 'campaigns/c-9/send')).toBe(true);
  });

  it('a red check stops the wizard and says why', async () => {
    mount(service([{ key: 'casl_footer', label: 'A postal address in the footer', pass: false, blocking: true, detail: 'Add Portify’s mailing address in Settings first.' }]));

    await screen.findByRole('radio', { name: 'Alert' });
    await next();
    await next();
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'November news' } });
    fireEvent.change(screen.getByLabelText('The email body'), { target: { value: '<p>What changed this month for families applying together.</p>' } });
    await next();
    await screen.findByText('Add Portify’s mailing address in Settings first.');
    await next();
    expect(screen.getByRole('alert').textContent).toBe('Fix this first: Add Portify’s mailing address in Settings first.');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Is it safe to send');
  });

  it('continues a draft from where it was left, and saving updates it rather than making another', async () => {
    const base = service();
    const calls = mount((method, path, body) => (path === 'campaigns/c-9' && method === 'GET'
      ? { data: { campaign: { uuid: 'c-9', kind: 'regular', subject: 'Left half done', preheader: null, body_html: '<p>Most of the words were already written here.</p>', topic: null, target: { mode: 'all', include: [], exclude: [] } } } }
      : base(method, path, body)), 'c-9');

    await screen.findByRole('radio', { name: 'Newsletter' });
    await next();
    await next();
    await waitFor(() => expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Left half done'));
    await next();
    await screen.findByText('It goes from news@portify.example.');
    expect(calls.some((c) => c[0] === 'POST' && c[1] === 'campaigns')).toBe(false);
    expect(calls.some((c) => c[0] === 'PUT' && c[1] === 'campaigns/c-9')).toBe(true);
  });
});
