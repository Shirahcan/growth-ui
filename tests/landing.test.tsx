import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, KeywordLinksView, LandingPagesView, type LandingPage } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const page = (over: Partial<LandingPage> = {}): LandingPage => ({
  uuid: 'p1', slug: 'pr-checklist', name: 'PR checklist', headline: 'Your PR checklist', intro: null, question_label: null,
  button_label: 'Send it', consent_label: 'Email me', audience: 'applicants', tags: [], deliverable_kind: 'none',
  deliverable_media_id: null, has_file: false, booking_url: null, creates_lead: false, status: 'live', search_exposure: 'search',
  layout: 'form', has_design: false, public_url: 'https://site.test/go/pr-checklist', signups: 3, confirmed: 2, updated_at: null, ...over,
});

function mount(ui: React.ReactNode, request: ReturnType<typeof vi.fn>) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' } }}>
      {ui}
    </GrowthProvider>,
  );
}

const reads = (pages: LandingPage[], baseUrl: string | null = 'https://site.test/go', keywords: unknown[] = []) =>
  vi.fn(async (method: string, path: string) =>
    method === 'GET' && path === 'landing-pages' ? { data: { pages, base_url: baseUrl } }
      : method === 'GET' && path === 'keyword-links' ? { data: { keywords } }
        : { data: {} },
  );

describe('landing pages', () => {
  it('lists pages in the product\'s words; a live page pauses, delete is last and confirmed', async () => {
    const request = reads([page(), page({ uuid: 'p2', slug: 'ads', name: 'Ads page', status: 'draft', search_exposure: 'link_only' })]);
    mount(<LandingPagesView onEdit={vi.fn()} />, request);
    expect(await screen.findByText('PR checklist')).toBeTruthy();
    expect(screen.getAllByText('Moving to Canada')).toHaveLength(2);
    expect(screen.getByText('Link only')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Actions for PR checklist'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit page', 'Copy link', 'Pause', 'Delete']);
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByRole('dialog', { name: 'Delete PR checklist?' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(request).toHaveBeenCalledWith('DELETE', 'landing-pages/p1', {}));
  });

  it('a draft publishes, and a hook the host did not give hides its item', async () => {
    const request = reads([page({ status: 'draft' })]);
    mount(<LandingPagesView />, request);
    fireEvent.click(await screen.findByLabelText('Actions for PR checklist'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy link', 'Publish', 'Delete']);
    fireEvent.click(screen.getByText('Publish'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'landing-pages/p1/publish', {}));
  });

  it('says so when the product has not set where its pages live', async () => {
    const onOpenSettings = vi.fn();
    mount(<LandingPagesView onOpenSettings={onOpenSettings} />, reads([page({ public_url: null })], null));
    expect(await screen.findByText(/no address yet, so none can go live/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Growth settings' }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe('keyword links', () => {
  it('the link tag follows the keyword and the link saves to the chosen page', async () => {
    const request = reads([page()]);
    mount(<KeywordLinksView replyTool="ManyChat" />, request);
    fireEvent.click(await screen.findByRole('button', { name: 'New keyword link' }));
    fireEvent.change(screen.getByLabelText('Keyword'), { target: { value: 'PR Checklist' } });
    expect((screen.getByLabelText('Link tag') as HTMLInputElement).value).toBe('pr-checklist');
    fireEvent.click(screen.getByRole('button', { name: 'Save keyword link' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'keyword-links', { keyword: 'PR Checklist', landing_page_uuid: 'p1', src: 'pr-checklist' }));
  });

  it('a keyword link offers copy first and delete last', async () => {
    mount(<KeywordLinksView />, reads([page()], 'https://site.test/go', [{ uuid: 'k1', keyword: 'PR', src: 'pr', page_name: 'PR checklist', page_uuid: 'p1', url: 'https://site.test/go/pr-checklist?src=pr', signups: 1 }]));
    fireEvent.click(await screen.findByLabelText('Actions for PR'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy link', 'Edit', 'Delete']);
  });
});
