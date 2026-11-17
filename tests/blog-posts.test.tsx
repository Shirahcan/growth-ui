import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlogPosts, GrowthProvider, postStatus, postsPath, type BlogPostSummary } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

const base: Omit<BlogPostSummary, 'uuid' | 'id' | 'title'> = {
  slug: null, status: 'draft', body_format: 'html', category: null, audience: null, stale_reason: null, live: false,
  has_unpublished_changes: false, published_at: null, scheduled_for: null, updated_at: null, public_url: null,
};
const live: BlogPostSummary = { ...base, uuid: 'u-live', id: 1, title: 'CRS explained', slug: 'crs-explained', status: 'published', live: true, category: { id: 4, name: 'Express Entry' }, public_url: 'https://portify.ca/blog/crs-explained' };
const designed: BlogPostSummary = { ...base, uuid: 'u-design', id: 2, title: 'Study permit checklist', body_format: 'pml' };
const stale: BlogPostSummary = { ...live, uuid: 'u-stale', id: 3, title: 'Fees in 2026', stale_reason: 'The biometrics fee it quotes changed on 1 Dec.' };

function mount(request: ReturnType<typeof vi.fn>, props: Partial<React.ComponentProps<typeof BlogPosts>> = {}, onNotice = vi.fn()) {
  const navigate = vi.fn();
  render(
    <GrowthProvider product="portify" request={request as never} hrefFor={hrefFor as never} onError={vi.fn()} onNotice={onNotice} words={{ audiences: {}, product: 'Portify' }}>
      <BlogPosts postHref={(uuid) => `/admin/growth/blog/${uuid}`} designHref={(p) => `/admin/growth/blog/${p.uuid}/design`} navigate={navigate} {...props} />
    </GrowthProvider>,
  );

  return { navigate };
}

function server(posts: BlogPostSummary[]) {
  return vi.fn(async (method: string, path: string) => {
    if (method === 'GET' && path.startsWith('blog/categories')) return { data: { categories: [] } };
    if (method === 'GET') return { data: { posts } };
    return { message: method === 'DELETE' ? 'Post deleted. Anything already published keeps its record.' : 'Unpublished. It no longer appears on the blog.', data: {} };
  });
}

/** Growth > Blog on growth-service (S5 step 1): the posts list, its filters and its row menu. */
describe('the blog posts list', () => {
  it('shows each post with its status, category and the product’s own reach figures', async () => {
    mount(server([live, designed, stale]), { reach: { 'u-live': { readers: 1, subscribers: 3 } } });

    expect(await screen.findByText('CRS explained')).toBeTruthy();
    // The status tabs share some words with the pills, so read the pills inside the list itself.
    const list = within(screen.getByRole('list', { name: 'Posts' }));
    expect(list.getByText('Published')).toBeTruthy();
    expect(list.getByText('Draft')).toBeTruthy();
    expect(list.getByText('Facts changed')).toBeTruthy();
    expect(list.getByText('The biometrics fee it quotes changed on 1 Dec.')).toBeTruthy();
    expect(list.getByText('1 reader, 3 subscribers')).toBeTruthy();
    expect(list.getAllByText('0 readers, 0 subscribers')).toHaveLength(2); // a post the host has no figures for
    expect(list.getAllByText('Express Entry')).toHaveLength(2);
  });

  it('asks the host for the figures of exactly the rows it loaded, by uuid and address', async () => {
    const reachFor = vi.fn(async () => ({ 'u-live': { readers: 7, subscribers: 2 } }));
    mount(server([live, designed]), { reachFor });

    const list = within(await screen.findByRole('list', { name: 'Posts' }));
    expect(await list.findByText('7 readers, 2 subscribers')).toBeTruthy();
    expect(reachFor).toHaveBeenCalledWith([{ uuid: 'u-live', slug: 'crs-explained' }, { uuid: 'u-design', slug: designed.slug }]);
  });

  it('without reach figures from the host, no readers or subscribers are shown at all', async () => {
    mount(server([live]));
    expect(await screen.findByText('CRS explained')).toBeTruthy();
    expect(screen.queryByText(/readers?,/)).toBeNull();
  });

  it('asks the service only for the filters in use, and Facts changed asks for stale posts', async () => {
    const request = server([]);
    mount(request);
    await waitFor(() => expect(request.mock.calls.some(([m, p]) => m === 'GET' && p === 'blog/posts')).toBe(true));

    fireEvent.click(screen.getByRole('radio', { name: 'Facts changed' }));
    await waitFor(() => expect(request.mock.calls.some(([, p]) => p === 'blog/posts?status=stale')).toBe(true));
    expect(await screen.findByText('No posts match. Try another filter.')).toBeTruthy();
  });

  it('each row offers only what makes sense for that post, and Edit goes through the host’s navigation', async () => {
    const { navigate } = mount(server([live, designed]));

    fireEvent.click(await screen.findByLabelText('Actions for CRS explained'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'View on the blog', 'Copy link', 'Unpublish', 'Delete']);
    fireEvent.click(screen.getByText('Edit'));
    expect(navigate).toHaveBeenCalledWith('/admin/growth/blog/u-live');

    fireEvent.click(screen.getByLabelText('Actions for Study permit checklist'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Open the design', 'Delete']);
    fireEvent.click(screen.getByText('Open the design'));
    expect(navigate).toHaveBeenCalledWith('/admin/growth/blog/u-design/design');
  });

  it('a live post with no public address offers no link and says why, never a guessed address', async () => {
    mount(server([{ ...live, public_url: null }]));

    expect(await screen.findByText(/public address is not set yet/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Actions for CRS explained'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Unpublish', 'Delete']);
  });

  it('unpublishes in one step, and deleting asks first', async () => {
    const onNotice = vi.fn();
    const request = server([live]);
    mount(request, {}, onNotice);

    fireEvent.click(await screen.findByLabelText('Actions for CRS explained'));
    fireEvent.click(screen.getByText('Unpublish'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('POST', 'blog/posts/u-live/unpublish', {}));

    fireEvent.click(screen.getByLabelText('Actions for CRS explained'));
    fireEvent.click(screen.getByText('Delete'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "CRS explained"?' });
    expect(request.mock.calls.some(([m]) => m === 'DELETE')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('DELETE', 'blog/posts/u-live', {}));
  });

  it('opens the categories manager from the list', async () => {
    mount(server([]));
    fireEvent.click(await screen.findByRole('button', { name: 'Manage categories' }));
    expect(await screen.findByRole('dialog', { name: 'Blog categories' })).toBeTruthy();
  });

  it('names a post’s state the way the list shows it, and builds the list address from the filters in use', () => {
    expect(postStatus({ ...live, has_unpublished_changes: true }).label).toBe('Live, changes waiting');
    expect(postStatus({ ...base, uuid: 'x', id: 9, title: null, status: 'scheduled' }).label).toBe('Scheduled');
    expect(postStatus({ ...base, uuid: 'x', id: 9, title: null, status: 'unpublished' }).label).toBe('Unpublished');
    expect(postStatus(stale).label).toBe('Facts changed'); // facts outrank everything, even a live post

    expect(postsPath('all', '', '  ')).toBe('blog/posts');
    expect(postsPath('draft', 4, 'crs score')).toBe('blog/posts?status=draft&category=4&q=crs+score');
  });
});
