import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, WelcomeSeriesView, welcomeProblem, type WelcomeSeries } from '../src';

vi.mock('@shirahcan/ai-ui/editor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <textarea aria-label="Email body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const existing: WelcomeSeries = {
  uuid: 'w-1', name: 'Welcome for applicants', trigger_kind: 'topic', trigger_value: 'ee', is_active: true,
  steps: [{ position: 1, delay_hours: 0, subject: 'Welcome', body_html: '<p>Thanks for confirming.</p>' }, { position: 2, delay_hours: 48, subject: 'Your first guide', body_html: '<p>The guide most start with.</p>' }],
  people: { in_progress: 3, finished: 9, stopped: 1 },
};

function mount(handler: (method: string, path: string, body?: unknown) => unknown) {
  const request = vi.fn(async (method: string, path: string, body?: unknown) => handler(method, path, body));
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <WelcomeSeriesView />
    </GrowthProvider>,
  );

  return request;
}

const service = (series: WelcomeSeries[] = [existing]) => (method: string, path: string): unknown => {
  if (path === 'welcome-series' && method === 'GET') return { data: { series } };
  if (path === 'settings/audience') return { data: { audience: { topics: [{ key: 'ee', label: 'Express Entry' }] } } };
  if (path === 'landing-pages') return { data: { pages: [{ uuid: 'lp-1', name: 'PR guide' }] } };

  return { data: { series: existing } };
};

describe('welcome series (G5g)', () => {
  it('lists each series with who it is for, its emails and its people, and switches it off from the menu', async () => {
    const request = mount(service());

    expect(await screen.findByText(/People who chose Express Entry\. 2 emails\. 3 in it now, 9 finished, 1 stopped/)).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Welcome for applicants' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Switch off', 'Copy reference', 'Delete']);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Switch off' }));
    });
    expect(request).toHaveBeenCalledWith('PUT', 'welcome-series/w-1', expect.objectContaining({ is_active: false, trigger_kind: 'topic', trigger_value: 'ee' }));
  });

  it('writes a new series for a landing page, refusing it until every email has words', async () => {
    const request = mount(service([]));

    fireEvent.click(await screen.findByRole('button', { name: 'New welcome series' }));
    fireEvent.change(screen.getByLabelText('Who gets it'), { target: { value: 'landing' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'PR guide' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Landing page'), { target: { value: 'lp-1' } });
    fireEvent.change(screen.getByLabelText('Email 1: subject'), { target: { value: 'Your PR guide is inside' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save the series' }));
    expect(await screen.findByText('Email 1 needs a subject and a few words.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: '<p>Here is the guide you asked for, and what comes next.</p>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add an email' }));
    fireEvent.change(screen.getByLabelText('Email 2: subject'), { target: { value: 'Three things people miss' } });
    fireEvent.change(screen.getAllByLabelText('Email body')[1]!, { target: { value: '<p>Three things people miss before they apply.</p>' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save the series' }));
    });

    expect(request).toHaveBeenCalledWith('POST', 'welcome-series', expect.objectContaining({
      trigger_kind: 'landing', trigger_value: 'lp-1', is_active: false,
      steps: [expect.objectContaining({ delay_hours: 0, subject: 'Your PR guide is inside' }), expect.objectContaining({ delay_hours: 48, subject: 'Three things people miss' })],
    }));
  });

  it('says what is missing in plain words', () => {
    expect(welcomeProblem('', 'any', '', [])).toBe('Name the series.');
    expect(welcomeProblem('Welcome', 'topic', '', [])).toBe('Pick the topic.');
    expect(welcomeProblem('Welcome', 'any', '', [])).toBe('Add at least one email.');
  });
});
