import { useEffect } from 'react';
import { DEFAULT_PUBLIC_PATHS, postPath, type PublicBlogCard, type PublicBlogPaths, type PublicLink } from '../../public/types';
import { guestReadingStore, useGuestReading } from './guestStore';

export interface KeepReadingWords {
  heading: string;
  allRead: string;
  seeAll: string;
  readThe: string;
  read: string;
}

export const DEFAULT_KEEP_READING_WORDS: KeepReadingWords = {
  heading: 'Keep reading',
  allRead: 'You have read all the related posts.',
  seeAll: 'See every post',
  readThe: 'Read the post',
  read: 'Read',
};

export interface KeepReadingProps {
  slug: string;
  title: string;
  /** Up to three related posts the SERVER picked, so they are in the first HTML for crawlers and readers without JavaScript. */
  related: PublicBlogCard[];
  /** The browser storage key of the product's guest history (Portify: `portify.blog.read`). */
  storageKey: string;
  Link?: PublicLink;
  paths?: PublicBlogPaths;
  words?: Partial<KeepReadingWords>;
}

const Anchor: PublicLink = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

/**
 * "Keep reading" under a post (blog on growth-service S8b-1). The server picks the related posts; in the browser, a
 * GUEST's own history (kept only on their device) moves the ones they already read to the end and marks them, and
 * this view is recorded. The WHOLE card is the link (the title's link stretches over it); its excerpt is the post's
 * short answer, the same one the list shows.
 */
export function KeepReading({ slug, title, related, storageKey, Link = Anchor, paths = DEFAULT_PUBLIC_PATHS, words }: KeepReadingProps) {
  const w = { ...DEFAULT_KEEP_READING_WORDS, ...(words ?? {}) };
  const history = useGuestReading(storageKey);

  // Writing to the browser's store is syncing with something outside React.
  useEffect(() => {
    guestReadingStore(storageKey).record(slug, title);
  }, [storageKey, slug, title]);

  if (related.length === 0) return null;

  const read = new Set(history.map((e) => e.slug));
  const ordered = [...related].sort((a, b) => Number(read.has(a.slug)) - Number(read.has(b.slug)));
  const allRead = ordered.every((p) => read.has(p.slug));

  return (
    <section className="gr-blog gr-keep" aria-labelledby="gr-keep-reading">
      <h2 id="gr-keep-reading" className="gr-blog-h">{w.heading}</h2>
      {allRead ? (
        <p className="gr-keep-all">
          {w.allRead}{' '}
          <Link href={paths.blog} className="gr-keep-all-link">{w.seeAll}</Link>
        </p>
      ) : null}
      <ul className="gr-keep-grid">
        {ordered.map((p) => (
          <li key={p.slug} className="gr-keep-card">
            {read.has(p.slug) ? <span className="gr-keep-read">{w.read}</span> : null}
            {p.category ? <p className="gr-keep-category">{p.category.name}</p> : null}
            <Link href={postPath(paths, p.slug)} className="gr-keep-title">{p.title}</Link>
            {p.answer ? <p className="gr-keep-answer">{p.answer}</p> : null}
            {/* The title link already names the card for a screen reader; this is the visual cue only. */}
            <span aria-hidden="true" className="gr-keep-cue">
              {w.readThe}
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
