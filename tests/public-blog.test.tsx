import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PublicBlogList,
  PublicPostArticle,
  blogDateLine,
  blogPageHref,
  blogPageParam,
  type PublicBlogCard,
  type PublicBlogPost,
  type PublicLink,
  type PublicPostColumn,
} from '../src/public';

/*
 * The public blog renders on a SERVER (blog on growth-service S8b-1), so these tests render to static markup, the
 * way a product's server component does: no DOM, no effects, no provider.
 */
const card: PublicBlogCard = {
  slug: 'crs-explained', title: 'CRS explained', answer: 'Your CRS score ranks you in the pool.',
  category: { slug: 'express-entry', name: 'Express Entry' }, author_name: 'Lara Taj',
  published_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-12T09:00:00Z',
};
const post: PublicBlogPost = {
  ...card, body_format: 'html', body_html: '<h2>How it is scored</h2><p>Age, <strong>language</strong>, education.</p>',
  reader_questions: [{ q: 'Can my score change?', a: 'Yes, when your profile does.' }],
  sources: [{ label: 'IRCC: CRS criteria', url: 'https://www.canada.ca/crs' }, { label: '', url: 'https://nolabel.example' }],
  cta: { kind: 'book', label: 'Book a consultation', url: '/book' },
};

const html = (node: ReactElement) => renderToStaticMarkup(node);
const MarkedLink: PublicLink = ({ href, children, className }) => <a data-host-link href={href} className={className}>{children}</a>;

describe('the public blog list', () => {
  it('draws the category row, a card per post with its read hook, and pages from the bare address', () => {
    const out = html(
      <PublicBlogList posts={[card]} categories={[{ slug: 'express-entry', name: 'Express Entry' }]} active="express-entry"
        meta={{ current_page: 2, last_page: 3 }} basePath="/blog/category/express-entry" Link={MarkedLink} />,
    );

    expect(out).toContain('aria-label="Blog categories"');
    expect(out).toMatch(/<a data-host-link="true" href="\/blog\/category\/express-entry" class="gr-blog-pill gr-blog-pill-on">Express Entry<\/a>/);
    expect(out).toContain('data-blog-slug="crs-explained"');
    expect(out).toContain('href="/blog/crs-explained"');
    expect(out).toContain('Lara Taj · Updated November 12, 2026');
    expect(out).toContain('href="/blog/category/express-entry"');
    expect(out).toContain('href="/blog/category/express-entry?page=3"');
    expect(out).toContain('Page 2 of 3');
  });

  it('uses the host words and paths, and leaves the pager off a single page', () => {
    const out = html(
      <PublicBlogList posts={[card]} categories={[]} active={null} meta={{ current_page: 1, last_page: 1 }} basePath="/guides"
        paths={{ home: '/', blog: '/guides' }} words={{ allPosts: 'All guides', read: 'Seen' }} />,
    );

    expect(out).toContain('href="/guides/crs-explained"');
    expect(out).toContain('Seen');
    expect(out).not.toContain('Blog categories');
    expect(out).not.toContain('gr-blog-pager');
  });

  it('draws the host empty state in place of an empty grid', () => {
    const out = html(<PublicBlogList posts={[]} categories={[]} active={null} meta={{ current_page: 1, last_page: 1 }} basePath="/blog" empty={<p>No guides yet.</p>} />);
    expect(out).toContain('No guides yet.');
    expect(out).not.toContain('gr-blog-grid');
  });
});

