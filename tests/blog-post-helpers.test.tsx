import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GrowthProvider, PostHelpers, type PostHelpersProps } from '../src';

function mount(request: ReturnType<typeof vi.fn>, props: Partial<PostHelpersProps> = {}) {
  const onError = vi.fn();
  const onNotice = vi.fn();
  const utils = render(
    <GrowthProvider product="portify" request={request as never} hrefFor={((t: string) => `/admin/growth/${t}`) as never} onError={onError} onNotice={onNotice}
      words={{ audiences: {}, assistant: 'Porter', product: 'Portify' }}>
      <PostHelpers post={{ uuid: 'p1', linkedin_text: null }} {...props} />
    </GrowthProvider>,
  );

  return { onError, onNotice, ...utils };
}

const box = () => screen.getByLabelText('LinkedIn version', { selector: 'textarea' }) as HTMLTextAreaElement;

/** Help from the assistant on a post (S5, the service's S2d endpoints), drawn in the designer's slide-in panel. */
describe('the post helpers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prepares a LinkedIn version, shows the service sentence as it is, and copies it', async () => {
    const request = vi.fn().mockResolvedValue({ message: 'LinkedIn version ready. Copy it and post it from LinkedIn.', data: { linkedin_text: 'CRS, explained in 3 lines.', ai_used: true } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { onNotice } = mount(request);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Prepare LinkedIn version' })); });

    expect(request).toHaveBeenCalledWith('POST', 'blog/posts/p1/linkedin', {});
    expect(screen.getByText('LinkedIn version ready. Copy it and post it from LinkedIn.')).toBeTruthy();
    expect(box().value).toBe('CRS, explained in 3 lines.');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
    expect(writeText).toHaveBeenCalledWith('CRS, explained in 3 lines.');
    expect(onNotice).toHaveBeenCalledWith('Copied. Paste it into a new LinkedIn post.');
    expect(screen.getByRole('button', { name: 'Prepare it again' })).toBeTruthy();
  });

  it('shows a stored version without asking again', () => {
    const request = vi.fn();
    mount(request, { post: { uuid: 'p1', linkedin_text: 'Stored text.' } });

    expect(box().value).toBe('Stored text.');
    expect(screen.getByRole('button', { name: 'Prepare it again' })).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it('checks the writing and lists each finding with its words', async () => {
    const request = vi.fn().mockResolvedValue({ message: 'Here is what I found.', data: { issues: [{ kind: 'spelling', quote: 'recieve', say: 'Write "receive".' }], ai_used: true } });
    mount(request);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check the writing' })); });

    expect(request).toHaveBeenCalledWith('POST', 'blog/posts/p1/proofread', {});
    const list = screen.getByRole('list', { name: 'What the check found' });
    expect(list.textContent).toContain('recieve');
    expect(list.textContent).toContain('Write "receive".');
    expect(screen.getByText('Here is what I found.')).toBeTruthy();
  });

  it('a clean check says so in the service words, with no empty list', async () => {
    const request = vi.fn().mockResolvedValue({ message: 'I found nothing a reader would trip over.', data: { issues: [], ai_used: true } });
    mount(request);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check the writing' })); });
    expect(screen.getByText('I found nothing a reader would trip over.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'What the check found' })).toBeNull();
  });

  it('a refusal with readiness reasons stays in the panel; anything else goes to onError', async () => {
    const refused = Object.assign(new Error('422'), { response: { status: 422, data: { message: 'This post is not ready for a LinkedIn version.', errors: { readiness: ['A summary'] } } } });
    const request = vi.fn().mockRejectedValueOnce(refused).mockRejectedValueOnce(new Error('down'));
    const { onError } = mount(request);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Prepare LinkedIn version' })); });
    expect(screen.getByRole('alert').textContent).toContain('A summary');
    expect(onError).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check the writing' })); });
    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it('asks nothing while the host could not save what is on screen', async () => {
    const request = vi.fn();
    mount(request, { flush: async () => false });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Check the writing' })); });
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('not saved yet');
  });
});
