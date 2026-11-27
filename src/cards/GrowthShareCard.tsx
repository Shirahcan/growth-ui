import React from 'react';
import type { ComponentType, CSSProperties } from 'react';

/**
 * A growth document's social card as growth-service hands it to the product's share-card page (G7e3): the guarded PML
 * card nodes, the alt text, and the brand kit's look as theme tokens (only what the kit sets).
 */
export interface GrowthCardPayload {
  card: { nodes: unknown[]; alt: string };
  theme: Partial<Record<'accent' | 'on-accent' | 'surface' | 'text' | 'strong' | 'on-strong' | 'font-heading' | 'font-body' | 'logo', string>>;
}

/** The product's own PML card renderer (Portify: `PortifyPmlCard`), which knows its host elements and pictures. */
export type GrowthCardRenderer = ComponentType<{ nodes: never[]; site: object; className?: string; style?: CSSProperties }>;

const HEX = /^#[0-9a-f]{6}$/i;

/** Neutral defaults for anything the brand kit leaves unset, so a half-filled kit still draws a readable card. */
const FALLBACK = { bg: '#ffffff', text: '#0f172a', accent: '#334155', onAccent: '#ffffff', muted: '#64748b', surface: '#f1f5f9' };

/** Black or white, whichever reads on that colour (the WCAG luminance split PML's own themes use). */
export function readableOn(hex: string): string {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  return luminance > 0.179 ? '#0f172a' : '#ffffff';
}

const colour = (value: string | undefined): string | null => (value && HEX.test(value) ? value : null);

/**
 * The brand kit as PML's `--site-*` variables, so a card is drawn in the product's own colours and fonts. A colour the
 * kit does not set falls back to a neutral one (never an invented brand colour); a text colour the kit does not set is
 * derived from its background so the words stay readable.
 */
export function growthCardStyle(theme: GrowthCardPayload['theme']): CSSProperties {
  const accent = colour(theme.accent);
  const surface = colour(theme.surface);
  const text = colour(theme.text);
  const strong = colour(theme.strong);
  const bg = surface ?? FALLBACK.bg;

  return {
    '--site-bg': bg,
    '--site-text': text ?? (surface ? readableOn(surface) : FALLBACK.text),
    '--site-accent': accent ?? FALLBACK.accent,
    '--site-accent-text': colour(theme['on-accent']) ?? (accent ? readableOn(accent) : FALLBACK.onAccent),
    '--site-muted': FALLBACK.muted,
    '--site-surface': surface ?? FALLBACK.surface,
    ...(strong ? { '--site-strong': strong, '--site-on-strong': colour(theme['on-strong']) ?? readableOn(strong) } : {}),
    ...(theme['font-heading'] ? { '--site-font-heading': theme['font-heading'] } : {}),
    ...(theme['font-body'] ? { '--site-font-body': theme['font-body'] } : {}),
    '--site-radius': '0.75rem',
    '--site-button-radius': '9999px',
    '--site-type-scale': '1',
    fontFamily: 'var(--site-font-body, ui-sans-serif, system-ui, sans-serif)',
    background: 'var(--site-bg)',
    color: 'var(--site-text)',
  } as CSSProperties;
}

/**
 * The card at exactly 1200x630, for ai-service's browser to photograph. The product passes its own PML card renderer,
 * so its pictures and host elements resolve as they do on its pages; the look is the brand kit's, the same for every
 * product with the same kit.
 */
export function GrowthShareCard({ payload, Card }: { payload: GrowthCardPayload; Card: GrowthCardRenderer }): React.JSX.Element {
  return (
    <main aria-label={payload.card.alt} style={{ width: 1200, height: 630, overflow: 'hidden' }}>
      <Card nodes={payload.card.nodes as never[]} site={{ theme: payload.theme }} className="antialiased" style={growthCardStyle(payload.theme)} />
    </main>
  );
}
