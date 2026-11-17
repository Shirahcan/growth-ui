import { useEffect, useState } from 'react';
import { DEFAULT_PUBLIC_PATHS, postPath, type PublicBlogPaths, type PublicLink } from '../../public/types';

/** A post picked from what a signed-in reader read. */
export interface PickedPost {
  slug: string;
  title: string;
  answer?: string;
  category?: { slug: string; name: string } | null;
}

/**
 * The product's reading-history calls. Portify's reach growth-service's S8a-2 history through its own
 * `/v1/me/reading-history` (keyed by the signed-in user, never by a browser field). A failure throws; `onError`
 * hears it, and the panel keeps the state it had.
 */
export interface ReadingHistoryPorts {
  get: () => Promise<{ enabled: boolean }>;
  set: (enabled: boolean) => Promise<{ enabled: boolean }>;
  record: (slug: string) => Promise<unknown>;
  forYou: () => Promise<{ posts: PickedPost[] }>;
}

export interface RememberReadingWords {
  offLabel: string;
  offTitle: string;
  offBody: string;
  turnOn: string;
  onLabel: string;
  onTitle: string;
  onEmpty: string;
  onStatus: string;
  turnOff: string;
}

export const DEFAULT_REMEMBER_READING_WORDS: RememberReadingWords = {
  offLabel: 'Reading history',
  offTitle: 'Want posts picked for you?',
  offBody: 'Turn on “Remember what I read” and we keep which posts you open, only while it is on, to suggest others. Turning it off deletes it.',
  turnOn: 'Remember what I read',
  onLabel: 'Picked for you',
  onTitle: 'Picked for you',
  onEmpty: 'Read a few more posts and suggestions appear here.',
  onStatus: 'Reading history is on.',
  turnOff: 'Turn it off and delete it',
};

export interface RememberReadingProps {
  slug: string;
  /** Only a signed-in reader has a history to remember; a guest sees nothing here. */
  signedIn: boolean;
  history: ReadingHistoryPorts;
  Link?: PublicLink;
  paths?: PublicBlogPaths;
  words?: Partial<RememberReadingWords>;
  onError?: (error: unknown) => void;
}

const Anchor: PublicLink = ({ href, className, children }) => <a href={href} className={className}>{children}</a>;

/**
 * "Remember what I read", for SIGNED-IN readers only (blog on growth-service S8b-1).
 *
 * ⚠ OFF UNTIL THEY SAY YES (Quebec Law 25: profiling off by default). Nothing is sent about what they read until they
 * switch it on; switching it off deletes what was kept. While it is on, this post is recorded and "Picked for you"
 * lists posts chosen from what they read.
 */
export function RememberReading({ slug, signedIn, history, Link = Anchor, paths = DEFAULT_PUBLIC_PATHS, words, onError }: RememberReadingProps) {
  const w = { ...DEFAULT_REMEMBER_READING_WORDS, ...(words ?? {}) };
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<PickedPost[]>([]);
  const [busy, setBusy] = useState(false);

  // Reading the reader's history is syncing with something outside React (the product's API).
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    history.get()
      .then(async (h) => {
        if (!live) return;
        setEnabled(h.enabled);
        if (!h.enabled) return;
        await history.record(slug);
        const res = await history.forYou();
        if (live) setPicks(res.posts);
      })
      .catch((e: unknown) => onError?.(e));
    return () => { live = false; };
  }, [signedIn, slug, history, onError]);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const h = await history.set(next);
      setEnabled(h.enabled);
      if (h.enabled) {
        await history.record(slug);
        setPicks((await history.forYou()).posts);
      } else {
        setPicks([]);
      }
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn || enabled === null) return null;

  if (!enabled) {
    return (
      <aside className="gr-blog gr-remember gr-remember-off" aria-label={w.offLabel}>
        <p className="gr-remember-title">{w.offTitle}</p>
        <p className="gr-remember-body">{w.offBody}</p>
        <button type="button" disabled={busy} onClick={() => void toggle(true)} className="gr-remember-on">{w.turnOn}</button>
      </aside>
    );
  }

  return (
    <aside className="gr-blog gr-remember" aria-label={w.onLabel}>
      <p className="gr-remember-title gr-remember-picked">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9z" />
        </svg>
        {w.onTitle}
      </p>
      {picks.length > 0 ? (
        <ul className="gr-remember-picks">
          {picks.map((p) => (
            <li key={p.slug}>
              <Link href={postPath(paths, p.slug)} className="gr-remember-pick">{p.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="gr-remember-body">{w.onEmpty}</p>
      )}
      <p className="gr-remember-status">
        {w.onStatus}{' '}
        <button type="button" disabled={busy} onClick={() => void toggle(false)} className="gr-remember-off-button">{w.turnOff}</button>
      </p>
    </aside>
  );
}
