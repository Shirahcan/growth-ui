import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, NewsletterView, campaignProgress, type Campaign } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, onEdit = vi.fn(), extra: { onPreview?: ReturnType<typeof vi.fn>; onSaveAsTemplate?: ReturnType<typeof vi.fn> } = {}) {
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <NewsletterView newCampaign={<button type="button">New newsletter</button>} onEdit={onEdit} {...extra} />
    </GrowthProvider>,
  );

  return onEdit;
}

const base: Campaign = {
  uuid: 'c-1', kind: 'regular', subject: 'November news', preheader: null, status: 'sent', held_reason: null, topic: null, scheduled_at: null,
  sent_at: '2026-11-14T15:00:00Z', recipients_total: 120, sent_count: 118, failed_count: 2, open_count: 64, click_count: 9, created_at: '2026-11-13T15:00:00Z',
};

describe('newsletters', () => {
  it('a designed newsletter also offers Preview and Save as a template; a written one does not (2026-11-23)', async () => {
    const request = vi.fn(async () => ({ data: { campaigns: [{ ...base, body_format: 'pml' }, { ...base, uuid: 'c-2', subject: 'Written news', body_format: 'html' }] } }));
    const onPreview = vi.fn();
    const onSaveAsTemplate = vi.fn();
    mount(request, vi.fn(), { onPreview, onSaveAsTemplate });

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for November news' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Send a test', 'Preview', 'Save as a template', 'Copy reference']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Preview' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'c-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Actions for November news' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as a template' }));
    expect(onSaveAsTemplate).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'c-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Written news' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Send a test', 'Copy reference']);
  });

  it('the title opens the newsletter: a draft to edit, a designed sent one to preview (2026-11-26: only the menu reached it)', async () => {
    const request = vi.fn(async () => ({ data: { campaigns: [{ ...base, uuid: 'd-1', subject: 'Draft news', status: 'draft', sent_count: 0 }, { ...base, body_format: 'pml' }, { ...base, uuid: 'c-2', subject: 'Written news', body_format: 'html' }] } }));
    const onPreview = vi.fn();
    const onEdit = mount(request, vi.fn(), { onPreview });

    fireEvent.click(await screen.findByRole('button', { name: 'Continue editing Draft news' }));
    expect(onEdit).toHaveBeenCalledWith('d-1');
    fireEvent.click(screen.getByRole('button', { name: 'Preview November news' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'c-1' }));
    expect(screen.queryByRole('button', { name: 'Preview Written news' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue editing Written news' })).toBeNull();
  });

  it('lists each with what it did, filters by kind, and says why one is held', async () => {
    const request = vi.fn(async () => ({ data: { campaigns: [base, { ...base, uuid: 'c-2', kind: 'alert', subject: 'Draw tonight', status: 'scheduled', held_reason: 'This product has not set a daily sending cap, so nothing goes yet.', sent_count: 0, open_count: 0, click_count: 0, failed_count: 0, scheduled_at: '2026-11-20T15:00:00Z' }] } }));
    mount(request);

    expect(await screen.findByText('Sent to 118 people, 2 could not be delivered. Opened by 64, clicked by 9')).toBeTruthy();
    expect(screen.getByText('Held')).toBeTruthy();
    expect(screen.getByText('Held: This product has not set a daily sending cap, so nothing goes yet.')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Alerts' }));
    expect(screen.queryByText('November news')).toBeNull();
    expect(screen.getByText('Draw tonight')).toBeTruthy();
  });

  it('a draft can be continued or deleted after a confirm; a sent one only copied or tested', async () => {
    const request = vi.fn(async (method: string, _path?: string) => (method === 'GET' ? { data: { campaigns: [{ ...base, status: 'draft', sent_count: 0 }] } } : { data: {} }));
    const onEdit = mount(request);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for November news' }));
    fireEvent.click(await screen.findByText('Continue editing'));
    expect(onEdit).toHaveBeenCalledWith('c-1');

    fireEvent.click(screen.getByRole('button', { name: 'Actions for November news' }));
    fireEvent.click(await screen.findByText('Delete draft'));
    expect(screen.getByText('Delete "November news"?')).toBeTruthy();
    const buttons = screen.getAllByRole('button', { name: 'Delete draft' });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(request.mock.calls.some((c) => c[0] === 'DELETE' && c[1] === 'campaigns/c-1')).toBe(true));
  });

  it('a test goes to the address typed, and a refused address is said on the field', async () => {
    const request = vi.fn(async (method: string, path: string, body?: { email?: string }) => {
      if (method === 'GET') return { data: { campaigns: [base] } };
      if (body?.email === 'nope') throw Object.assign(new Error('422'), { response: { status: 422, data: { errors: { email: ['Enter a real email address.'] } } } });
      return { data: { sent_to: body?.email } };
    });
    mount(request);

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for November news' }));
    expect(screen.queryByText('Delete draft')).toBeNull();
    fireEvent.click(await screen.findByText('Send a test'));
    fireEvent.change(screen.getByLabelText('Send it to'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the test' }));
    expect(await screen.findByText('Enter a real email address.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Send it to'), { target: { value: 'me@portify.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send the test' }));
    await waitFor(() => expect(request.mock.calls.some((c) => c[1] === 'campaigns/c-1/test' && (c[2] as { email: string }).email === 'me@portify.example')).toBe(true));
  });

  it('says what a campaign did in words for each state', () => {
    expect(campaignProgress({ ...base, status: 'draft' })).toBe('Not sent yet');
    expect(campaignProgress({ ...base, status: 'sending', sent_count: 40, failed_count: 0 })).toMatch(/^Sent to 40 people of 120 so far\. Opened by 64/);
    expect(campaignProgress({ ...base, status: 'scheduled', scheduled_at: '2026-11-20T15:00:00Z' })).toMatch(/^Goes out Nov 20, 2026/);
  });
});
