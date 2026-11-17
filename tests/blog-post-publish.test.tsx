import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GrowthProvider, type BlogPostDetail } from '../src';
import { PostPublishBar } from '../src/blog/PostPublishBar';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const draft = {
  uuid: 'p1', id: 1, title: 'CRS explained', slug: 'crs-explained', status: 'draft', body_format: 'html', category: null, audience: null, stale_reason: null,
  live: false, has_unpublished_changes: false, published_at: null, scheduled_for: null, updated_at: null, public_url: null, fields_version: 3,
} as unknown as BlogPostDetail;

function mount(post: BlogPostDetail, request: ReturnType<typeof vi.fn>, flush = vi.fn(async () => true), onNotice = vi.fn()) {
  const onPost = vi.fn();
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={onNotice} words={{ audiences: {}, product: 'Portify' }}>
      <PostPublishBar post={post} flush={flush} onPost={onPost} />
    </GrowthProvider>,
  );

  return { onPost, flush, onNotice };
}

/** Publishing a post on growth-service (S5 step 2, on S2c's publish / unpublish). */
describe('the publish bar', () => {
  it('a draft is published after asking, with any waiting field change stored first', async () => {
    const published = { ...draft, status: 'published', live: true };
    const request = vi.fn(async () => ({ message: 'Published.', data: { post: published } }));
    const { onPost, flush, onNotice } = mount(draft, request);

    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish this post?' });
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'blog/posts/p1/publish', {}));
    expect(flush).toHaveBeenCalled();
    expect(onPost).toHaveBeenCalledWith(published);
    expect(onNotice).toHaveBeenCalled();
  });

  it('a post that is not ready is refused with the checks that failed, and nothing changes', async () => {
    const request = vi.fn(async () => {
      throw Object.assign(new Error('not ready'), {
        response: { status: 422, data: { message: 'This post is not ready to publish: Has a title, Summary is 15 to 60 words.', errors: { readiness: ['Has a title', 'Summary is 15 to 60 words'] } } },
      });
    });
    const { onPost } = mount(draft, request);

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert.textContent).toContain('This post is not ready to publish');
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Has a title', 'Summary is 15 to 60 words']);
    expect(onPost).not.toHaveBeenCalled();
  });

  it('a change that could not be stored stops the publish before anything goes live', async () => {
    const request = vi.fn();
    mount(draft, request, vi.fn(async () => false));

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' }));

    expect((await screen.findByRole('alert')).textContent).toContain('nothing was published');
    expect(request).not.toHaveBeenCalled();
  });

  it('a live post with waiting changes offers to publish them, and unpublishing asks first', async () => {
    const request = vi.fn(async () => ({ message: 'Unpublished. It no longer appears on the blog.', data: { post: { ...draft, status: 'unpublished' } } }));
    mount({ ...draft, status: 'published', live: true, has_unpublished_changes: true }, request);

    expect(screen.getByText('Live, with changes not published yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish the changes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Take this post off the blog?' })).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'blog/posts/p1/unpublish', {}));
  });

  it('a scheduled post can go live now or back to a draft; a draft is scheduled for the time picked', async () => {
    const request = vi.fn(async () => ({ message: 'Scheduled.', data: { post: draft } }));
    mount({ ...draft, status: 'scheduled', scheduled_for: '2026-12-04T09:00:00Z' }, request);
    expect(screen.getByText(/^Scheduled for /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to draft' })).toBeTruthy();
  });

  it('scheduling sends the chosen time', async () => {
    const request = vi.fn(async () => ({ message: 'Scheduled.', data: { post: { ...draft, status: 'scheduled' } } }));
    mount(draft, request);

    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule this post' });
    expect((within(dialog).getByRole('button', { name: 'Schedule' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Goes live at'), { target: { value: '2030-01-15T09:30' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'blog/posts/p1/publish', { at: new Date('2030-01-15T09:30').toISOString() }));
  });
});
