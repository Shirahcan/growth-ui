import { useSyncExternalStore } from 'react';

/**
 * A GUEST's reading history, kept ONLY in their own browser (blog on growth-service S8b-1; Portify's owner
 * 2026-11-12: "browser for guest"). Nothing here is sent anywhere, so no profile exists on a server. Signed-in readers
 * who switch on "Remember what I read" are kept on growth-service instead (RememberReading).
 *
 * One store per storage key, so a product keeps the key its readers' browsers already hold (Portify's is
 * `portify.blog.read`) and two products on one domain never mix.
 *
 * ⚠ STORAGE CAN BE BLOCKED (private mode, a strict browser): every access is wrapped and an unreadable store reads
 * as "nothing read", never an error. An external store for `useSyncExternalStore`, so a component reads it during
 * render, and two tabs stay in step through the `storage` event.
 */
export interface ReadEntry {
  slug: string;
  title: string;
  at: string;
}

export interface GuestReadingStore {
  subscribe: (listener: () => void) => () => void;
  /** Most recent first; the same array until the store changes. */
  snapshot: () => ReadEntry[];
  /** Record that a post was opened (most recent first, at most `max` kept). */
  record: (slug: string, title: string) => void;
}

const EMPTY: ReadEntry[] = [];
const stores = new Map<string, GuestReadingStore>();

function parse(raw: string): ReadEntry[] {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return EMPTY;
    return value.filter((e): e is ReadEntry => !!e && typeof e === 'object' && typeof (e as ReadEntry).slug === 'string');
  } catch {
    return EMPTY;
  }
}

export function guestReadingStore(key: string, max = 50): GuestReadingStore {
  const existing = stores.get(key);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cachedList: ReadEntry[] = EMPTY;

  const readRaw = (): string => {
    try {
      return window.localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };

  const snapshot = (): ReadEntry[] => {
    const raw = readRaw();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedList = parse(raw);
    }
    return cachedList;
  };

  const store: GuestReadingStore = {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    snapshot,
    record(slug, title) {
      if (!slug) return;
      const next = [{ slug, title, at: new Date().toISOString() }, ...snapshot().filter((e) => e.slug !== slug)].slice(0, max);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        return;
      }
      listeners.forEach((l) => l());
    },
  };
  stores.set(key, store);

  return store;
}

/** What this browser has read, most recent first. Empty on the server and when storage is blocked. */
export function useGuestReading(key: string): ReadEntry[] {
  const store = guestReadingStore(key);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY);
}
