import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Card, Field, INPUT, Loading } from '../ui/primitives';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from './SourceDialog';
import type { BrandKit, BrandKitColours } from './types';

/**
 * Settings > Growth > Brand, on growth-service (G2e-2): the one brand record the product's landing pages, posts and
 * share cards read (name, logo, colours, fonts, legal links). The sender is shown, never edited here: it is set where
 * the product sends from (`senderNote` says where, in the host's words).
 *
 * Unset is shown as unset: the service lists what is missing, and nothing is filled in for the person.
 */
export interface BrandKitViewProps {
  /** Where the sender identity is changed, in the host's words ("Set in Settings > Growth > Newsletter"). */
  senderNote?: string;
}

const COLOUR_FIELDS: Array<{ key: keyof BrandKitColours; label: string }> = [
  { key: 'accent', label: 'Accent colour' },
  { key: 'on_accent', label: 'Text on the accent' },
  { key: 'surface', label: 'Surface colour' },
  { key: 'text', label: 'Text colour' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** WCAG contrast ratio of two #rrggbb colours, or null when either is not a full colour yet. */
export function contrastRatio(a: string | null, b: string | null): number | null {
  if (!a || !b || !HEX.test(a) || !HEX.test(b)) return null;
  const channel = (hex: string, at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const first = luminance(a);
  const second = luminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function BrandKitView({ senderNote }: BrandKitViewProps) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ brand: BrandKit }>>('GET', 'settings/brand')
      .then((res) => {
        if (!live) return;
        setKit(unwrap(res).brand);
        setDraft(unwrap(res).brand);
      })
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError]);

  async function save() {
    if (!draft || !kit) return;
    setSaving(true);
    setRefused(null);
    try {
      // Only what changed is sent: an untouched field is never rewritten (and never unset by a stale form).
      const body: Record<string, unknown> = {};
      if (draft.name !== kit.name) body.name = draft.name ?? '';
      if (draft.logo_url !== kit.logo_url) body.logo_url = draft.logo_url ?? '';
      for (const part of ['colours', 'fonts', 'legal'] as const) {
        const changed = Object.fromEntries(
          Object.entries(draft[part]).filter(([field, value]) => value !== (kit[part] as Record<string, string | null>)[field]).map(([field, value]) => [field, value ?? '']),
        );
        if (Object.keys(changed).length > 0) body[part] = changed;
      }
      if (Object.keys(body).length === 0) {
        notify('Nothing changed.');
        return;
      }
      const res = await request<Envelope<{ brand: BrandKit }>>('PUT', 'settings/brand', body);
      setKit(unwrap(res).brand);
      setDraft(unwrap(res).brand);
      notify('Brand kit saved.');
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  if (!draft || !kit) {
    return (
      <Card>
        <Loading />
      </Card>
    );
  }

  const text = (value: string) => (value.trim() === '' ? null : value);
  const ratio = contrastRatio(draft.colours.accent, draft.colours.on_accent);

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">Brand</h2>
          <p className="gr-hint">The name, logo, colours and fonts your landing pages, posts and their share pictures are drawn with.</p>
        </div>

        {kit.missing.length > 0 ? <p className="gr-warning">Not set yet: {kit.missing.join(', ')}.</p> : null}

        <div className="gr-grid-3">
          <Field label="Brand name">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} maxLength={80} value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: text(e.target.value) })} />}
          </Field>
          <Field label="Logo address (https)" hint="A PNG or SVG your site already serves.">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} value={draft.logo_url ?? ''} onChange={(e) => setDraft({ ...draft, logo_url: text(e.target.value) })} />}
          </Field>
        </div>

        <div className="gr-grid-3">
          {COLOUR_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label} hint="As #rrggbb">
              {(id) => (
                <input
                  id={id}
                  className={INPUT}
                  disabled={!canEdit}
                  placeholder="#4361EE"
                  value={draft.colours[key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, colours: { ...draft.colours, [key]: text(e.target.value) } })}
                />
              )}
            </Field>
          ))}
        </div>

        {/* A live sample: a pair that cannot be read is seen before it is saved. */}
        {draft.colours.accent && HEX.test(draft.colours.accent) ? (
          <div className="gr-stack">
            <div style={{ background: draft.colours.accent, color: draft.colours.on_accent ?? undefined, padding: '16px 20px', borderRadius: 12, fontWeight: 600 }}>
              {draft.name ?? 'Your brand'}: words on the accent colour
            </div>
            {ratio !== null && ratio < 4.5 ? (
              <p className="gr-field-error">These two colours are hard to read together (contrast {ratio.toFixed(1)}:1; aim for at least 4.5:1).</p>
            ) : null}
          </div>
        ) : null}

        <div className="gr-grid-3">
          <Field label="Heading font" hint="Its family name, for example Fraunces.">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} value={draft.fonts.heading ?? ''} onChange={(e) => setDraft({ ...draft, fonts: { ...draft.fonts, heading: text(e.target.value) } })} />}
          </Field>
          <Field label="Body font" hint="For example Inter.">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} value={draft.fonts.body ?? ''} onChange={(e) => setDraft({ ...draft, fonts: { ...draft.fonts, body: text(e.target.value) } })} />}
          </Field>
        </div>

        <div className="gr-grid-3">
          <Field label="Privacy policy address (https)">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} value={draft.legal.privacy_url ?? ''} onChange={(e) => setDraft({ ...draft, legal: { ...draft.legal, privacy_url: text(e.target.value) } })} />}
          </Field>
          <Field label="Terms address (https)">
            {(id) => <input id={id} className={INPUT} disabled={!canEdit} value={draft.legal.terms_url ?? ''} onChange={(e) => setDraft({ ...draft, legal: { ...draft.legal, terms_url: text(e.target.value) } })} />}
          </Field>
        </div>

        <div className="gr-stack gr-settings-block">
          <h3 className="gr-row-title">Sender</h3>
          <p className="gr-hint">
            {kit.sender.from_name && kit.sender.from_address ? `${kit.sender.from_name} <${kit.sender.from_address}>` : 'No sender set yet.'}
            {kit.sender.mailing_address ? `, ${kit.sender.mailing_address}` : ''}
          </p>
          {senderNote ? <p className="gr-hint">{senderNote}</p> : null}
        </div>

        {refused ? (
          <p role="alert" className="gr-field-error">
            {refused}
          </p>
        ) : null}

        {canEdit ? (
          <div>
            <Button tone="primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save brand kit'}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
