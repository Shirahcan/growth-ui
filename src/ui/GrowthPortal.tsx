import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGrowth } from '../GrowthProvider';

/**
 * Draws a modal or a menu on `document.body`, carrying the provider's theme values with it.
 *
 * source: ai-ui `ConsolePortal`. ⚠ WHY A PORTAL: a product's page root commonly makes a stacking
 * context, and a fixed scrim inside it can never rise above the product's own top bar. ⚠ AND IT
 * RE-APPLIES THE THEME, because the `--gr-*` values live on the provider's element and a portal leaves
 * that subtree.
 */
export function GrowthPortal({ children }: { children: ReactNode }) {
  const { vars, variant } = useGrowth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="gr-root" data-variant={variant} style={vars} data-growth-portal="">
      {children}
    </div>,
    document.body,
  );
}
