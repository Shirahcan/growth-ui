import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, RadarSettingsView } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;
const source = (over: Record<string, unknown>) => ({
  id: 1, name: 'Alberta (AAIP) draws', kind: 'html_page', url: 'https://www.alberta.ca/aaip', public_url: 'https://www.alberta.ca/aaip', audience: 'applicants',
  section_heading: 'Draws', check_every_minutes: 120, is_active: true, is_built_in: false, last_checked_at: null, last_error: null, needs_attention: false, ...over,
});

function mount(request: ReturnType<typeof vi.fn>, props: Parameters<typeof RadarSettingsView>[0] = {}) {
  return render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={vi.fn()} words={{ audiences: { applicants: 'Moving to Canada' } }}>
      <RadarSettingsView {...props} />
    </GrowthProvider>,
  );
}

const reads = (sources: unknown[]) => vi.fn(async (method: string, path: string) =>
  method === 'GET' && path === 'watched-sources'
    ? { data: { sources } }
    : method === 'GET'
      ? { data: { radar: { enabled: true, tracked_countries: ['IN'], min_change_days: 7, post_within_hours: 24, plan_cadence_days: 14 } } }
      : { data: { radar: { enabled: true, tracked_countries: ['IN', 'NG'], min_change_days: 7, post_within_hours: 24, plan_cadence_days: 14 } } },
);

describe('the radar settings', () => {
  it('a built-in feed can only be checked and paused; a page also edits and deletes, delete last', async () => {
    mount(reads([source({}), source({ id: 2, name: 'Express Entry rounds', kind: 'ee_rounds', is_built_in: true })]));
    fireEvent.click(await screen.findByLabelText('Actions for Express Entry rounds'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Check now', 'Copy link', 'Pause']);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('Actions for Alberta (AAIP) draws'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Check now', 'Copy link', 'Edit', 'Pause', 'Delete']);
  });

  it('countries come from the host and are saved as codes', async () => {
    const request = reads([]);
    mount(request, { countries: [{ code: 'IN', name: 'India' }, { code: 'NG', name: 'Nigeria' }] });
    expect(await screen.findByText('India')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Add a country'), { target: { value: 'NG' } });
    fireEvent.click(screen.getByText('Save radar settings'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('PUT', 'settings/radar', expect.objectContaining({ tracked_countries: ['IN', 'NG'] })));
  });

  it('a refused field shows beside the form instead of a generic error', async () => {
    const request = vi.fn(async (method: string, path: string) => {
      if (method === 'GET') return path === 'watched-sources' ? { data: { sources: [] } } : { data: { radar: { enabled: false, tracked_countries: [], min_change_days: 7, post_within_hours: 24, plan_cadence_days: 14 } } };
      throw { response: { status: 422, data: { errors: { url: ['Use a public URL, such as an official government page.'] } } } };
    });
    mount(request);
    fireEvent.click(await screen.findByText('Add a source'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Local' } });
    fireEvent.change(screen.getByLabelText('Page address'), { target: { value: 'https://10.0.0.1/x' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Use a public URL, such as an official government page.')).toBeTruthy();
    expect(screen.getByText(/switched off/)).toBeTruthy();
  });
});
