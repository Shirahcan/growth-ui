import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, ChoiceGroup, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Notice, Pill, copyText } from '../ui/primitives';
import { BlogCategories } from './BlogCategories';
import type { BlogCategory, BlogPostReach, BlogPostSummary } from './types';

type StatusFilter = 'all' | 'published' | 'draft' | 'stale';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
  { value: 'stale', label: 'Facts need a look' },
];

/** The one status a reader of the list needs, most urgent first (the same six Portify's list showed). */
export function postStatus(post: BlogPostSummary): { label: string; tone: 'muted' | 'accent' | 'good' | 'bad' } {
  // A figure moved, was not checked at publish, or is past its review date: the hint line under the title says which.
  if (post.stale_reason) return { label: 'Facts need a look', tone: 'bad' };
  if (post.live && post.has_unpublished_changes) return { label: 'Live, changes waiting', tone: 'accent' };
  if (post.live) return { label: 'Published', tone: 'good' };
  if (post.status === 'scheduled') return { label: 'Scheduled', tone: 'accent' };
  if (post.status === 'unpublished') return { label: 'Unpublished', tone: 'muted' };

  return { label: 'Draft', tone: 'muted' };
}

/** The list's address on the service: only the filters in use. */
export function postsPath(status: StatusFilter, category: number | '', q: string): string {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (category !== '') params.set('category', String(category));
  if (q.trim() !== '') params.set('q', q.trim());
  const query = params.toString();

  return query === '' ? 'blog/posts' : `blog/posts?${query}`;
}

export interface BlogPostsProps {
  /** The host's page for one post (its fields and readiness). */
  postHref: (uuid: string) => string;
  /** The host's designer for a designed post, or null when the host offers none for it. */
  designHref?: (post: BlogPostSummary) => string | null;
  /** In-app navigation the host's way (its router), for the row menu. */
  navigate: (href: string) => void;
  /** Each post's readers and subscribers as the PRODUCT measures them, by post uuid. Absent: the columns are not shown. */
  reach?: Record<string, BlogPostReach>;
  /**
   * The same figures, asked for exactly the rows on screen (by uuid and address) each time the list loads. For a host
   * that measures by address and cannot know the list in advance. Ignored when `reach` is given.
   */
  reachFor?: (posts: readonly { uuid: string; slug: string | null }[]) => Promise<Record<string, BlogPostReach>>;
}

/**
 * Growth > Blog (blog on growth-service S5, step 1): every post on the service, its status, and one menu of actions per
 * row. The service answers what each post is (live, waiting changes, facts changed); readers and subscribers are the
 * product's own figures, passed in by the host, because the service does not measure them. A post's address comes from
 * the service (`public_url`), never assembled here, so a product whose blog address is not set yet shows no link at all.
 */
