import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnouncementsView, GrowthProvider, announcementTiming, type Announcement } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, readOnly = false) {
  const view = <AnnouncementsView newAnnouncement={<button type="button">New announcement</button>} />;

  return render(
    readOnly ? (
      // The estate portal across every product reads; only one product's own scope edits.
      <GrowthProvider estate={{ products: [{ key: 'portify', label: 'Portify' }] }} request={request as never} hrefFor={hrefFor as never} onError={vi.fn()}>
        {view}
      </GrowthProvider>
    ) : (
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
        {view}
      </GrowthProvider>
    ),
  );
}

const base: Announcement = { uuid: 'a-1', subject: 'Book a call from your case page', state: 'live', presentation: { surfaces: ['banner'] }, scheduled_at: null, published_at: '2026-11-14T16:45:00Z', expires_at: null, ended_at: null, recipients_total: 207 };

describe('announcements', () => {
  it('lists each with its state and whom it reached, and offers the next step only where it applies', async () => {
    const request = vi.fn(async () => ({ data: { announcements: [base, { ...base, uuid: 'a-2', subject: 'Holiday hours', state: 'draft', recipients_total: 0, published_at: null }] } }));
    mount(request);

    expect(await screen.findByText('Showing now')).toBeTruthy();
    expect(screen.getByText('Shown to 207 people')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText('Not published yet')).toBeTruthy();
    expect(screen.getByText('New announcement')).toBeTruthy();
  });

  it('ending one early asks first, then ends it on the service', async () => {
    const request = vi.fn(async (method: string, path: string) => (method === 'GET' ? { data: { announcements: [base] } } : { data: {} }));
    mount(request);

    fireEvent.click(await screen.findByRole('button', { name: `Actions for ${base.subject}` }));
    fireEvent.click(await screen.findByText('End early'));
    expect(screen.getByText(`End "${base.subject}" now?`)).toBeTruthy();
    expect(request.mock.calls.some((c) => c[0] === 'POST')).toBe(false); // nothing happens before the confirm

    const buttons = screen.getAllByRole('button', { name: 'End early' });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(request.mock.calls.some((c) => c[0] === 'POST' && c[1] === 'announcements/a-1/end')).toBe(true));
  });

  it('someone who cannot edit sees the list without the actions that change it', async () => {
    const request = vi.fn(async () => ({ data: { announcements: [{ ...base, state: 'draft' }] } }));
    mount(request, true);

    fireEvent.click(await screen.findByRole('button', { name: `Actions for ${base.subject}` }));
    expect(await screen.findByText('Copy reference')).toBeTruthy();
    expect(screen.queryByText('Publish now')).toBeNull();
    expect(screen.queryByText('New announcement')).toBeNull();
  });

  it('says the timing in words for every state', () => {
    expect(announcementTiming({ ...base, recipients_total: 1 })).toBe('Shown to 1 person');
    expect(announcementTiming({ ...base, state: 'scheduled', scheduled_at: '2026-11-20T15:00:00Z' })).toMatch(/^Publishes Nov 20, 2026/);
    expect(announcementTiming({ ...base, state: 'ended', ended_at: '2026-11-14T16:47:04Z' })).toMatch(/^Shown to 207 people\. Ended Nov 14, 2026/);
  });
});
