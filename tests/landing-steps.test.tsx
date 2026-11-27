import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, landingSteps, landingVerb, useLandingFlow, type LandingFlow, type LandingPage, type LandingStepsOptions } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
const saved = (over: Partial<LandingPage> = {}) => ({ data: { page: { uuid: 'p1', slug: 'pr-checklist', status: 'draft', ...over } } });

let flow: LandingFlow;
function Harness({ uploadFile, page, options }: { uploadFile?: (u: string, f: File) => Promise<unknown>; page?: LandingPage; options: LandingStepsOptions }) {
  flow = useLandingFlow({ page, uploadFile, start: { audience: 'applicants', consent: 'Email me updates.' } });
  const steps = landingSteps(flow, options);

  return (
    <div>
      <p data-testid="ids">{steps.map((s) => s.id).join(',')}</p>
      {steps.map((s) => (
        <section key={s.id} aria-label={s.title}>{s.render()}</section>
      ))}
    </div>
  );
}

function mount(request: ReturnType<typeof vi.fn>, props: Parameters<typeof Harness>[0]) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' }, product: 'Portify' }}>
      <Harness {...props} />
    </GrowthProvider>,
  );
}

const OPTIONS: LandingStepsOptions = { baseUrl: 'https://site.test/go', bookingHost: 'site.test', hostSubmits: true };

describe('the landing page steps', () => {
  it('a new fixed page skips the designer steps unless the host offers them', () => {
    mount(vi.fn(), { options: OPTIONS });
    expect(screen.getByTestId('ids').textContent).toBe('basics,content,deliverable,consent,exposure,review');

    mount(vi.fn(), { options: { ...OPTIONS, designerAvailable: true } });
    expect(screen.getAllByTestId('ids')[1]!.textContent).toBe('kind,basics,content,deliverable,consent,exposure,review');
  });

  it('the address follows the name until typed, and each step says what is missing', () => {
    mount(vi.fn(), { options: OPTIONS });
    fireEvent.change(screen.getByLabelText('Name (only your team sees this)'), { target: { value: 'PR Checklist 2026' } });
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('pr-checklist-2026');
    expect(screen.getByText('Visitors open https://site.test/go/pr-checklist-2026')).toBeTruthy();

    const steps = landingSteps(flow, OPTIONS);
    expect(steps.find((s) => s.id === 'content')!.validate()).toBe('Write the headline visitors see first.');
    act(() => flow.set({ deliverable: 'booking_link', bookingUrl: 'https://elsewhere.test/book' }));
    expect(landingSteps(flow, OPTIONS).find((s) => s.id === 'deliverable')!.validate()).toBe('Use a booking link on your own site: it goes into an email you send.');
    act(() => flow.set({ deliverable: 'file' }));
    expect(landingSteps(flow, OPTIONS).find((s) => s.id === 'deliverable')!.validate()).toMatch(/Choose the PDF/);
    expect(landingSteps(flow, OPTIONS).find((s) => s.id === 'exposure')!.validate()).toBe('Choose who can find this page.');
  });

  it('saves, sends the PDF through the host, then publishes, in that order', async () => {
    const order: string[] = [];
    const request = vi.fn(async (method: string, path: string) => {
      order.push(`${method} ${path}`);
      return saved(path.endsWith('/publish') ? { status: 'live' } : {});
    });
    const uploadFile = vi.fn(async () => {
      order.push('upload');
      return {};
    });
    mount(request, { uploadFile, options: OPTIONS });
    act(() => flow.set({ name: 'PR checklist', slug: 'pr-checklist', headline: 'Your PR checklist', deliverable: 'file', exposure: 'search' }));
    act(() => flow.setFile(new File(['%PDF-1.4'], 'checklist.pdf', { type: 'application/pdf' })));
    expect(landingVerb(flow)).toBe('Publish the page');

    let out: LandingPage | null = null;
    await act(async () => {
      out = await flow.submit();
    });
    expect(order).toEqual(['POST landing-pages', 'upload', 'POST landing-pages/p1/publish']);
    expect(uploadFile).toHaveBeenCalledWith('p1', expect.any(File));
    expect((out as LandingPage | null)?.status).toBe('live');
  });

  it('a refusal stays on the review step and a retry updates the same page', async () => {
    const refused = Object.assign(new Error('refused'), { response: { status: 422, data: { errors: { slug: ['That address is reserved. Choose another.'] } } } });
    const request = vi.fn()
      .mockResolvedValueOnce(saved())
      .mockRejectedValueOnce(refused)
      .mockResolvedValue(saved({ status: 'live' }));
    mount(request, { options: OPTIONS });
    act(() => flow.set({ name: 'PR', slug: 'pr', headline: 'H', exposure: 'search' }));

    await act(async () => {
      await flow.submit();
    });
    expect(flow.refusal).toBe('That address is reserved. Choose another.');
    await act(async () => {
      await flow.submit();
    });
    expect(request.mock.calls.map((c) => `${c[0]} ${c[1]}`)).toEqual(['POST landing-pages', 'POST landing-pages/p1/publish', 'PUT landing-pages/p1', 'POST landing-pages/p1/publish']);
  });
});
