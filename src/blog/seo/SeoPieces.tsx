import { useId, type ReactNode } from 'react';

/**
 * The search panel's general pieces (2026-11-18). CONTEXT-FREE on purpose: no GrowthProvider, no request, only values in
 * and changes out, so a site page's SEO panel can use the very same pieces (agreed with the Studio work: they lift into
 * pml-ui's sharing folder as they are when a second surface needs them).
 */

/** A text length against the product's limits: under, within or over, with the count. */
export function LengthMeter({ length, min = 0, max }: { length: number; min?: number; max: number }) {
  const ok = length >= min && length <= max;
  const pct = Math.min(100, max > 0 ? (length / max) * 100 : 0);

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#5A5A80', fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden="true" style={{ flex: 1, height: 4, borderRadius: 9, background: '#E4E4EF', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: ok ? '#15803D' : '#C62828' }} />
      </span>
      <span>
        {length} / {min > 0 ? `${min} to ${max}` : max}
        <span className="gr-sr-only">{ok ? ' characters, within the range' : ' characters, outside the range'}</span>
      </span>
    </span>
  );
}

/** A labelled text box (or area) with its meter underneath; it saves when the person leaves it. */
export function MeteredField({
  label,
  value,
  onChange,
  onCommit,
  min,
  max,
  rows,
  placeholder,
  disabled,
  error,
  hint,
  name,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  min?: number;
  max?: number;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
  hint?: ReactNode;
  /** The field's name, so a browser's autofill and form tools can tell the boxes apart. */
  name?: string;
}) {
  const id = useId();
  const common = {
    id,
    name,
    className: 'gr-input',
    value,
    disabled,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onBlur: (e: { target: { value: string } }) => onCommit(e.target.value.trim()),
  };

  return (
    <div className="gr-stack" style={{ gap: 4 }}>
      <label htmlFor={id} className="gr-row-title" style={{ fontSize: 13 }}>{label}</label>
      {rows ? <textarea {...common} rows={rows} style={{ resize: 'vertical' }} /> : <input {...common} />}
      {max !== undefined ? <LengthMeter length={value.trim().length} min={min} max={max} /> : null}
      {error ? <p id={`${id}-error`} role="alert" style={{ margin: 0, fontSize: 12, color: '#C62828' }}>{error}</p> : null}
      {hint ? <p className="gr-hint" style={{ margin: 0 }}>{hint}</p> : null}
    </div>
  );
}

/** How the page shows in a search result, desktop or phone width. */
export function SearchResultPreview({ url, title, description, mobile }: { url: string | null; title: string; description: string; mobile: boolean }) {
  return (
    <div style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: 12, display: 'grid', gap: 3, background: '#fff', maxWidth: mobile ? 300 : undefined }}>
      <span style={{ fontSize: 12, color: '#4D5156', overflowWrap: 'anywhere' }}>{url ?? 'The address appears once the blog’s address is set.'}</span>
      <span style={{ fontSize: mobile ? 16 : 18, color: '#1A0DAB', lineHeight: 1.3 }}>{title || 'The search title shows here.'}</span>
      <span style={{ fontSize: 13, color: '#4D5156', lineHeight: 1.5 }}>{description || 'The search description shows here.'}</span>
    </div>
  );
}

/** The card a shared link unfurls into (Facebook, LinkedIn and X draw the same three things). */
export function SharePreviewCard({ domain, title, description, image, imageAlt }: { domain: string; title: string; description: string; image: string | null; imageAlt: string | null }) {
  return (
    <figure style={{ margin: 0, border: '1px solid #E4E4EF', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a package, not a Next app: the host's own picture, as shared.
        <img src={image} alt={imageAlt ?? ''} style={{ display: 'block', width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover' }} />
      ) : (
        <div style={{ aspectRatio: '1.91 / 1', display: 'grid', placeItems: 'center', padding: 12, textAlign: 'center', fontSize: 12, color: '#fff', background: 'linear-gradient(135deg,#1E1B7B,#4361EE 60%,#A5A8FA)' }}>
          No cover picture: the site’s own card is shared instead.
        </div>
      )}
      <figcaption style={{ padding: 10, background: '#F7F7FB', display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 11, color: '#5A5A80', textTransform: 'uppercase' }}>{domain}</span>
        <b style={{ fontSize: 13.5, color: '#0B0A33' }}>{title || 'The share title shows here.'}</b>
        <span style={{ fontSize: 12, color: '#5A5A80' }}>{description || 'The share description shows here.'}</span>
      </figcaption>
    </figure>
  );
}

/** One on/off setting with what it means; a switch, saved at once. */
export function SettingSwitch({ label, detail, checked, onChange, disabled }: { label: string; detail?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const id = useId();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
      <div>
        <label htmlFor={id} className="gr-row-title" style={{ fontSize: 13 }}>{label}</label>
        {detail ? <p className="gr-hint" style={{ margin: '2px 0 0' }}>{detail}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{ width: 40, height: 22, borderRadius: 999, border: 0, padding: 2, cursor: disabled ? 'not-allowed' : 'pointer', background: checked ? 'var(--gr-accent, #4361ee)' : '#CBD5E1', outline: 'none', display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start' }}
      >
        <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgb(0 0 0 / 0.2)' }} />
      </button>
    </div>
  );
}
