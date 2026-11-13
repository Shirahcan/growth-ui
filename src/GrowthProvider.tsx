import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
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

interface GrowthContextValue {
  request: GrowthRequest;
  scope: GrowthScope;
  canEdit: boolean;
  /** Present only for the estate host. */
  picker: { products: GrowthProduct[]; choose: (scope: GrowthScope) => void } | null;
  tabs: GrowthTab[];
  hrefFor: (tab: GrowthTabKey) => string;
  onError: (error: unknown) => void;
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
  children: ReactNode;
}

export function GrowthProvider(props: GrowthProviderProps) {
  const { request, product, estate, hrefFor, enabledTabs, theme, variant = 'glass', onError, children } = props;

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
      chrome: chromeRef.current as ChromeStore,
    };
  }, [request, estate, scopeKey, enabledTabs, hrefFor, onError]);

  return (
    <GrowthContext.Provider value={value}>
      <div className="gr-root" data-variant={variant} style={themeStyle(theme)}>
        {children}
      </div>
    </GrowthContext.Provider>
  );
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
