import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, TargetPicker, announcementBodyHtml, announcementSteps, useAnnouncementFlow, type AnnouncementFlow, type AnnouncementStep } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
const OPTIONS = {
  surfaces: [{ value: 'banner', label: 'A banner at the top' }, { value: 'toast', label: 'A short pop-up' }],
  themes: [{ value: 'info', label: 'Information' }, { value: 'warning', label: 'Warning' }],
};

function harness(request: ReturnType<typeof vi.fn>, id: AnnouncementStep['id']) {
  const box: { flow: AnnouncementFlow | null } = { flow: null };
  function Step() {
    const flow = useAnnouncementFlow();
    box.flow = flow;
    const step = announcementSteps(flow, OPTIONS).find((s) => s.id === id)!;

    return <>{step.render()}</>;
  }
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
      <Step />
    </GrowthProvider>,
  );
  const step = () => announcementSteps(box.flow!, OPTIONS).find((s) => s.id === id)!;

  return { box, step };
}

const quiet = () => vi.fn(async () => ({ data: { groups: [], reach: 207 } }));

describe('announcement steps', () => {
  it('each step stops on what is missing, in plain words', () => {
    const who = harness(quiet(), 'who');
    act(() => who.box.flow!.set({ target: { mode: 'specific', include: [], exclude: [] } }));
    expect(who.step().validate()).toBe('Pick at least one group or person, or choose everyone.');

    const where = harness(quiet(), 'where');
    expect(where.step().validate()).toBe('Choose at least one place it shows.');
    act(() => where.box.flow!.set({ inbox: true, ctaLabel: 'Book a call' }));
    expect(where.step().validate()).toBe('A button needs both its words and its link.');
    act(() => where.box.flow!.set({ ctaUrl: 'http://portify.example/book' }));
    expect(where.step().validate()).toBe('The button link must start with https://.');
    act(() => where.box.flow!.set({ ctaUrl: 'https://portify.example/book' }));
    expect(where.step().validate()).toBeNull();

    const when = harness(quiet(), 'when');
    act(() => when.box.flow!.set({ when: 'later', at: '2020-01-01T09:00' }));
    expect(when.step().validate()).toBe('Choose a time in the future, or publish it now.');
    act(() => when.box.flow!.set({ when: 'now', ends: '2020-01-01T09:00' }));
    expect(when.step().validate()).toBe('The end must come after it starts.');
  });

  it('publishing saves it once; a refused publish is said on the review and the retry reuses the same draft', async () => {
    let refuse = true;
    const request = vi.fn(async (method: string, path: string, _body?: unknown) => {
      if (method === 'POST' && path === 'announcements') return { data: { announcement: { uuid: 'a-9' } } };
      if (path === 'announcements/a-9/publish' && refuse) {
        throw Object.assign(new Error('422'), { response: { status: 422, data: { errors: { announcement: ['This product has not registered where it receives announcements.'] } } } });
      }
      return { data: { announcement: { uuid: 'a-9', subject: 'Hi', state: 'live', presentation: null, scheduled_at: null, published_at: null, expires_at: null, ended_at: null, recipients_total: 207 } } };
    });
    const review = harness(request, 'review');
    act(() => review.box.flow!.set({ subject: 'Book a call', body: 'From your case page.', surfaces: ['banner'] }));

    fireEvent.click(await screen.findByRole('button', { name: 'Publish now' }));
    expect(await screen.findByText('This product has not registered where it receives announcements.')).toBeTruthy();

    refuse = false;
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    await waitFor(() => expect(screen.getByText(/Done\. Shown to 207 people/)).toBeTruthy());
    expect(request.mock.calls.filter((c) => c[0] === 'POST' && c[1] === 'announcements')).toHaveLength(1);
    expect(request.mock.calls.some((c) => c[0] === 'PUT' && c[1] === 'announcements/a-9')).toBe(true);
    const created = request.mock.calls.find((c) => c[1] === 'announcements')![2] as unknown as { body_html: string; presentation: { channels: { email: boolean } } };
    expect(created.body_html).toBe('<p>From your case page.</p>');
    expect(created.presentation.channels.email).toBe(false); // email is the shared sender's, not offered here
  });

  it('an admin\'s words are paragraphs and never markup', () => {
    expect(announcementBodyHtml('Hello <b>there</b>\nline two\n\nSecond & last')).toBe('<p>Hello &lt;b&gt;there&lt;/b&gt;<br>line two</p><p>Second &amp; last</p>');
  });
});

describe('the picker for an announcement', () => {
  it('offers the product\'s people only and has the product count the reach', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (path === 'audience/platform-groups') return { data: { groups: [{ key: 'paid_clients', label: 'Paid clients', kind: 'client', count: 12 }] } };
      if (path === 'announcements/estimate') return { data: { reach: 207 } };
      return { data: { lists: [{ uuid: 'l-1', name: 'November webinar' }] } };
    });
    render(
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
        <TargetPicker kind="announcement" value={{ mode: 'all', include: [], exclude: [] }} onChange={vi.fn()} />
      </GrowthProvider>,
    );

    expect(await screen.findByText('Reaches 207 people on Portify')).toBeTruthy();
    expect(screen.getByText('Everyone on Portify')).toBeTruthy();
    expect(screen.getByText('Paid clients (12)')).toBeTruthy();
    expect(screen.queryByText('Moving to Canada')).toBeNull(); // what subscribers said is a newsletter's pick
    expect(request.mock.calls.some((c) => c[1] === 'audience/lists')).toBe(false);
    expect(request.mock.calls.some((c) => c[1] === 'audience/estimate')).toBe(false);
  });
});
