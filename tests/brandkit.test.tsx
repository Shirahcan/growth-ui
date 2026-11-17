import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrandKitView, GrowthProvider, contrastRatio } from '../src';

/** The brand kit (G2e-2): unset is shown, only changes are saved, a hard-to-read pair is flagged, the sender is read-only. */

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const kit = (over: Record<string, unknown> = {}) => ({
  name: 'Portify',
  logo_url: null,
  colours: { accent: '#4361EE', on_accent: '#FFFFFF', surface: null, text: null },
  fonts: { heading: null, body: 'Inter' },
  legal: { privacy_url: null, terms_url: null },
  sender: { from_name: 'Portify', from_address: 'newsletter@portify.example', reply_to: null, mailing_address: null },
  missing: ['the logo', 'the surface colour'],
  ...over,
});

function mount(request: ReturnType<typeof vi.fn>) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: {} }}>
      <BrandKitView senderNote="Set in Settings > Growth > Newsletter." />
    </GrowthProvider>,
  );
}

describe('the brand kit', () => {
  it('shows what is missing and the sender read-only, with where it is changed', async () => {
    mount(vi.fn(async () => ({ data: { brand: kit() } })));

    expect(await screen.findByText(/Not set yet: the logo, the surface colour/)).toBeTruthy();
    expect(screen.getByText(/Portify <newsletter@portify.example>/)).toBeTruthy();
    expect(screen.getByText('Set in Settings > Growth > Newsletter.')).toBeTruthy();
  });

  it('saves only the fields that changed, and an emptied field is sent as empty', async () => {
    const request = vi.fn(async (method: string) => ({ data: { brand: method === 'PUT' ? kit({ fonts: { heading: null, body: null } }) : kit() } }));
    mount(request);

    fireEvent.change(await screen.findByLabelText('Body font'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Logo address (https)'), { target: { value: 'https://portify.example/logo.png' } });
    fireEvent.click(screen.getByText('Save brand kit'));

    await waitFor(() => expect(request).toHaveBeenCalledWith('PUT', 'settings/brand', { logo_url: 'https://portify.example/logo.png', fonts: { body: '' } }));
  });

  it('edits the emphasis pair (the decision button) with its own sample and contrast warning', async () => {
    const request = vi.fn(async (method: string) => ({ data: { brand: method === 'PUT' ? kit({ colours: { accent: '#4361EE', on_accent: '#FFFFFF', surface: null, text: null, strong: '#050351', on_strong: '#FFFFFF' } }) : kit() } }));
    mount(request);

    fireEvent.change(await screen.findByLabelText('Emphasis colour (the decision button)'), { target: { value: '#050351' } });
    fireEvent.change(screen.getByLabelText('Text on the emphasis colour'), { target: { value: '#FFFFFF' } });
    expect(screen.getByText('Book a consultation: the decision button')).toBeTruthy();
    expect(screen.queryByText(/hard to read together/)).toBeNull();

    fireEvent.click(screen.getByText('Save brand kit'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('PUT', 'settings/brand', { colours: { strong: '#050351', on_strong: '#FFFFFF' } }));

    fireEvent.change(screen.getByLabelText('Text on the emphasis colour'), { target: { value: '#0E0C5E' } });
    expect(screen.getByText(/hard to read together/)).toBeTruthy();
  });

  it('flags a colour pair that is hard to read before it is saved', async () => {
    mount(vi.fn(async () => ({ data: { brand: kit() } })));

    fireEvent.change(await screen.findByLabelText('Text on the accent'), { target: { value: '#5A6FF0' } });

    expect(screen.getByText(/hard to read together/)).toBeTruthy();
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#4361EE', 'blue')).toBeNull();
  });
});
