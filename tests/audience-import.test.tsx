import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, IMPORT_CHUNK, importSteps, parseCsv, useImportFlow, type ImportFlow } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

describe('the CSV reader', () => {
  it('reads quotes, commas and line breaks inside quotes, CRLF, a byte-order mark and semicolon files', () => {
    const csv = parseCsv('﻿Email,Name,Note\r\nana@example.com,"Okafor, Ana","said ""yes""\nby phone"\r\n\r\nbo@example.com,Bo,\r\n');
    expect(csv.header).toEqual(['Email', 'Name', 'Note']);
    expect(csv.rows).toEqual([['ana@example.com', 'Okafor, Ana', 'said "yes"\nby phone'], ['bo@example.com', 'Bo', '']]);
    expect(parseCsv('Email;Type\nana@example.com;client').rows).toEqual([['ana@example.com', 'client']]);
    expect(() => parseCsv('\n\n')).toThrow('The first row must name the columns');
  });
});

let flow: ImportFlow;
function Harness() {
  flow = useImportFlow();
  const steps = importSteps(flow);
  return <>{steps.map((s) => <section key={s.id} aria-label={s.title}>{s.render()}</section>)}</>;
}

function mount(request: ReturnType<typeof vi.fn>) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
      <Harness />
    </GrowthProvider>,
  );
}

const fileOf = (rows: number) => {
  const lines = ['Email,Type,Date,Interest', ...Array.from({ length: rows }, (_, i) => `p${i}@example.com,client,2025-06-01,study`)];
  return new File([lines.join('\n')], 'clients_2024.csv', { type: 'text/csv' });
};

