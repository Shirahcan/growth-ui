import type { CSSProperties, ReactNode } from 'react';
import { themeStyle, type GrowthTheme } from '../theme';
import { blogDateLine, blogPageHref } from './dates';
import {
  DEFAULT_PUBLIC_PATHS,
  DEFAULT_PUBLIC_WORDS,
  categoryPath,
  postPath,
  type BlogListMeta,
  type PublicBlogCard,
  type PublicBlogCategory,
  type PublicBlogPaths,
  type PublicBlogWords,
  type PublicLink,
} from './types';

/**
 * The public blog's list (blog on growth-service S8b-1): the category row, the card grid and the pager, one
 * assembly for the blog home and a category page, so the two cannot drift.
 *
 * SERVER-SAFE: no hooks and no provider. It renders on the server, so crawlers and readers without JavaScript get
 * every link. Paged: a list without its pager leaves every post after the first page reachable only by sitemap.
 *
 * Each card carries `data-blog-slug`; a host's browser-only read markers set `data-read="true"` on it, which
 * shows the card's "Read" pill.
 */
export interface PublicBlogListProps {
  posts: PublicBlogCard[];
  categories: PublicBlogCategory[];
  /** The category being shown, or null on the blog home. */
  active: string | null;
  meta: BlogListMeta;
  /** The address the pager pages (the blog home or the category page). */
  basePath: string;
  Link?: PublicLink;
  words?: Partial<PublicBlogWords>;
  paths?: PublicBlogPaths;
  locale?: string;
  theme?: Partial<GrowthTheme>;
  /** Drawn when the list is empty, in the grid's place. */
  empty?: ReactNode;
}

const Anchor: PublicLink = ({ href, className, children, rel, 'aria-current': current }) => (
  <a href={href} className={className} rel={rel} aria-current={current}>{children}</a>
);

export function PublicBlogList({ posts, categories, active, meta, basePath, Link = Anchor, words, paths = DEFAULT_PUBLIC_PATHS, locale = 'en-CA', theme, empty }: PublicBlogListProps) {
  const w = { ...DEFAULT_PUBLIC_WORDS, ...(words ?? {}) };
  const style: CSSProperties | undefined = theme ? themeStyle(theme) : undefined;

  return (
    <div className="gr-blog" style={style}>
      <BlogCategoryRow categories={categories} active={active} Link={Link} words={w} paths={paths} />
      {posts.length === 0 && empty ? empty : <BlogCardGrid posts={posts} Link={Link} words={w} paths={paths} locale={locale} />}
      <BlogPager meta={meta} basePath={basePath} Link={Link} words={w} />
    </div>
  );
}

interface Parts {
  Link: PublicLink;
  words: PublicBlogWords;
}

export function BlogCategoryRow({ categories, active, Link, words, paths }: Parts & { categories: PublicBlogCategory[]; active: string | null; paths: PublicBlogPaths }) {
  if (categories.length === 0) return null;
  const pill = (on: boolean) => `gr-blog-pill${on ? ' gr-blog-pill-on' : ''}`;

  return (
    <nav aria-label={words.categoriesLabel} className="gr-blog-categories">
      <Link href={paths.blog} aria-current={active === null ? 'page' : undefined} className={pill(active === null)}>
        {words.allPosts}
      </Link>
      {categories.map((c) => (
        <Link key={c.slug} href={categoryPath(paths, c.slug)} aria-current={active === c.slug ? 'page' : undefined} className={pill(active === c.slug)}>
          {c.name}
        </Link>
      ))}
    </nav>
  );
}

/** Three across from a laptop up, four only once the column itself is wide; 12 a page fills both evenly. */
export function BlogCardGrid({ posts, Link, words, paths, locale }: Parts & { posts: PublicBlogCard[]; paths: PublicBlogPaths; locale: string }) {
  return (
    <ul className="gr-blog-grid">
      {posts.map((post) => (
        <li key={post.slug} data-blog-slug={post.slug} className="gr-blog-card">
          <span className="gr-blog-read">{words.read}</span>
          {post.category ? <p className="gr-blog-card-category">{post.category.name}</p> : null}
          <h2 className="gr-blog-card-title">
            <Link href={postPath(paths, post.slug)}>{post.title}</Link>
          </h2>
          <p className="gr-blog-card-answer">{post.answer}</p>
          <p className="gr-blog-card-meta">
            {[post.author_name, blogDateLine(post, words.updated, locale)].filter(Boolean).join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function BlogPager({ meta, basePath, Link, words }: Parts & { meta: BlogListMeta; basePath: string }) {
  if (meta.last_page <= 1) return null;
  const page = meta.current_page;

  return (
    <nav aria-label={words.pagerLabel} className="gr-blog-pager">
      {page > 1 ? <Link href={blogPageHref(basePath, page - 1)} rel="prev" className="gr-blog-pill">{words.newer}</Link> : <span />}
      <p className="gr-blog-pager-count">{words.pageOf(page, meta.last_page)}</p>
      {page < meta.last_page ? <Link href={blogPageHref(basePath, page + 1)} rel="next" className="gr-blog-pill">{words.older}</Link> : <span />}
    </nav>
  );
}
