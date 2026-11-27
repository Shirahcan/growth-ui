import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, SubjectTestSettingsView } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

describe('subject-line test settings (G5e)', () => {
  it('reads the product’s three numbers and saves a change to the service', async () => {
    const request = vi.fn(async (method: string, _path: string, body?: Record<string, unknown>) => ({
      data: { audience: { subject_test_split_percent: method === 'PUT' ? body?.subject_test_split_percent : 10, subject_test_wait_hours: 4, subject_test_min_audience: 200 } },
    }));
    const notify = vi.fn();
    render(
      <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={notify} words={{ audiences: {}, product: 'Portify' }}>
        <SubjectTestSettingsView />
      </GrowthProvider>,
    );

    const share = (await screen.findByLabelText('Share per subject (%)')) as HTMLInputElement;
    expect(share.value).toBe('10');
    expect((screen.getByLabelText('Smallest audience') as HTMLInputElement).value).toBe('200');
    fireEvent.change(share, { target: { value: '15' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save subject-line test settings' }));
    });

    expect(request).toHaveBeenLastCalledWith('PUT', 'settings/audience', { subject_test_split_percent: 15, subject_test_wait_hours: 4, subject_test_min_audience: 200 });
    expect(share.value).toBe('15');
  });
});
