import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraftFromSubject } from '../src/campaigns/DraftFromSubject';
import type { CampaignFlow } from '../src/campaigns/useCampaignFlow';
import { GrowthProvider } from '../src';

function mount(request: ReturnType<typeof vi.fn>, set = vi.fn()) {
  const flow = {
    draft: { kind: 'regular', subject: 'Express Entry draw this week', preheader: '', bodyHtml: '<p>Mine</p>', topic: '' },
    set,
    topics: [],
  } as unknown as CampaignFlow;
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={((t: string) => `/admin/growth/${t}`) as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <DraftFromSubject flow={flow} label="Ask Porter to draft it from the subject" />
    </GrowthProvider>,
  );

  return { set };
}

/** "Draft it from the subject": what a person must confirm is listed beside the draft, never inside the email. */
describe('drafting from the subject', () => {
  it('lists the service’s checks as "Before you send, check:" and puts them away with the draft', async () => {
    const request = vi.fn().mockResolvedValue({ data: { draft: {
      body_html: '<p>2,500 invitations at CRS 520.</p>', preheader: 'This week', checks: ['VERIFY: the CRS cut-off of 520', 'VERIFY: 2,500 invitations'],
    } } });
    const { set } = mount(request);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask Porter to draft it from the subject' })); });

    expect(set).toHaveBeenCalledWith({ bodyHtml: '<p>2,500 invitations at CRS 520.</p>', preheader: 'This week' });
    const list = screen.getByRole('list', { name: 'Before you send, check' });
    expect(list.textContent).toContain('the CRS cut-off of 520');
    expect(list.textContent).not.toContain('VERIFY:');

    fireEvent.click(screen.getByRole('button', { name: 'Put back what I wrote' }));
    expect(screen.queryByRole('list', { name: 'Before you send, check' })).toBeNull();
  });

  it('shows no list when the service has nothing to confirm', async () => {
    mount(vi.fn().mockResolvedValue({ data: { draft: { body_html: '<p>Hi</p>', preheader: '' } } }));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ask Porter to draft it from the subject' })); });

    expect(screen.queryByRole('list', { name: 'Before you send, check' })).toBeNull();
  });
});
