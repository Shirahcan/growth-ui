import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { FloatingMenu } from './FloatingMenu';
import { GrowthPortal } from './GrowthPortal';

/**
 * growth-ui's few building blocks (source: ai-ui `console/primitives.tsx`). Every look comes from the
 * `--gr-*` values the provider sets, through the `gr-*` classes in styles.css, so the package never
 * depends on a host's UI kit or Tailwind build, and every product's Growth wears its own palette.
 */

export function Card({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return <div className={`gr-card${padded ? ' gr-card-padded' : ''}`}>{children}</div>;
}

type ButtonTone = 'primary' | 'quiet' | 'danger';

export function Button({ tone = 'quiet', children, ...rest }: { tone?: ButtonTone } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`gr-button gr-button-${tone}`}>
      {children}
    </button>
  );
}

export function Pill({ tone = 'muted', children }: { tone?: 'muted' | 'accent' | 'good' | 'bad'; children: ReactNode }) {
  return <span className={`gr-pill gr-pill-${tone}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="gr-empty">{children}</p>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="gr-empty" role="status">
      {label}
    </p>
  );
}

/** A failed read, said as what happened and what to do; never an empty or zeroed screen. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="gr-load-error">
      <span>{message}</span>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

/** One plain line the service sent with its answer ("Ideas from your own results are missing this time"). */
export function Notice({ children }: { children: ReactNode }) {
  return <p className="gr-notice">{children}</p>;
}

/**
 * A refusal the service sent back for a dialog's Save. A dialog body scrolls (Dialog), so on a short screen the refusal
 * can sit below the fold while the person looks at the pinned Save button and sees nothing happen: it scrolls itself
 * into view each time a new refusal arrives, and is announced to screen readers.
 */
export function Refusal({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [message]);

  return message ? <p ref={ref} role="alert" className="gr-notice">{message}</p> : null;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();

  return (
    <div className="gr-field">
      <label htmlFor={id} className="gr-label">
        {label}
      </label>
      {children(id)}
      {error ? <p className="gr-field-error">{error}</p> : hint ? <p className="gr-hint">{hint}</p> : null}
    </div>
  );
}

/** The input look (px-3 py-2, no outline ring of the browser's): use with Field. */
export const INPUT = 'gr-input';

/** One decision among a few: pill radios, each with its own words. */
export function ChoiceGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="gr-choices">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={`gr-choice${value === o.value ? ' gr-choice-on' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A wizard step's 2-3 options as CARDS, one per row, each saying what it means (owner 2026-11-20: "wizard steps with 2-3
 * options (radios) to choose from should present those options as cards, one per line/row"; small pills were easily
 * missed). Pills (ChoiceGroup) stay for filters and quick toggles outside a wizard's main decision.
 */
export function OptionCards<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: Array<{ value: T; label: string; hint?: string }>; onChange: (v: T) => void }) {
  const id = useId();

  return (
    <div role="radiogroup" aria-label={label} className="gr-option-cards">
      {options.map((o, i) => {
        const on = value === o.value;

        // Named by its title, described by its line: a screen reader says "Alert, radio button, checked" and then why.
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-labelledby={`${id}-${i}-t`}
            aria-describedby={o.hint ? `${id}-${i}-h` : undefined}
            onClick={() => onChange(o.value)}
            className={`gr-option-card${on ? ' gr-option-card-on' : ''}`}
          >
            <span className="gr-option-dot" aria-hidden />
            <span className="gr-option-text">
              <span id={`${id}-${i}-t`} className="gr-option-title">{o.label}</span>
              {o.hint ? <span id={`${id}-${i}-h`} className="gr-option-hint">{o.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface KebabItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Row actions behind ONE trigger (the estate's kebab rule); a destructive item goes last, set apart. */
export function Kebab({ label, items }: { label: string; items: KebabItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const shown = [...items.filter((i) => !i.hidden && !i.danger), ...items.filter((i) => !i.hidden && i.danger)];
  if (shown.length === 0) return null;

  return (
    <>
      <button ref={ref} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="gr-kebab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      <FloatingMenu anchor={ref} open={open} onClose={() => setOpen(false)}>
        {shown.map((item, i) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
            className={`gr-menu-item${item.danger ? ' gr-menu-item-danger' : ''}${item.danger && i > 0 && !shown[i - 1]?.danger ? ' gr-menu-item-apart' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </FloatingMenu>
    </>
  );
}

/**
 * A modal that stays inside the viewport: header and footer pinned, the body scrolls (the modal
 * directive: max-height 90vh, flex column, body `flex: 1; min-height: 0; overflow-y: auto`), so the
 * action buttons are reachable on a short screen.
 */
export function Dialog({ title, description, onClose, children, footer, wide }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <GrowthPortal>
      <div className="gr-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label={title} className={`gr-dialog${wide ? ' gr-dialog-wide' : ''}`}>
          <div className="gr-dialog-head">
            <div className="gr-dialog-title">{title}</div>
            {description ? <p className="gr-hint">{description}</p> : null}
          </div>
          <div className="gr-dialog-body">{children}</div>
          <div className="gr-dialog-foot">{footer}</div>
        </div>
      </div>
    </GrowthPortal>
  );
}

export function copyText(text: string): Promise<boolean> {
  return (
    navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    ) ?? Promise.resolve(false)
  );
}
