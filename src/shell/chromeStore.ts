import type { GrowthTabKey } from './tabs';

/** One action in the host's top bar (2+ collapse into the host's actions menu). */
export interface GrowthAction {
  key: string;
  label: string;
  onSelect: () => void;
  /** Destructive actions go last, after a separator, in the host's menu. */
  destructive?: boolean;
  disabled?: boolean;
}

/** What the screen on show wants in the host's top bar. Data, never markup: the host draws it. */
export interface GrowthChrome {
  title: string;
  subtitle?: string;
  /** A "Back to X" crumb is the title's parent, never a link in the body. */
  parent?: { label: string; tab: GrowthTabKey };
  activeTab?: GrowthTabKey;
  actions: GrowthAction[];
}

export const EMPTY_CHROME: GrowthChrome = { title: '', actions: [] };

/**
 * A tiny external store (useSyncExternalStore-compatible): screens write their chrome, the host's
 * bridge reads it. One store per provider, so two mounted providers never share a title.
 */
export function createChromeStore() {
  let state: GrowthChrome = EMPTY_CHROME;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(next: GrowthChrome) {
      state = next;
      listeners.forEach((l) => l());
    },
    clear(owner: GrowthChrome) {
      // Only the screen that set the chrome may clear it (a newer screen may already own it).
      if (state === owner) {
        state = EMPTY_CHROME;
        listeners.forEach((l) => l());
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ChromeStore = ReturnType<typeof createChromeStore>;
