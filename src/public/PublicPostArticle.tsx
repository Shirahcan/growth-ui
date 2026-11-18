import type { CSSProperties, ReactNode } from 'react';
import { themeStyle, type GrowthTheme } from '../theme';
import { blogDate } from './dates';
import {
  DEFAULT_PUBLIC_PATHS,
  DEFAULT_PUBLIC_WORDS,
  categoryPath,
  type PublicBlogPaths,
  type PublicBlogPost,
  type PublicBlogWords,
  type PublicDesignDraws,
  type PublicLink,
} from './types';

/**
 * Which stretch of the article a column holds. A written post is one column (`post`); a designed post's header and
 * footer are two (`header`, `footer`) with the design drawn full width between them.
 */
export type PublicPostPart = 'post' | 'header' | 'footer';

/**
 * The host's column, as a render function (a host builds it from the post it is drawing, which a component defined
 * during render could not do cleanly). The site's page frame (its widths, its gutter, the post's chosen width)
 * belongs to the host, which owns that map (Portify's comes from the page builder, so a "Wide" post and a "Wide"
 * block match); the package owns the ORDER of everything inside, so no product can drift from it.
 */
export type PublicPostColumn = (part: PublicPostPart, children: ReactNode) => ReactNode;

export interface PublicPostArticleProps {
  post: PublicBlogPost;
  Link?: PublicLink;
  column?: PublicPostColumn;
  /** A designed post's design, already rendered by the host's page renderer. Absent for a written post. */
  design?: ReactNode;
  /** Inside the article before anything visible: structured data, a view beacon. */
  head?: ReactNode;
  /** The host's signup form, drawn inside the box when the call to action is `subscribe`. */
  signup?: ReactNode;
  /** After the call to action: the host's own extras (Portify's "ask about this guide"). */
  ask?: ReactNode;
  /** Last of all: keep reading, reading history. */
  after?: ReactNode;
  words?: Partial<PublicBlogWords>;
  paths?: PublicBlogPaths;
  locale?: string;
  theme?: Partial<GrowthTheme>;
}

const Anchor: PublicLink = ({ href, className, children, rel, 'aria-current': current }) => (
  <a href={href} className={className} rel={rel} aria-current={current}>{children}</a>
);

const plainColumn: PublicPostColumn = (part, children) => (
  <div className={`gr-blog-column gr-blog-column-${part}`}>{children}</div>
);

/**
 * One published post (blog on growth-service S8b-1). SERVER-SAFE: no hooks, no provider.
 *
 * Order, the same for every product: breadcrumb, category, title, byline, the answer, the written body; then the
 * design for a designed post; then Sources, the questions readers ask, the disclaimer, the call to action, the
 * host's extras. A written body is drawn as saved (it was sanitised then) and never re-cleaned here.
 *
 * A design that draws a piece itself (`post.design_draws`) is never drawn around twice: a full guide's own header
 * replaces the article's (one title, one h1), and its FAQ, disclaimer and calls to action replace the footer's.
 */
export function PublicPostArticle({ post, Link = Anchor, column = plainColumn, design, head, signup, ask, after, words, paths = DEFAULT_PUBLIC_PATHS, locale = 'en-CA', theme }: PublicPostArticleProps) {
  const w = { ...DEFAULT_PUBLIC_WORDS, ...(words ?? {}) };
  const style: CSSProperties | undefined = theme ? themeStyle(theme) : undefined;
  const draws = design ? post.design_draws ?? null : null;
  const header = <PostHeader post={post} Link={Link} words={w} paths={paths} locale={locale} />;
  const footer = <PostFooter post={post} Link={Link} words={w} draws={draws} signup={signup} ask={ask} after={after} />;

  return (
    <article className="gr-blog gr-blog-article" style={style}>
      {head}
      {design ? (
        <>
          {draws?.header ? null : column('header', header)}
          {design}
          {column('footer', footer)}
        </>
      ) : (
        column('post', <>{header}{footer}</>)
      )}
    </article>
  );
}

function PostHeader({ post, Link, words, paths, locale }: { post: PublicBlogPost; Link: PublicLink; words: PublicBlogWords; paths: PublicBlogPaths; locale: string }) {
  const published = blogDate(post.published_at, locale);
  const updated = blogDate(post.updated_at, locale);
  const byline = [
    post.author_name ? words.by(post.author_name) : null,
    published ? words.published(published) : null,
    updated && updated !== published ? words.updated(updated) : null,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <nav className="gr-blog-breadcrumb" aria-label={words.breadcrumbLabel}>
        <Link href={paths.home}>{words.home}</Link>
        <span className="gr-blog-crumb-sep">/</span>
        <Link href={paths.blog}>{words.blog}</Link>
        {post.category ? (
          <>
            <span className="gr-blog-crumb-sep">/</span>
            <Link href={categoryPath(paths, post.category.slug)}>{post.category.name}</Link>
          </>
        ) : null}
      </nav>

      {post.category ? (
        <p className="gr-blog-article-category">
          <Link href={categoryPath(paths, post.category.slug)}>{post.category.name}</Link>
        </p>
      ) : null}
      <h1 className="gr-blog-title">{post.title}</h1>
      {byline ? <p className="gr-blog-byline">{byline}</p> : null}
      <p className="gr-blog-answer">{post.answer}</p>

      {post.body_format === 'html' && post.body_html ? (
        <div className="gr-prose" dangerouslySetInnerHTML={{ __html: post.body_html }} />
      ) : null}
    </>
  );
}

function PostFooter({ post, Link, words, draws, signup, ask, after }: { post: PublicBlogPost; Link: PublicLink; words: PublicBlogWords; draws: PublicDesignDraws | null; signup?: ReactNode; ask?: ReactNode; after?: ReactNode }) {
  const sources = (post.sources ?? []).filter((s) => s.url && s.label);
  // The design's own FAQ, disclaimer and calls to action are already on the page; the questions still feed the
  // host's FAQ markup from `post.reader_questions`.
  const questions = draws?.questions ? [] : post.reader_questions ?? [];
  const cta = draws?.cta ? null : post.cta ?? null;

  return (
    <>
      {sources.length > 0 ? (
        <section className="gr-blog-sources" aria-labelledby="gr-blog-sources">
          <h2 id="gr-blog-sources" className="gr-blog-h-small">{words.sources}</h2>
          <ul>
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section className="gr-blog-questions" aria-labelledby="gr-blog-questions">
          <h2 id="gr-blog-questions" className="gr-blog-h">{words.questions}</h2>
          <dl>
            {questions.map((item) => (
              <div key={item.q}>
                <dt>{item.q}</dt>
                <dd>{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {draws?.disclaimer ? null : <p className="gr-blog-disclaimer">{words.disclaimer}</p>}

      {cta?.kind === 'subscribe' && cta.label && signup ? (
        <div className="gr-blog-signup" data-page-signup>
          <p className="gr-blog-signup-label">{cta.label}</p>
          <div>{signup}</div>
        </div>
      ) : null}
      {cta && cta.kind !== 'subscribe' && cta.url && cta.label ? (
        <div className="gr-blog-cta">
          <Link href={cta.url} className="gr-blog-cta-button">{cta.label}</Link>
        </div>
      ) : null}

      {ask}
      {after}
    </>
  );
}
