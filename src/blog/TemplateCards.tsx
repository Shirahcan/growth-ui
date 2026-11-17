import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { PostTemplate, TemplatePreview } from './useCreatePostFlow';

/**
 * The template picker as preview cards (owner 2026-11-17: "The template selection step should use preview cards (similar
 * to what MS Word does) so the user can see what to expect before proceeding"). Each card is a page: the template drawn
 * as a new post from it would open (the host draws the service's tree), scaled to the card, with its name under it.
 *
 * A radio group: the picked card is the one tab stop, the arrow keys move the choice, Space or Enter picks. The page
 * inside a card is a picture only (inert), so nothing in it can take focus or a click. When the host draws no preview,
 * or the template cannot be drawn, the card shows the template's shape in grey bars from its parts.
 */
export interface TemplateCardsProps {
  templates: PostTemplate[];
  previews: Record<string, TemplatePreview | null>;
  value: string | null;
  onChange: (key: string) => void;
  /** Draws a template's tree as the product draws a post (Portify: its PML renderer). */
  renderPreview?: (tree: unknown[]) => ReactNode;
}

/** The width a preview is drawn at before it is scaled down to the card (a post's reading width plus its margins). */
const PAGE_WIDTH = 960;

export function TemplateCards({ templates, previews, value, onChange, renderPreview }: TemplateCardsProps) {
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const group = useId();
  const at = Math.max(0, templates.findIndex((t) => t.key === value));

  const move = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = (index + step + templates.length) % templates.length;
      const picked = templates[next];
      if (picked) onChange(picked.key);
      cards.current[next]?.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const picked = templates[index];
      if (picked) onChange(picked.key);
    }
  };

  return (
    <div role="radiogroup" aria-label="Template" className="gr-template-cards">
      {templates.map((t, index) => {
        const on = t.key === value;
        const preview = previews[t.key];

        return (
          <div
            key={t.key}
            ref={(el) => {
              cards.current[index] = el;
            }}
            role="radio"
            aria-checked={on}
            aria-label={t.name}
            aria-describedby={`${group}-${index}`}
            tabIndex={index === at ? 0 : -1}
            className={`gr-template-card${on ? ' gr-template-card-on' : ''}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => move(e, index)}
          >
            <ScaledPage>
              {preview === undefined ? (
                <span className="gr-template-loading">Drawing the preview…</span>
              ) : preview && preview.tree && renderPreview ? (
                renderPreview(preview.tree)
              ) : (
                <Shape nodes={preview?.nodes ?? []} />
              )}
            </ScaledPage>
            <span className="gr-template-name">
              <span>{t.name}</span>
              {on ? (
                <span className="gr-template-check" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>
                </span>
              ) : null}
            </span>
            <span className="gr-template-meta" id={`${group}-${index}`}>
              {t.parts} {t.parts === 1 ? 'part' : 'parts'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A page drawn at PAGE_WIDTH and scaled to the card's width; a picture, never something to press. */
function ScaledPage({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setScale(entry.contentRect.width / PAGE_WIDTH);
    });
    watch.observe(el);

    return () => watch.disconnect();
  }, []);

  return (
    <div ref={box} className="gr-template-page" aria-hidden="true">
      <div className="gr-template-page-inner" style={{ width: PAGE_WIDTH, transform: `scale(${scale})` }} {...{ inert: true }}>
        {children}
      </div>
    </div>
  );
}

type Bar = 'title' | 'image' | 'heading' | 'lines' | 'callout' | 'table' | 'cta' | 'list';

/** What a top-level node looks like at a glance. */
function barOf(node: Record<string, unknown>): Bar | null {
  if ('comment' in node) return null;
  const name = String(node.primitive ?? node.component ?? '');
  const part = String(node.part ?? '');
  if (part === 'header' || name === 'post_header') return 'title';
  if (name === 'post_cover' || name === 'image') return 'image';
  if (name === 'post_cta' || name === 'post_story' || name === 'post_related') return 'cta';
  if (name === 'faq' || name === 'toc' || name === 'list') return 'list';
  if (name === 'table' || part === 'data') return 'table';
  if (name === 'callout') return 'callout';
  if (name === 'heading') return 'heading';

  return 'lines';
}

/** The template's shape in grey bars, top to bottom, for a card with no drawn preview. */
function Shape({ nodes }: { nodes: unknown[] }) {
  const bars = nodes
    .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
    .map(barOf)
    .filter((b): b is Bar => b !== null)
    .slice(0, 14);

  return (
    <div className="gr-shape">
      {bars.map((bar, i) => (
        <div key={i} className={`gr-shape-${bar}`}>
          {bar === 'lines' || bar === 'list' ? (
            <>
              <i />
              <i />
              <i />
            </>
          ) : null}
        </div>
      ))}
    </div>
  );
}
