import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, ListsView, SegmentsView, TargetPicker } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, node: React.ReactNode) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
      {node}
    </GrowthProvider>,
  );
}

const webinar = { uuid: 'l-1', name: 'November webinar', description: null, origin: 'manual', members: 12, reachable: 9, created_at: null };

describe('lists', () => {
  it('shows members against who a send reaches today, and removing a list asks first', async () => {
    const request = vi.fn(async (method: string, _path: string) => (method === 'GET' ? { data: { lists: [webinar] } } : { data: {} }));
    mount(request, <ListsView />);
    expect(await screen.findByText('12 members, 9 reachable today')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Actions for November webinar'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename', 'Copy reference', 'Remove list']);
    fireEvent.click(screen.getByText('Remove list'));
    expect(await screen.findByText('Remove "November webinar"?')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Remove list').at(-1) as HTMLElement);
    await waitFor(() => expect(request).toHaveBeenCalledWith('DELETE', 'audience/lists/l-1', {}));
  });
});

describe('the target picker', () => {
  it('counts the reach live and says who is left out and why', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (path === 'audience/platform-groups') return { data: { groups: [{ key: 'paid_clients', label: 'Paid clients', kind: 'client', count: 3 }] } };
      if (path === 'audience/lists') return { data: { lists: [webinar] } };
      return { data: { reach: 1, left_out: [{ reason: 'not_subscribed', label: 'are on the platform but never subscribed (an announcement reaches them)', count: 2 }] } };
    });
    const onChange = vi.fn();
    mount(request, <TargetPicker value={{ mode: 'specific', include: [], exclude: [] }} onChange={onChange} />);

    fireEvent.click(await screen.findByText('Paid clients (3)'));
    expect(onChange).toHaveBeenCalledWith({ mode: 'specific', include: [{ type: 'segment', segment: 'paid_clients', label: 'Paid clients' }], exclude: [] });
    expect(await screen.findByText('Reaches 1 person today')).toBeTruthy();
    expect(screen.getByText(/never subscribed/)).toBeTruthy();
  });

  it('when the product cannot be read the reach is unknown, never zero', async () => {
    const request = vi.fn(async (_method: string, path: string) => {
      if (path === 'audience/lists') return { data: { lists: [] } };
      throw new Error('This product does not share its people groups.');
    });
    mount(request, <TargetPicker value={{ mode: 'specific', include: [{ type: 'segment', segment: 'paid_clients', label: 'Paid clients' }], exclude: [] }} onChange={vi.fn()} />);

    expect(await screen.findByText('Reach unknown: This product does not share its people groups.')).toBeTruthy();
    expect(screen.queryByText(/Reaches 0/)).toBeNull();
  });
});

describe('saved audiences', () => {
  it('a saved audience whose reach cannot be counted says so with the reason', async () => {
    const request = vi.fn(async () => ({ data: { segments: [{ uuid: 's-1', name: 'Paid clients', description: null, definition: {}, reach: null, reach_unavailable: 'The product could not be reached for its people groups.', updated_at: null }] } }));
    mount(request, <SegmentsView />);
    expect(await screen.findByText('Reach unknown')).toBeTruthy();
    expect(screen.getByText('The product could not be reached for its people groups.')).toBeTruthy();
  });
});
