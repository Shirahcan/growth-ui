import { createContext, useContext, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { createChromeStore, type ChromeStore } from './shell/chromeStore';
import { tabsFor, type GrowthTab, type GrowthTabKey } from './shell/tabs';
import { themeStyle, type GrowthTheme, type GrowthVariant } from './theme';

/**
 * How the package reaches growth-service: ONLY through the host's own proxy (growth-client's
 * `GrowthRoutes::mountAdmin`). The host passes its authenticated request function, so the package
 * never learns about tokens, cookies or a product's auth.
 */
export type GrowthRequest = <T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<T>;

export interface GrowthProduct {
  key: string;
  label: string;
}

/**
 * Which product the screens act for.
 * - `product`: one product. A product host (Portify) always uses this; the estate host uses it once a
 *   product is picked, and every call carries `?as_product=` (F1 rule 3).
 * - `across`: the estate host reading every product at once. READ-ONLY (F1 rule 6): edits go one
 *   product at a time.
 */
export type GrowthScope = { kind: 'product'; product: string } | { kind: 'across' };

/** The host's own link, so moving between Growth screens stays inside the app (Portify: next/link). */
export type GrowthLink = ComponentType<{ href: string; className?: string; title?: string; children: ReactNode }>;

/** The product's own words: data from the host, never a product name in the package. */
export interface GrowthWords {
  /** The assistant that writes ideas ("Porter", "Mira"). */
  assistant: string;
  /** Audience key => what the product calls it ("applicants" => "Moving to Canada"). */
  audiences: Record<string, string>;
  /** The product's own name, as a consent receipt or a confirmation names it ("Portify"). */
  product: string;
}

const DEFAULT_WORDS: GrowthWords = { assistant: 'The assistant', audiences: {}, product: 'this product' };

function PlainLink({ href, className, title, children }: { href: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  );
}

interface GrowthContextValue {
  request: GrowthRequest;
  scope: GrowthScope;
  canEdit: boolean;
  /** Present only for the estate host. */
  picker: { products: GrowthProduct[]; choose: (scope: GrowthScope) => void } | null;
  tabs: GrowthTab[];
  hrefFor: (tab: GrowthTabKey) => string;
  onError: (error: unknown) => void;
  /** A success notice, through the host's own surface (Portify: a success toast). */
  notify: (message: string) => void;
  /** The theme as CSS variables, re-applied by modals and menus drawn outside the provider (portals). */
  vars: CSSProperties;
  /** A link inside the host's app. */
  Link: GrowthLink;
  /** A service link relative to the Growth area ("blog/<uuid>", "plan?tab=radar") as the host's href. */
  areaHref: (relative: string) => string;
  words: GrowthWords;
  variant: GrowthVariant;
  chrome: ChromeStore;
}

const GrowthContext = createContext<GrowthContextValue | null>(null);

export interface GrowthProviderProps {
  /** The host's authenticated call to its own proxy prefix (e.g. Portify's `/admin/growth-service`). */
  request: GrowthRequest;
  /** A product host names its one product. Mutually exclusive with `estate`. */
  product?: string;
  /** The estate host (shirah.co portal) passes the products the picker offers. */
  estate?: { products: GrowthProduct[]; initial?: GrowthScope };
  /** Where each tab lives in the host's routes. */
  hrefFor: (tab: GrowthTabKey) => string;
  /** Tabs the host has mounted so far; the rest are hidden, never shown empty. */
  enabledTabs?: readonly GrowthTabKey[];
  theme?: Partial<GrowthTheme>;
  variant?: GrowthVariant;
  /** The host's error surface (Portify: reportErrorToPorter). Never a generic toast. */
  onError: (error: unknown) => void;
  /** The host's success surface (Portify: `toast.success`). Unset = the notice is not shown. */
  onNotice?: (message: string) => void;
  /** The host's link component (Portify: next/link). Unset = a plain anchor. */
  Link?: GrowthLink;
  /** The product's words (assistant name, audience labels). */
  words?: Partial<GrowthWords>;
  children: ReactNode;
}

export function GrowthProvider(props: GrowthProviderProps) {
  const { request, product, estate, hrefFor, enabledTabs, theme, variant = 'glass', onError, onNotice, Link, words, children } = props;

  if ((product === undefined) === (estate === undefined)) {
    throw new Error('GrowthProvider: pass exactly one of `product` (a product host) or `estate` (the portal).');
  }

  const chromeRef = useRef<ChromeStore | null>(null);
  chromeRef.current ??= createChromeStore();

  const [estateScope, setEstateScope] = useState<GrowthScope>(estate?.initial ?? { kind: 'across' });
  // One string carries the scope, so the memo below depends on a value, not on an object rebuilt each render.
  const scopeKey = product !== undefined ? `p:${product}` : estateScope.kind === 'product' ? `p:${estateScope.product}` : 'across';

  const value = useMemo<GrowthContextValue>(() => {
    const scope: GrowthScope = scopeKey === 'across' ? { kind: 'across' } : { kind: 'product', product: scopeKey.slice(2) };
    const actsFor = estate !== undefined && scope.kind === 'product' ? scope.product : null;

    // The estate host acting for one product adds ?as_product=; a product host never does.
    const scoped: GrowthRequest = <T,>(method: Parameters<GrowthRequest>[0], path: string, body?: unknown) =>
      request<T>(method, actsFor !== null ? withAsProduct(path, actsFor) : path, body);

    return {
      request: scoped,
      scope,
      canEdit: scope.kind === 'product',
      picker: estate !== undefined ? { products: estate.products, choose: setEstateScope } : null,
      tabs: tabsFor(enabledTabs),
      hrefFor,
      onError,
      notify: (message: string) => onNotice?.(message),
      vars: themeStyle(theme),
      variant,
      Link: Link ?? PlainLink,
      areaHref: (relative: string) => areaHref(hrefFor, relative),
      words: { ...DEFAULT_WORDS, ...(words ?? {}), audiences: { ...DEFAULT_WORDS.audiences, ...(words?.audiences ?? {}) } },
      chrome: chromeRef.current as ChromeStore,
    };
  }, [request, estate, scopeKey, enabledTabs, hrefFor, onError, onNotice, theme, variant, Link, words]);

  return (
    <GrowthContext.Provider value={value}>
      <div className="gr-root" data-variant={variant} style={value.vars}>
        {children}
      </div>
    </GrowthContext.Provider>
  );
}

/**
 * The service links relative to the Growth area: the first segment is a tab ("blog", "plan"), the rest
 * follows the tab's own href. "plan?tab=radar" => hrefFor('plan') + "?tab=radar".
 */
export function areaHref(hrefFor: (tab: GrowthTabKey) => string, relative: string): string {
  const match = /^([a-z-]+)(.*)$/.exec(relative.replace(/^\/+/, ''));
  if (!match) return hrefFor('plan' as GrowthTabKey);

  return hrefFor(match[1] as GrowthTabKey) + (match[2] ?? '');
}

export function withAsProduct(path: string, product: string): string {
  return `${path}${path.includes('?') ? '&' : '?'}as_product=${encodeURIComponent(product)}`;
}

export function useGrowth(): GrowthContextValue {
  const ctx = useContext(GrowthContext);
  if (ctx === null) {
    throw new Error('useGrowth: wrap the screen in <GrowthProvider>.');
  }

  return ctx;
}
