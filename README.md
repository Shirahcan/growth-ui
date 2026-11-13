# @shirahcan/growth-ui

The Growth screens for every product and for the shirah.co super admin. The package takes its product
from context, hands its chrome to the host's top bar, and calls growth-service ONLY through the host's
own proxy (growth-client `GrowthRoutes::mountAdmin`). It never learns about tokens or a product's auth.

**Plan:** `portify/docs/plans/shared-console-and-growth-2026-11-12/` (G2c onwards).

## Install

```json
"@shirahcan/growth-ui": "github:Shirahcan/growth-ui#v0.1.0"
```

`import '@shirahcan/growth-ui/styles.css'` once in the host.

## Mount (a product host)

```tsx
<GrowthProvider
  product="portify"
  request={(method, path, body) => api.request({ method, url: `/admin/growth-service/${path}`, data: body }).then((r) => r.data)}
  hrefFor={(tab) => `/admin/growth/${tab === 'overview' ? '' : tab}`}
  enabledTabs={['overview', 'results']}   // tabs mounted so far; the rest are hidden, never empty
  onError={reportErrorToPorter}            // the host's error surface, never a generic toast
>
  <HostChromeBridge />   {/* reads useGrowthChromeState() and passes it to the host's own top bar */}
  {children}
</GrowthProvider>
```

The estate host passes `estate={{ products }}` instead of `product`, and renders `<ProductPicker />`.
"All products" reads across, **read only**; picking one product lets screens edit it, and every call then
carries `?as_product=` (F1 rule 3).

## Chrome (directive: hoist page chrome into the top bar)

A screen calls `useGrowthChrome({ title, subtitle, parent, activeTab, actions })` and renders no `<h1>`, no
"Back to" link and no action row of its own. The host reads `useGrowthChromeState()` and draws it.

## Theme

By values (`theme={{ accent: '#4361EE' }}` sets `--gr-*` CSS variables) and named variants
(`variant="glass" | "plain"`), never free className props.

## Rules every screen in this package follows

- Page roots `max-w-7xl mx-auto` with `overflow-x-clip`; modals bounded at `max-h-[90vh]` with a real inner
  scroller (`flex-1 min-h-0 overflow-y-auto`), checked at a 600px-tall viewport.
- Settings open in a right slide-in panel; consequential actions are guided wizards.
- Errors go to `onError` with the real reason.
