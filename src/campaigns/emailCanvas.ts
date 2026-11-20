import type { CSSProperties } from 'react';

/**
 * The colours and font a sent email wears, as growth-service hands them to an email designer (`canvas` on a newsletter's
 * or a newsletter template's document: pml-kit's EmailStyle, the brand kit over its defaults).
 */
export interface EmailCanvas {
  colors: Record<string, string>;
  font: string;
}

/**
 * The email designer's canvas frame (owner 2026-11-20: the newsletter canvas's buttons had no fill and were not pills):
 * the shared renderer's site variables set from the sent email's own palette, so the canvas and the inbox agree. Buttons
 * are pills, as the sent email's are (pml-kit 0.34.4). Undefined until the document has loaded.
 */
export function emailCanvasFrame(canvas: EmailCanvas | null | undefined): { style: CSSProperties } | undefined {
  if (!canvas?.colors) return undefined;
  const c = canvas.colors;

  return {
    style: {
      '--site-accent': c.accent,
      '--site-accent-text': c.on_accent,
      '--site-text': c.text,
      '--site-muted': c.muted,
      '--site-surface': c.surface,
      '--site-bg': c.card,
      '--site-strong': c.strong ?? c.text,
      '--site-on-strong': c.on_strong ?? c.card,
      '--site-radius': '8px',
      '--site-button-radius': '9999px',
      // As wide as its words, as the sent email draws it (pml-ui 0.7.87 reads this; a site page leaves it unset).
      '--site-button-width': 'fit-content',
      '--site-font-body': canvas.font,
      '--site-font-heading': canvas.font,
      fontFamily: canvas.font,
      color: c.text,
    } as CSSProperties,
  };
}
