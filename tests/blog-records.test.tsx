import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CtaLibrary, GrowthProvider, StoryBank, consentAt, ctaBodyFrom, ctaDraftFrom, localToday, storySteps, type CtaItem, type Story, type StoryFlow } from '../src';
import { EMPTY_STORY } from '../src/blog/useStoryFlow';
import { editBody, editFrom } from '../src/blog/StoryEditor';
import { personName } from '../src/blog/StoryBank';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, node: React.ReactNode, onNotice = vi.fn()) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={onNotice} words={{ audiences: {}, product: 'Portify' }}>
      {node}
    </GrowthProvider>,
  );
}

const banner: CtaItem = {
  id: 7, stage: 'decision', variant: 'banner', category: null, eyebrow: 'Ready to start?', headline: 'Find your consultant', body: null,
  button_label: 'Start matching', action_kind: 'match', action_ref: '/marketplace/intake',
  secondary: { label: 'Sign up free on Portify', action_kind: 'link', action_ref: '/register' }, active: true, updated_at: null,
};

const story: Story = {
  id: 3, case_type: 'Express Entry, CEC', challenge: 'A refused first application.', strategy: 'Rebuilt the proof of funds.', outcome: 'Approved in 5 months.',
  how_found: null, consent: { method: 'written_form', at: '2026-10-01T12:00:00Z', recorded_by: 'ada (user:1)', evidence_media_id: null },
  verified_at: null, verified_by: null, status: 'ready', pickable: false, updated_at: null,
};

describe('the CTA library', () => {
  it('groups by stage, says when a stage has nothing set up, and deleting asks first', async () => {
    const request = vi.fn(async (method: string) => (method === 'GET' ? { data: { ctas: [banner] } } : { data: {} }));
    mount(request, <CtaLibrary />);

    expect(await screen.findByText('Find your consultant')).toBeTruthy();
    expect(screen.getAllByText(/Nothing set up yet/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('Actions for Find your consultant'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Copy words', 'Copy link', 'Delete']);
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('DELETE', 'ctas/7', {}));
  });

  it('a refused save is announced and brought into view, whatever field it is about', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const request = vi.fn(async (method: string) => {
      if (method === 'GET') return { data: { ctas: [banner] } };
      throw Object.assign(new Error('refused'), { response: { status: 422, data: { errors: { action_ref: ['Give a full https address.'] } } } });
    });
    mount(request, <CtaLibrary />);
    fireEvent.click(await screen.findByLabelText('Actions for Find your consultant'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save call to action' }));
    // A generous wait: under a loaded machine the refusal's round trip can pass the 1s default (seen once).
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toBe('Give a full https address.');
    await waitFor(() => expect(scrolled).toHaveBeenCalled(), { timeout: 5000 });
  });

  it('sends the second button only when it is on, and no reference for a sign-up', () => {
    const draft = ctaDraftFrom(banner);
    expect(ctaBodyFrom(draft)).toMatchObject({ secondary_label: 'Sign up free on Portify', secondary_action_kind: 'link', secondary_action_ref: '/register', eyebrow: 'Ready to start?' });
    expect(ctaBodyFrom({ ...draft, second: false })).toMatchObject({ secondary_label: null, secondary_action_kind: null, secondary_action_ref: null });
    expect(ctaBodyFrom({ ...draft, action_kind: 'subscribe' }).action_ref).toBeNull();
  });
});

describe('the story bank', () => {
  it('offers "Mark as checked" only for a ready story with consent that nobody checked yet', async () => {
    const request = vi.fn(async (method: string) => (method === 'GET' ? { data: { stories: [story] } } : { message: 'Verified.', data: {} }));
    const onNotice = vi.fn();
    mount(request, <StoryBank />, onNotice);

    expect(await screen.findByText('Ready, needs a check')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Actions for Express Entry, CEC'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Mark as checked', 'Copy story', 'Copy reference', 'Archive', 'Delete']);
    fireEvent.click(screen.getByText('Mark as checked'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'stories/3/verify', {}));
    expect(screen.getByRole('link', { name: 'Add a story' }).getAttribute('href')).toBe('/admin/growth/blog/stories/new');
  });

  it('says who checked a story by name, never by internal reference', () => {
    expect(personName('ada@example.com (user:dc30e1ea-34e4)')).toBe('ada@example.com');
    expect(personName('user:42')).toBe('user:42');
  });

  it('an edit sends only what changed, so an untouched consent is never re-dated', () => {
    const e = editFrom(story);
    expect(editBody(e)).toEqual({});
    expect(editBody({ ...e, outcome: 'Approved in 4 months.' })).toEqual({ outcome: 'Approved in 4 months.' });
    expect(editBody({ ...e, consent_method: null, consent_on: '', status: 'draft' })).toEqual({ consent_method: null, consent_at: null, status: 'draft' });
  });

  it('dates consent given today as now (never a future noon) and an earlier day at noon UTC', () => {
    const today = consentAt(localToday()) as string;
    expect(new Date(today).getTime()).toBeLessThanOrEqual(Date.now());
    expect(consentAt('2026-01-05')).toBe('2026-01-05T12:00:00Z');
    expect(consentAt('')).toBeNull();
  });

  it('the guided add refuses an email address or phone number in the words', () => {
    const flow = (draft: Partial<typeof EMPTY_STORY>): StoryFlow => ({ draft: { ...EMPTY_STORY, ...draft }, patch: vi.fn(), hasConsent: false, saving: false, refusal: null, saved: null, save: vi.fn() });
    const [caseStep] = storySteps(flow({ case_type: 'Study permit', challenge: 'Reach her at ada@example.com' }));
    expect(caseStep?.validate()).toMatch(/email address or phone number/);
    const [, storyStep] = storySteps(flow({ case_type: 'x', challenge: 'y', strategy: 'Called +1 416 555 0199', outcome: 'Approved' }));
    expect(storyStep?.validate()).toMatch(/phone number/);
    const [ok] = storySteps(flow({ case_type: 'Study permit', challenge: 'A gap year to explain.' }));
    expect(ok?.validate()).toBeNull();
  });
});