describe('the import flow', () => {
  it('guesses the columns, checks the list in chunks and sums the answers', async () => {
    const request = vi.fn(async (_m: string, _p: string, body?: { rows: unknown[] }) => ({ data: { counts: { can_ask: body?.rows.length ?? 0, already_subscribed: 0, suppressed: 0, duplicates: 0, invalid_email: 0, no_consent: 1 }, reasons: { 'Consent lapsed': 1 } } }));
    mount(request);
    await act(() => flow.loadFile(fileOf(IMPORT_CHUNK + 2)));
    expect(flow.mapping).toMatchObject({ email: 'Email', type: 'Type', date: 'Date', audience: 'Interest' });
    expect(flow.label).toBe('clients_2024');
    expect(importSteps(flow)[2]?.validate()).toBe('Choose why you may write to them.');

    act(() => flow.setMode('repermission'));
    await act(() => flow.runPreview());
    expect(request).toHaveBeenCalledTimes(2); // two chunks
    expect(flow.preview?.counts.can_ask).toBe(IMPORT_CHUNK + 2);
    expect(flow.preview?.reasons).toEqual({ 'Consent lapsed': 2 });
    expect(screen.getByText(`Start asking ${(IMPORT_CHUNK + 2).toLocaleString()} people`)).toBeTruthy();
  });

  it('opens once, sends numbered chunks, and resumes from the chunk that failed', async () => {
    let failOnce = true;
    const request = vi.fn(async (method: string, path: string, body?: { chunk?: number; rows?: Array<{ audience: string | null }> }) => {
      if (path === 'audience/imports/preview') return { data: { counts: { can_ask: 3, already_subscribed: 0, suppressed: 0, duplicates: 0, invalid_email: 0, no_consent: 0 }, reasons: {} } };
      if (path === 'audience/imports') return { data: { import: { uuid: 'b-1' } } };
      if (path.endsWith('/rows') && body?.chunk === 2 && failOnce) {
        failOnce = false;
        throw new Error('network');
      }
      if (path.endsWith('/start')) return { data: { import: { uuid: 'b-1', imported_count: IMPORT_CHUNK + 1 } } };
      return { data: {} };
    });
    mount(request);
    await act(() => flow.loadFile(fileOf(IMPORT_CHUNK + 1)));
    act(() => flow.setMapping({ audienceMap: { study: 'applicants' } }));
    act(() => flow.setMode('repermission'));
    await act(() => flow.runPreview());

    await act(() => flow.start());
    expect(flow.started).toBeNull();
    await act(() => flow.start());
    await waitFor(() => expect(flow.started).toEqual({ uuid: 'b-1', imported: IMPORT_CHUNK + 1 }));

    const calls = request.mock.calls.map((c) => `${c[0]} ${c[1]}${(c[2] as { chunk?: number })?.chunk ? ` #${(c[2] as { chunk: number }).chunk}` : ''}`);
    expect(calls.filter((c) => c === 'POST audience/imports')).toHaveLength(1); // opened once
    expect(calls.filter((c) => c.includes('/rows'))).toEqual(['POST audience/imports/b-1/rows #1', 'POST audience/imports/b-1/rows #2', 'POST audience/imports/b-1/rows #2']);
    const sentRow = (request.mock.calls.find((c) => String(c[1]).endsWith('/rows'))?.[2] as { rows: Array<{ audience: string | null }> }).rows[0];
    expect(sentRow).toEqual({ email: 'p0@example.com', name: null, type: 'client', date: '2025-06-01', audience: 'applicants' });
    expect(screen.getByText(`${(IMPORT_CHUNK + 1).toLocaleString()} people are waiting to be asked.`)).toBeTruthy();
  });

  it('a refused start says the service reason on the step, not only to the host, and clears on retry', async () => {
    const words = 'This product has not set how long unanswered imported addresses are kept. Set it in Growth settings before importing a list.';
    let refuse = true;
    const onError = vi.fn();
    const request = vi.fn(async (_m: string, path: string) => {
      if (path === 'audience/imports/preview') return { data: { counts: { can_ask: 1, already_subscribed: 0, suppressed: 0, duplicates: 0, invalid_email: 0, no_consent: 0 }, reasons: {} } };
      if (path === 'audience/imports' && refuse) throw Object.assign(new Error('Request failed with status code 422'), { response: { status: 422, data: { message: words, errors: { import: [words] } } } });
      if (path === 'audience/imports') return { data: { import: { uuid: 'b-2' } } };
      if (path.endsWith('/start')) return { data: { import: { uuid: 'b-2', imported_count: 1 } } };
      return { data: {} };
    });
    render(
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={onError} onNotice={vi.fn()} words={{ product: 'Portify' }}>
        <Harness />
      </GrowthProvider>,
    );
    await act(() => flow.loadFile(fileOf(1)));
    act(() => flow.setMode('repermission'));
    await act(() => flow.runPreview());

    await act(() => flow.start());
    expect(screen.getByRole('alert').textContent).toBe(words);
    expect(onError).not.toHaveBeenCalled();

    refuse = false; // the admin set the period in Growth settings
    await act(() => flow.start());
    await waitFor(() => expect(flow.started).toEqual({ uuid: 'b-2', imported: 1 }));
    expect(screen.queryByText(words)).toBeNull();
  });

  it('a failure that is not a refusal still goes to the host', async () => {
    const onError = vi.fn();
    const request = vi.fn(async () => {
      throw Object.assign(new Error('Request failed with status code 500'), { response: { status: 500, data: { message: 'Server error' } } });
    });
    render(
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={onError} onNotice={vi.fn()} words={{ product: 'Portify' }}>
        <Harness />
      </GrowthProvider>,
    );
    await act(() => flow.loadFile(fileOf(1)));
    act(() => flow.setMode('repermission'));
    await act(() => flow.runPreview());
    expect(onError).toHaveBeenCalledTimes(1);
    expect(flow.refusal).toBeNull();
  });

  it('a written-consent list needs the proof, and without a host upload says why it cannot be used', async () => {
    mount(vi.fn());
    await act(() => flow.loadFile(fileOf(1)));
    fireEvent.click(screen.getByRole('radio', { name: 'They said yes in writing' }));
    expect(screen.getByText(/does not take a proof upload yet/)).toBeTruthy();
    expect(importSteps(flow)[2]?.validate()).toBe('Attach the proof of their written yes.');
  });

  it('inside a host shell the last step draws no start button of its own', async () => {
    function Hosted() {
      flow = useImportFlow();
      return <>{importSteps(flow, { hostSubmits: true })[4]?.render()}</>;
    }
    render(
      <GrowthProvider product="portify" request={vi.fn() as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ product: 'Portify' }}>
        <Hosted />
      </GrowthProvider>,
    );
    expect(screen.queryByRole('button', { name: /Start asking/ })).toBeNull();
    expect(screen.getByText(/waiting to be asked/)).toBeTruthy();
  });
});
