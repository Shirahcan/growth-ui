import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, createCampaignSteps, useCreateCampaignFlow, type CreateCampaignFlow } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
const layouts = [
  { key: 'portify-weekly', name: 'Portify Weekly', parts: 6 },
  { key: 'draw-alert', name: 'Draw alert', parts: 3 },
];

/** A host wizard in miniature: draws one step and keeps the flow for the test to drive. */
function Host({ onFlow, defaultTemplate, at }: { onFlow: (f: CreateCampaignFlow) => void; defaultTemplate?: string; at: number }) {
  const flow = useCreateCampaignFlow({ defaultTemplate });
  onFlow(flow);
  const step = createCampaignSteps(flow)[at]!;

  return <div>{step.render()}<p data-testid="valid">{step.validate() ?? 'ok'}</p></div>;
}

function mount(request: ReturnType<typeof vi.fn>, at: number, defaultTemplate?: string, onError = vi.fn()) {
  let flow: CreateCampaignFlow | null = null;
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={onError} onNotice={vi.fn()} words={{ audiences: {}, product: 'Portify' }}>
      <Host onFlow={(f) => { flow = f; }} defaultTemplate={defaultTemplate} at={at} />
    </GrowthProvider>,
  );

  return () => flow as unknown as CreateCampaignFlow;
}

const service = (create?: (body: Record<string, unknown>) => unknown) => vi.fn(async (method: string, _path: string, body?: unknown) => {
  if (method === 'GET') return { data: { layouts } };
  if (create) return create(body as Record<string, unknown>);

  return { data: { campaign: { uuid: 'c-1', body_format: 'pml', layout_key: (body as { layout_key: string }).layout_key } } };
});

/** Creating a newsletter (blog on growth-service N1e): kind, an email template, the subject; then the designer. */
describe('creating a newsletter', () => {
  it('asks for the kind first, a newsletter unless an alert is chosen', () => {
    const flow = mount(service(), 0);

    expect(screen.getByRole('radio', { name: 'Newsletter' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Alert' }));
    expect(flow().draft.kind).toBe('alert');
  });

  it('offers the EMAIL templates with the product’s default picked', async () => {
    const request = service();
    mount(request, 1, 'portify-weekly');

    expect(await screen.findByRole('radio', { name: 'Portify Weekly' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Portify Weekly' }).getAttribute('aria-checked')).toBe('true');
    expect(request.mock.calls[0]?.slice(0, 2)).toEqual(['GET', 'layouts?kind=email']);
    expect(screen.getByText('Portify Weekly: 6 parts.')).toBeTruthy();
    expect(screen.getByTestId('valid').textContent).toBe('ok');
  });

  it('draws an email template’s preview as the email itself, in a frame with no permissions', async () => {
    const request = vi.fn(async (_method: string, path: string) => {
      if (path === 'layouts?kind=email') return { data: { layouts } };
      if (path.startsWith('layouts/portify-weekly')) return { data: { starter: { nodes: [], tree: null, html: '<img src="{{hero_image_url}}" alt="Hero"><p>Hi there, this week</p>' } } };

      throw new Error('no preview');
    });
    mount(request, 1, 'portify-weekly');

    const frame = (await screen.findByTitle('Portify Weekly preview')) as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('Hi there, this week');
    // A picture the author has not chosen yet is a grey placeholder, never a broken image.
    expect(frame.getAttribute('srcdoc')).not.toContain('{{hero_image_url}}');
    expect(frame.getAttribute('srcdoc')).toContain('data:image/svg+xml');
    expect(request.mock.calls.some((c) => c[0] === 'GET' && c[1] === 'layouts/draw-alert?starter=1')).toBe(true);
  });

  it('says so when no email template is set up, and the step cannot be passed', async () => {
    mount(vi.fn(async () => ({ data: { layouts: [] } })), 1);

    expect(await screen.findByText(/No email templates are set up yet/)).toBeTruthy();
    expect(screen.getByTestId('valid').textContent).toBe('Pick a template to start from.');
  });

  it('asks for a subject, counts it against the inbox guide, and creates the draft with no body', async () => {
    const request = service();
    const flow = mount(request, 2, 'portify-weekly');
    await screen.findByLabelText('Subject');

    expect(screen.getByTestId('valid').textContent).toBe('Write a subject line.');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Express Entry draw: 2,500 invitations at CRS 520 this week' } });
    expect(screen.getByText(/^\d+ of 45 characters: most inboxes cut off the rest/)).toBeTruthy();

    let created: Awaited<ReturnType<CreateCampaignFlow['create']>> = null;
    await act(async () => {
      created = await flow().create();
    });

    expect(request).toHaveBeenLastCalledWith('POST', 'campaigns', { kind: 'regular', subject: 'Express Entry draw: 2,500 invitations at CRS 520 this week', layout_key: 'portify-weekly' });
    expect(created).toMatchObject({ uuid: 'c-1', body_format: 'pml', layout_key: 'portify-weekly' });
  });

  it('shows the service’s refusal on the step, and nothing else is an error the step swallows', async () => {
    const refused = Object.assign(new Error('422'), { response: { status: 422, data: { message: 'That template is switched off.', errors: { layout_key: ['That template is switched off.'] } } } });
    const onError = vi.fn();
    const flow = mount(service(() => { throw refused; }), 2, 'portify-weekly', onError);
    await screen.findByLabelText('Subject');
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Weekly' } });

    let created: Awaited<ReturnType<CreateCampaignFlow['create']>> = null;
    await act(async () => {
      created = await flow().create();
    });

    expect(created).toBeNull();
    expect(screen.getByText('That template is switched off.')).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });
});