describe('a public post', () => {
  it('draws a written post in one column, in order, as saved', () => {
    const column: PublicPostColumn = (part, children) => <section data-part={part}>{children}</section>;
    const out = html(<PublicPostArticle post={post} column={column} head={<script type="application/ld+json">{'{}'}</script>} words={{ disclaimer: 'Not legal advice.' }} ask={<aside>Ask me</aside>} after={<aside>Keep reading</aside>} />);

    expect(out.match(/data-part=/g)).toHaveLength(1);
    expect(out).toContain('data-part="post"');
    expect(out).toContain('<h1 class="gr-blog-title">CRS explained</h1>');
    expect(out).toContain('By Lara Taj · Published November 1, 2026 · Updated November 12, 2026');
    expect(out).toContain('<div class="gr-prose"><h2>How it is scored</h2><p>Age, <strong>language</strong>, education.</p></div>');

    const order = ['application/ld+json', 'Home', 'CRS explained', 'Your CRS score', 'How it is scored', 'Sources', 'IRCC: CRS criteria',
      'Questions readers ask', 'Can my score change?', 'Not legal advice.', 'Book a consultation', 'Ask me', 'Keep reading'];
    const at = order.map((text) => out.indexOf(text));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);

    expect(out).not.toContain('nolabel.example');
    expect(out).toContain('href="/book"');
  });

  it('draws a designed post as header, the host design, footer; the body HTML is not drawn', () => {
    const column: PublicPostColumn = (part, children) => <section data-part={part}>{children}</section>;
    const designed: PublicBlogPost = { ...post, body_format: 'pml' };
    const out = html(<PublicPostArticle post={designed} column={column} design={<div data-design>Designed sections</div>} />);

    const header = out.indexOf('data-part="header"');
    const design = out.indexOf('data-design');
    const footer = out.indexOf('data-part="footer"');
    expect(header).toBeGreaterThanOrEqual(0);
    expect(design).toBeGreaterThan(header);
    expect(footer).toBeGreaterThan(design);
    expect(out).not.toContain('How it is scored');
    expect(out).toContain('Questions readers ask');
  });

  it('never draws a piece the design draws itself: one title and h1, one FAQ, one disclaimer, one call to action', () => {
    const column: PublicPostColumn = (part, children) => <section data-part={part}>{children}</section>;
    const guide: PublicBlogPost = { ...post, body_format: 'pml', design_draws: { header: true, questions: true, disclaimer: true, cta: true } };
    const out = html(<PublicPostArticle post={guide} column={column} design={<div data-design><h1>CRS explained</h1></div>} />);

    expect(out).not.toContain('data-part="header"');
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).not.toContain('Questions readers ask');
    expect(out).not.toContain('General information, not professional advice.');
    expect(out).not.toContain('href="/book"');
    expect(out).toContain('IRCC: CRS criteria');
    expect(out).toContain('data-part="footer"');

    // A design with its own Sources block: the footer's list is not drawn a second time.
    const withSources = html(<PublicPostArticle post={{ ...guide, design_draws: { ...guide.design_draws, sources: true } }} column={column} design={<div data-design />} />);
    expect(withSources).not.toContain('IRCC: CRS criteria');

    // A design with none of its own (a story) keeps the article's: the footer is all it has.
    const story = html(<PublicPostArticle post={{ ...guide, design_draws: { header: false, questions: false, disclaimer: false, cta: false } }} column={column} design={<div data-design />} />);
    expect(story).toContain('data-part="header"');
    expect(story).toContain('Questions readers ask');
    expect(story).toContain('General information, not professional advice.');
    expect(story).toContain('href="/book"');

    // A written post never reads it, even if a payload carries it.
    expect(html(<PublicPostArticle post={guide} />)).toContain('Questions readers ask');
  });

  it('draws the host signup form only for a subscribe call to action', () => {
    const subscribe: PublicBlogPost = { ...post, cta: { kind: 'subscribe', label: 'Get new guides by email' } };
    expect(html(<PublicPostArticle post={subscribe} signup={<form data-signup />} />)).toContain('Get new guides by email');
    expect(html(<PublicPostArticle post={subscribe} signup={<form data-signup />} />)).toContain('data-signup');
    expect(html(<PublicPostArticle post={subscribe} />)).not.toContain('Get new guides by email');
    expect(html(<PublicPostArticle post={{ ...post, cta: null }} />)).not.toContain('gr-blog-cta');
  });

  it('leaves out what a post does not have', () => {
    const bare: PublicBlogPost = { ...post, category: null, author_name: null, reader_questions: [], sources: [], cta: null, updated_at: null, published_at: null };
    const out = html(<PublicPostArticle post={bare} />);
    expect(out).not.toContain('gr-blog-article-category');
    expect(out).not.toContain('gr-blog-byline');
    expect(out).not.toContain('Questions readers ask');
    expect(out).not.toContain('Sources');
    expect(out).toContain('General information, not professional advice.');
  });
});

describe('the date and paging helpers', () => {
  it('says Updated only when readers saw a change on a later day', () => {
    expect(blogDateLine({ published_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T23:00:00Z' })).toBe('November 1, 2026');
    expect(blogDateLine({ published_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-02T00:30:00Z' })).toBe('Updated November 2, 2026');
    expect(blogDateLine({ published_at: null, updated_at: null })).toBe('');
    expect(blogDateLine({ published_at: 'not a date', updated_at: null })).toBe('');
  });

  it('reads ?page= safely and gives page 1 the bare address', () => {
    expect(blogPageParam(undefined)).toBe(1);
    expect(blogPageParam('3')).toBe(3);
    expect(blogPageParam(['4', '5'])).toBe(4);
    expect(blogPageParam('1.5')).toBe(1);
    expect(blogPageParam('-2')).toBe(1);
    expect(blogPageHref('/blog', 1)).toBe('/blog');
    expect(blogPageHref('/blog', 2)).toBe('/blog?page=2');
  });
});
