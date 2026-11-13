import { useEffect, useSyncExternalStore } from 'react';
import { useGrowth } from '../GrowthProvider';
import type { GrowthChrome } from './chromeStore';

/**
 * A SCREEN hands its chrome to the host's top bar (directive: hoist page chrome, never leave it in
 * the body). The screen renders no `<h1>`, no "Back to" link and no action row of its own.
 *
 * Pass a stable object (memoise it) or the store updates on every render.
 */
export function useGrowthChrome(chrome: GrowthChrome): void {
  const { chrome: store } = useGrowth();

  useEffect(() => {
    store.set(chrome);

    return () => store.clear(chrome);
  }, [store, chrome]);
}

/**
 * The HOST's side: its layout reads what the screen on show wants and passes it to its own top bar
 * (Portify: `useShellPageTitle`, `ShellTabs`, `ShellActionsMenu`). Mounted once, inside the provider.
 */
export function useGrowthChromeState(): GrowthChrome {
  const { chrome } = useGrowth();

  return useSyncExternalStore(chrome.subscribe, chrome.get, chrome.get);
}
