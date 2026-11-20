import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider } from '../src/GrowthProvider';
import { TemplatesPage } from '../src/templates/TemplatesPage';

/** Growth templates D1 (owner 2026-11-20): admins manage blog and newsletter templates on one page; retire, never erase. */
/** The rejection the host's request throws for a service refusal (axios-shaped 422). */
const refused = (message: string) => Object.assign(new Error(message), { response: { status: 422, data: { message } } });

const asked = (request: ReturnType<typeof vi.fn>, method: string, path: string) => request.mock.calls.some((c) => c[0] === method && c[1] === path);

const rows = [
  { key: 'full-guide', kind: 'post', name: 'Classic', version: 2, status: 'active', parts: 17, source: null },
  { key: 'portify-weekly', kind: 'email', name: 'Portify Weekly', version: 1, status: 'active', parts: 10, source: { kind: 'post', uuid: 'u', title: 'LMIA guide', words: 'keep' } },
];

function mount(request: ReturnType<typeof vi.fn>, onEdit = vi.fn(), framePreview = vi.fn(async () => null), onError = vi.fn()) {
  const notify = vi.fn();
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={(() => '#') as never} onError={onError} onNotice={notify} words={{ audiences: {}, product: 'Portify' }}>
      <TemplatesPage onEdit={onEdit} framePreview={framePreview} />
    </GrowthProvider>,
  );

  return { notify, onEdit, framePreview };
}

describe('the Templates page', () => {
  it('lists both kinds, says what each was made from, and asks each for its reader thumbnail', async () => {
    const request = vi.fn(async (_m: string, path: string) => {
      if (path === 'layouts') return { data: { layouts: rows } };
      if (path === 'layouts/portify-weekly/reader-preview') return { data: { preview: { kind: 'email', html: '<html><body>Sample</body></html>' } } };

      throw new Error('no');
    });
    const { framePreview } = mount(request);

    expect(await screen.findByText('Classic')).toBeTruthy();
    expect(screen.getByText('Made from “LMIA guide”')).toBeTruthy();
    expect(screen.getByText(/Newsletter template, 10 parts, version 1/)).toBeTruthy();
    await waitFor(() => expect(framePreview).toHaveBeenCalledWith('full-guide'));
    await waitFor(() => expect(asked(request, 'GET', 'layouts/portify-weekly/reader-preview')).toBe(true));
  });

  it('filters to retired templates and asks the service for them', async () => {
    const request = vi.fn(async (_m: string, path: string) => (path.startsWith('layouts?') || path === 'layouts' ? { data: { layouts: [] } } : { data: { preview: {} } }));
    mount(request);

    fireEvent.click(await screen.findByRole('radio', { name: 'Retired' }));

    await waitFor(() => expect(asked(request, 'GET', 'layouts?status=retired')).toBe(true));
    expect(await screen.findByText(/No retired templates/)).toBeTruthy();
  });

  it('asks before retiring, and shows the service refusing the last template of a kind in its own words', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET' && path === 'layouts') return { data: { layouts: [rows[0]] } };
      if (method === 'POST' && path === 'layouts/full-guide/retire') throw refused('"Classic" is the only blog template left, so it stays: add another blog template first.');

      return { data: { preview: {} } };
    });
    const onError = vi.fn();
    mount(request, vi.fn(), vi.fn(async () => null), onError);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Classic' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Edit', 'Duplicate', 'Copy key', 'Retire']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retire' }));

    expect(screen.getByRole('dialog', { name: 'Retire "Classic"?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retire' }));
    expect(await screen.findByText('"Classic" is the only blog template left, so it stays: add another blog template first.')).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it('opens a template in the designer from its picture or its menu', async () => {
    const request = vi.fn(async (_m: string, path: string) => (path === 'layouts' ? { data: { layouts: [rows[0]] } } : { data: { preview: {} } }));
    const { onEdit } = mount(request);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Classic' }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ key: 'full-guide' }));
  });
});