export function BlogPosts({ postHref, designHref, navigate, reach: given, reachFor }: BlogPostsProps) {
  const { request, notify, onError, canEdit, Link } = useGrowth();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<number | ''>('');
  const [q, setQ] = useState('');
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState<BlogPostSummary | null>(null);
  const [managing, setManaging] = useState(false);
  const [asked, setAsked] = useState<Record<string, BlogPostReach> | undefined>(undefined);
  const reach = given ?? asked;

  // The list follows its filters; typing waits a moment so every key is not a request.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      request<Envelope<{ posts: BlogPostSummary[] }>>('GET', postsPath(status, category, q))
        .then((res) => {
          if (!live) return;
          const rows = unwrap(res).posts;
          setPosts(rows);
          setFailed(null);
          // The product's figures for these rows; a failure leaves the columns out rather than showing zeros as fact.
          if (!given && reachFor) {
            reachFor(rows.map((p) => ({ uuid: p.uuid, slug: p.slug })))
              .then((figures) => live && setAsked(figures))
              .catch((e) => live && onError(e));
          }
        })
        .catch((e) => {
          if (!live) return;
          setFailed(e instanceof Error ? e.message : 'The posts could not be loaded.');
          onError(e);
        });
    }, 250);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [request, onError, status, category, q, reloadKey, given, reachFor]);

  // Every category, switched-off ones too: an older post can still sit in one.
  useEffect(() => {
    let live = true;
    request<Envelope<{ categories: BlogCategory[] }>>('GET', 'blog/categories')
      .then((res) => live && setCategories(unwrap(res).categories))
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const filtered = status !== 'all' || category !== '' || q.trim() !== '';
  const noAddress = (posts ?? []).some((p) => p.live && p.public_url === null);

  async function unpublish(post: BlogPostSummary) {
    try {
      const res = await request<Envelope<unknown>>('POST', `blog/posts/${post.uuid}/unpublish`, {});
      notify(res?.message || 'Unpublished. It no longer appears on the blog.');
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function remove(post: BlogPostSummary) {
    try {
      const res = await request<Envelope<unknown>>('DELETE', `blog/posts/${post.uuid}`, {});
      notify(res?.message || 'Post deleted.');
      setDeleting(null);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function copy(url: string) {
    if (await copyText(url)) notify('Post link copied.');
    else onError(new Error('Copying was blocked by the browser. Select the address and copy it instead.'));
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-filters">
          <Field label="Search posts">
            {(id) => <input id={id} type="search" className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="A word in the title" />}
          </Field>
          <Field label="Category">
            {(id) => (
              <select id={id} className={INPUT} value={category} onChange={(e) => setCategory(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.is_active ? c.name : `${c.name} (switched off)`}</option>
                ))}
              </select>
            )}
          </Field>
          <Button onClick={() => setManaging(true)}>{canEdit ? 'Manage categories' : 'See categories'}</Button>
        </div>
        <ChoiceGroup<StatusFilter> label="Which posts" value={status} options={STATUS_FILTERS} onChange={setStatus} />

        {noAddress ? <Notice>The blog&apos;s public address is not set yet, so posts have no link to open or copy. Links appear here once it is set.</Notice> : null}

        {failed ? (
          <LoadError message={failed} onRetry={reload} />
        ) : posts === null ? (
          <Loading />
        ) : posts.length === 0 ? (
          <Empty>{filtered ? 'No posts match. Try another filter.' : 'No posts yet. Use New post to write the first one.'}</Empty>
        ) : (
          <ul className="gr-list" aria-label="Posts">
            {posts.map((post) => {
              const pill = postStatus(post);
              const title = post.title || 'Untitled post';
              const design = post.body_format === 'pml' ? (designHref?.(post) ?? null) : null;
              const figures = reach ? (reach[post.uuid] ?? { readers: 0, subscribers: 0 }) : null;

              return (
                <li key={post.uuid} className="gr-list-row">
                  <div className="gr-grow">
                    <Link href={postHref(post.uuid)} className="gr-row-title">{title}</Link>
                    {post.stale_reason ? <p className="gr-hint">{post.stale_reason}</p> : null}
                    <div className="gr-pills">
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                      <Pill>{post.category?.name ?? 'No category'}</Pill>
                      {figures ? (
                        <span className="gr-hint">
                          {figures.readers} {figures.readers === 1 ? 'reader' : 'readers'}, {figures.subscribers} {figures.subscribers === 1 ? 'subscriber' : 'subscribers'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Kebab
                    label={`Actions for ${title}`}
                    items={[
                      { label: 'Edit', onSelect: () => navigate(postHref(post.uuid)) },
                      { label: 'Open the design', hidden: design === null, onSelect: () => design && navigate(design) },
                      { label: 'View on the blog', hidden: !post.live || !post.public_url, onSelect: () => post.public_url && window.open(post.public_url, '_blank', 'noopener,noreferrer') },
                      { label: 'Copy link', hidden: !post.public_url, onSelect: () => post.public_url && void copy(post.public_url) },
                      { label: 'Unpublish', hidden: !canEdit || !post.live, onSelect: () => void unpublish(post) },
                      { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setDeleting(post) },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleting ? (
        <Dialog
          title={`Delete "${deleting.title || 'Untitled post'}"?`}
          description="The post leaves the blog and this list. Anything already published keeps its record."
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button tone="danger" onClick={() => void remove(deleting)}>Delete</Button>
            </>
          }
        >
          <p className="gr-hint">To take a live post off the blog but keep it, choose Unpublish instead.</p>
        </Dialog>
      ) : null}

      {managing ? <BlogCategories onClose={() => setManaging(false)} onChanged={reload} /> : null}
    </Card>
  );
}
