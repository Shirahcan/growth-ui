import type { CSSProperties } from 'react';

/**
 * Theme by VALUES and named variants, never free className props (memory: "sharing the parts is not
 * sharing a screen": 25 free `*ClassName` props were 25 licensed divergences). A product hands its
 * colours here (later from its brand kit, G2e); the screens read only these CSS variables.
 */
export interface GrowthTheme {
  accent: string;
  accentInk: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  ink: string;
  inkMuted: string;
  danger: string;
  radius: string;
  radiusPill: string;
  font: string;
}

/** Named looks a product picks instead of restyling parts. `glass` is Portify's glassmorphic system. */
export type GrowthVariant = 'glass' | 'plain';

const TOKEN_VARS: Record<keyof GrowthTheme, string> = {
  accent: '--gr-accent',
  accentInk: '--gr-accent-ink',
  surface: '--gr-surface',
  surfaceMuted: '--gr-surface-muted',
  border: '--gr-border',
  ink: '--gr-ink',
  inkMuted: '--gr-ink-muted',
  danger: '--gr-danger',
  radius: '--gr-radius',
  radiusPill: '--gr-radius-pill',
  font: '--gr-font',
};

export const DEFAULT_THEME: GrowthTheme = {
  accent: '#4361EE',
  accentInk: '#ffffff',
  surface: 'rgba(255, 255, 255, 0.7)',
  surfaceMuted: '#f8fafc',
  border: '#e2e8f0',
  ink: '#0f172a',
  inkMuted: '#64748b',
  danger: '#dc2626',
  radius: '2rem',
  radiusPill: '9999px',
  font: 'inherit',
};

/** Tokens as a style object of CSS variables, set on the provider's one wrapper. Unknown keys are ignored. */
export function themeStyle(theme: Partial<GrowthTheme> | undefined): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...DEFAULT_THEME, ...(theme ?? {}) })) {
    const cssVar = TOKEN_VARS[key as keyof GrowthTheme];
    if (cssVar && typeof value === 'string' && value !== '') style[cssVar] = value;
  }

  return style as CSSProperties;
}
