import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, PlanCalendar, PlanIdeasView, PlanRadarView, areaHref, type PlanIdea } from '../src';

const hrefFor = (tab: string) => (tab === 'overview' ? '/admin/growth' : `/admin/growth/${tab}`);

const idea = (over: Partial<PlanIdea>): PlanIdea => ({
  uuid: 'u1', title: 'Study permit times from India', audience: 'applicants', formats: ['blog'], why: '4 people asked and got no answer.',
  status: 'idea', skip_reason: null, planned_for: null, post_uuid: null, ...over,
});

function mount(ui: React.ReactNode, request: ReturnType<typeof vi.fn>, extra: { onNotice?: (m: string) => void } = {}) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={extra.onNotice} words={{ assistant: 'Porter', audiences: { applicants: 'Moving to Canada' } }}>
      {ui}
    </GrowthProvider>,
  );
}

describe('the Plan views', () => {
  it('ideas show where they came from, the service notices, and Accept posts and notifies', async () => {
    const onNotice = vi.fn();
    const request = vi.fn(async (method: string, path: string) =>
      method === 'GET' && path.startsWith('plan/ideas')
        ? { success: true, data: { month: '2026-11', plan_due: '2026-11-15', accepted: 0, ideas: [idea({})], notices: ['Ideas from your own results are missing this time.'] } }
        : { success: true, data: {} },
    );
    mount(<PlanIdeasView month="2026-11" onMonth={vi.fn()} />, request, { onNotice });

    expect(await screen.findByText('Study permit times from India')).toBeTruthy();
    expect(screen.getByText('4 people asked and got no answer.')).toBeTruthy();
    expect(screen.getByText('Moving to Canada')).toBeTruthy();
    expect(screen.getByText('Ideas from your own results are missing this time.')).toBeTruthy();

    fireEvent.click(screen.getByText('Accept'));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('Added to the plan.'));
    expect(request).toHaveBeenCalledWith('POST', 'plan/ideas/u1/accept', {});
  });

  it('skipping asks for the reason and sends it', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'GET' ? { data: { month: '2026-11', plan_due: '2026-11-15', accepted: 0, ideas: [idea({})] } } : { data: {} },
    );
    mount(<PlanIdeasView month="2026-11" onMonth={vi.fn()} />, request);
    fireEvent.click(await screen.findByLabelText('Actions for Study permit times from India'));
    fireEvent.click(screen.getByText('Skip'));
    fireEvent.click(screen.getByText('Wrong timing'));
    fireEvent.click(screen.getByText('Skip this idea'));

    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'plan/ideas/u1/skip', { reason: 'wrong_timing', note: null }));
  });

  it('a host action that is not given is not shown, never a dead button', async () => {
    const accepted = { data: { month: '2026-11', plan_due: '2026-11-15', accepted: 1, ideas: [idea({ status: 'accepted', planned_for: '2026-11-20' })] } };
    const { unmount } = mount(<PlanIdeasView month="2026-11" onMonth={vi.fn()} />, vi.fn(async () => accepted));
    await screen.findByText('Study permit times from India');
    expect(screen.queryByText('Start the post')).toBeNull();
    unmount();

    const onStartDraft = vi.fn(async () => 'Draft post started.');
    mount(<PlanIdeasView month="2026-11" onMonth={vi.fn()} onStartDraft={onStartDraft} />, vi.fn(async () => accepted));
    fireEvent.click(await screen.findByText('Start the post'));
    await waitFor(() => expect(onStartDraft).toHaveBeenCalled());
  });

  it('the radar says when it is off, and hides the host-only parts it was not given', async () => {
    const request = vi.fn(async () => ({ data: { enabled: false, signals: [{ id: 7, title: 'Express Entry draw: CEC', detail: 'Nov 12: CRS 518.', audience: 'applicants', status: 'new', source_name: 'Rounds', source_url: 'https://www.canada.ca/r', observed_at: null, post_by: new Date(Date.now() + 3600e3).toISOString(), post_uuid: null, campaign_uuid: null }] } }));
    mount(<PlanRadarView />, request);

    expect(await screen.findByText('Express Entry draw: CEC')).toBeTruthy();
    expect(screen.getByText(/switched off/)).toBeTruthy();
    expect(screen.queryByText('Draft post and newsletter item')).toBeNull();
    expect(screen.queryByText('Posts quoting changed facts')).toBeNull();
  });

  it('the calendar turns the service links into the host routes and merges the host items', async () => {
    const request = vi.fn(async () => ({ data: { items: [{ kind: 'signal', date: '2026-11-12', at: null, title: 'Draw', href: 'plan?tab=radar' }] } }));
    mount(<PlanCalendar month="2026-11" onMonth={vi.fn()} loadMoreItems={async () => [{ kind: 'post', date: '2026-11-20', at: null, title: 'A post', href: '/admin/growth/blog/p1' }]} />, request);

    const draw = await screen.findByText('Draw');
    expect(draw.closest('a')?.getAttribute('href')).toBe('/admin/growth/plan?tab=radar');
    expect(screen.getByText('A post').closest('a')?.getAttribute('href')).toBe('/admin/growth/blog/p1');
  });

  it('areaHref maps the first segment to the host tab and keeps the rest', () => {
    expect(areaHref(hrefFor as never, 'blog/abc')).toBe('/admin/growth/blog/abc');
    expect(areaHref(hrefFor as never, '/plan?tab=radar')).toBe('/admin/growth/plan?tab=radar');
  });
});
