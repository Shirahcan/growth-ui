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

/** The width a reader's page is framed at (a desktop window), and how much of it a card shows. */
const FRAME_WIDTH = 1440;
const FRAME_HEIGHT = 2200;

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
            <ScaledPage width={preview?.frame ? FRAME_WIDTH : PAGE_WIDTH}>
              {preview?.frame ? (
                <ReaderPage src={preview.frame} title={`${t.name} preview`} />
              ) : preview === undefined ? (
                <span className="gr-template-loading">Drawing the preview…</span>
              ) : preview && preview.tree && renderPreview ? (
                renderPreview(preview.tree)
              ) : preview && preview.html ? (
                // An email template is html already: drawn in a frame with NO permissions (no scripts, no same origin),
                // so a starter's markup can never run or reach the page; a picture, like every card.
                <iframe title={`${t.name} preview`} sandbox="" srcDoc={inTheLightScheme(withPicturePlaceholders(preview.html))} tabIndex={-1} className="gr-template-frame" style={{ width: PAGE_WIDTH, height: 1400, border: 0, colorScheme: 'light' }} />
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

/**
 * The product's reader page with a sample post, as a still picture (growth templates D3): fetched once, its scripts and
 * `<noscript>` blocks taken out and a `<base>` added so its styles, fonts and pictures still load, then drawn in a frame
 * that may not run anything. Framing the page itself ran the whole app in every card, and a frame forbidden to run it
 * logged a blocked script for each of its scripts (45 on one card, Loop 1 2026-11-20).
 */
function ReaderPage({ src, title }: { src: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(src, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then((res) => (res.ok ? res.text() : null))
      .then((page) => {
        if (live && page) setHtml(stillPage(page, src));
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [src]);

  if (html === null) return <span className="gr-template-loading">Drawing the preview…</span>;

  return <iframe title={title} srcDoc={html} sandbox="allow-same-origin" tabIndex={-1} className="gr-template-frame" style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, border: 0, colorScheme: 'light' }} />;
}

/** A page with nothing that runs, and its addresses read from where it came from. */
export function stillPage(html: string, src: string): string {
  const base = typeof window === 'undefined' ? src : new URL(src, window.location.href).href;
  const still = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
    .replace(/<link\b[^>]*\brel=["']?(?:modulepreload|preload)["']?[^>]*\bas=["']?script["']?[^>]*>/gi, '');
  const tag = `<base href="${base.replace(/"/g, '&quot;')}">`;

  return /<head[^>]*>/i.test(still) ? still.replace(/<head[^>]*>/i, (head) => head + tag) : tag + still;
}

/** A grey "picture goes here" box, for a template's picture the author has not chosen yet. */
const PICTURE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><rect width="600" height="240" fill="#e2e8f0"/><text x="300" y="128" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#64748b">Picture</text></svg>',
)}`;

/**
 * An email template's preview with each picture still waiting for its address (`src="{{hero_image_url}}"`) drawn as a
 * grey placeholder instead of a broken image: the template has a picture there, and the author picks it.
 */
function withPicturePlaceholders(html: string): string {
  return html.replace(/(<img\b[^>]*?\ssrc=)(["'])\{\{\s*[a-z0-9_]+\s*\}\}\2/gi, (_m, before: string, quote: string) => `${before}${quote}${PICTURE_PLACEHOLDER}${quote}`);
}

/** Any `(prefers-color-scheme: …)` feature, wherever it sits in a media query. */
const SCHEME_FEATURE = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi;

/**
 * The email in its LIGHT scheme, whatever the viewer's system prefers. A frame's `prefers-color-scheme` follows the
 * viewer's OS, so on a dark-mode laptop the template cards drew dark emails beside a light page (Loop 1, 2026-11-17).
 * Every scheme feature becomes always (light) or never (dark) true, and the document declares light; the same rule as
 * pml-ui's `forceColorScheme`, kept here because growth-ui does not depend on pml-ui.
 */
export function inTheLightScheme(html: string): string {
  const forced = html.replace(SCHEME_FEATURE, (_m, scheme: string) => (scheme.toLowerCase() === 'light' ? '(min-width: 0px)' : '(max-width: 0px)'));
  const declare = '<meta name="color-scheme" content="light"><style>:root{color-scheme:light}</style>';

  return /<head[^>]*>/i.test(forced) ? forced.replace(/<head[^>]*>/i, (head) => head + declare) : declare + forced;
}

/** A page drawn at `width` and scaled to the card's width; a picture, never something to press. */
function ScaledPage({ children, width = PAGE_WIDTH }: { children: ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setScale(entry.contentRect.width / width);
    });
    watch.observe(el);

    return () => watch.disconnect();
  }, [width]);

  return (
    <div ref={box} className="gr-template-page" aria-hidden="true">
      <div className="gr-template-page-inner" style={{ width, transform: `scale(${scale})` }} {...{ inert: true }}>
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
