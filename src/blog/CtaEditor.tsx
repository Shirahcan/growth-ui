import { CTA_ACTIONS, CTA_STAGES, CTA_VARIANTS, type CtaActionKind, type CtaItem, type CtaStage, type CtaVariant } from './types';
import { Button, ChoiceGroup, Dialog, Field, INPUT, Notice, Refusal } from '../ui/primitives';

/** What the editor holds while an admin writes a call to action (B2). */
export interface CtaDraft {
  id: number | null;
  stage: CtaStage;
  variant: CtaVariant;
  category: string;
  eyebrow: string;
  headline: string;
  body: string;
  button_label: string;
  action_kind: CtaActionKind;
  action_ref: string;
  second: boolean;
  secondary_label: string;
  secondary_action_kind: CtaActionKind;
  secondary_action_ref: string;
  active: boolean;
}

export function draftFrom(cta: CtaItem | null): CtaDraft {
  return {
    id: cta?.id ?? null,
    stage: cta?.stage ?? 'awareness',
    variant: cta?.variant ?? 'inline',
    category: cta?.category ?? '',
    eyebrow: cta?.eyebrow ?? '',
    headline: cta?.headline ?? '',
    body: cta?.body ?? '',
    button_label: cta?.button_label ?? '',
    action_kind: cta?.action_kind ?? 'subscribe',
    action_ref: cta?.action_ref ?? '',
    second: cta?.secondary !== null && cta?.secondary !== undefined,
    secondary_label: cta?.secondary?.label ?? '',
    secondary_action_kind: cta?.secondary?.action_kind ?? 'link',
    secondary_action_ref: cta?.secondary?.action_ref ?? '',
    active: cta?.active ?? true,
  };
}

/** The body growth-service takes (B1 + B1b); empty optional words are sent as null. */
export function bodyFrom(d: CtaDraft): Record<string, unknown> {
  const text = (v: string) => (v.trim() === '' ? null : v.trim());

  return {
    stage: d.stage,
    variant: d.variant,
    category: text(d.category),
    eyebrow: text(d.eyebrow),
    headline: d.headline.trim(),
    body: text(d.body),
    button_label: d.button_label.trim(),
    action_kind: d.action_kind,
    action_ref: d.action_kind === 'subscribe' ? null : text(d.action_ref),
    secondary_label: d.second ? text(d.secondary_label) : null,
    secondary_action_kind: d.second ? d.secondary_action_kind : null,
    secondary_action_ref: d.second && d.secondary_action_kind !== 'subscribe' ? text(d.secondary_action_ref) : null,
    active: d.active,
  };
}

/** The call to action as a reader will see it: eyebrow, headline, body and the button(s). */
export function CtaPreview({ d }: { d: Pick<CtaDraft, 'eyebrow' | 'headline' | 'body' | 'button_label' | 'second' | 'secondary_label' | 'variant'> }) {
  return (
    <div className={`gr-cta-preview gr-cta-preview-${d.variant}`} aria-label="Preview">
      {d.eyebrow.trim() ? <p className="gr-cta-eyebrow">{d.eyebrow}</p> : null}
      <p className="gr-cta-headline">{d.headline.trim() || 'Your headline'}</p>
      {d.body.trim() ? <p className="gr-cta-body">{d.body}</p> : null}
      <div className="gr-cta-buttons">
        <span className="gr-button gr-button-primary">{d.button_label.trim() || 'Button'}</span>
        {d.second && d.secondary_label.trim() ? <span className="gr-button gr-button-quiet">{d.secondary_label}</span> : null}
      </div>
    </div>
  );
}

const refHint = (kind: CtaActionKind) => CTA_ACTIONS.find((a) => a.value === kind)?.refHint ?? null;

/** The editor dialog (B2): one call to action, with a live preview. Scrolls inside a short screen (Dialog). */
export function CtaEditor({ draft, onChange, onClose, onSave, refused, saving }: {
  draft: CtaDraft;
  onChange: (d: CtaDraft) => void;
  onClose: () => void;
  onSave: () => void;
  refused: string | null;
  saving: boolean;
}) {
  const set = (patch: Partial<CtaDraft>) => onChange({ ...draft, ...patch });
  const firstRef = refHint(draft.action_kind);
  const secondRef = refHint(draft.secondary_action_kind);
  const ready = draft.headline.trim() !== '' && draft.button_label.trim() !== '' && (firstRef === null || draft.action_ref.trim() !== '');

  return (
    <Dialog
      wide
      title={draft.id ? 'Edit call to action' : 'New call to action'}
      description="Every post that uses this stage and position shows these words. Change them once here."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready || saving} onClick={onSave}>{saving ? 'Saving…' : 'Save call to action'}</Button>
        </>
      }
    >
      <div className="gr-stack">
        <Field label="Where the reader is">
          {() => <ChoiceGroup label="Stage" value={draft.stage} options={CTA_STAGES} onChange={(stage) => set({ stage })} />}
        </Field>
        <p className="gr-hint">{CTA_STAGES.find((s) => s.value === draft.stage)?.hint}</p>
        {draft.stage === 'consideration' ? (
          <Notice>Recommendation emails are not built yet, so point this at a landing page form or a page that really gives what the words promise.</Notice>
        ) : null}

        <Field label="How it is drawn">
          {() => <ChoiceGroup label="Position" value={draft.variant} options={CTA_VARIANTS} onChange={(variant) => set({ variant })} />}
        </Field>
        <Field label="Category (optional)" hint="Leave empty to use it for every category that has no copy of its own.">
          {(id) => <input id={id} className={INPUT} maxLength={80} value={draft.category} onChange={(e) => set({ category: e.target.value })} />}
        </Field>

        <Field label="Eyebrow (optional)" hint='A few words above the headline, like "Free updates".'>
          {(id) => <input id={id} className={INPUT} maxLength={80} value={draft.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} />}
        </Field>
        <Field label="Headline">
          {(id) => <input id={id} className={INPUT} maxLength={160} value={draft.headline} onChange={(e) => set({ headline: e.target.value })} />}
        </Field>
        <Field label="Text (optional)">
          {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={draft.body} onChange={(e) => set({ body: e.target.value })} />}
        </Field>

        <Field label="Button">
          {(id) => <input id={id} className={INPUT} maxLength={60} value={draft.button_label} onChange={(e) => set({ button_label: e.target.value })} />}
        </Field>
        <Field label="What the button does">
          {() => <ChoiceGroup label="Action" value={draft.action_kind} options={CTA_ACTIONS} onChange={(action_kind) => set({ action_kind })} />}
        </Field>
        {firstRef ? (
          <Field label="Where it goes" hint={firstRef}>
            {(id) => <input id={id} className={INPUT} maxLength={2048} value={draft.action_ref} onChange={(e) => set({ action_ref: e.target.value })} />}
          </Field>
        ) : null}

        <label className="gr-check">
          <input type="checkbox" checked={draft.second} onChange={(e) => set({ second: e.target.checked })} />
          Add a second button
        </label>
        {draft.second ? (
          <>
            <Field label="Second button">
              {(id) => <input id={id} className={INPUT} maxLength={60} value={draft.secondary_label} onChange={(e) => set({ secondary_label: e.target.value })} />}
            </Field>
            <Field label="What the second button does">
              {() => <ChoiceGroup label="Second action" value={draft.secondary_action_kind} options={CTA_ACTIONS} onChange={(secondary_action_kind) => set({ secondary_action_kind })} />}
            </Field>
            {secondRef ? (
              <Field label="Where the second button goes" hint={secondRef}>
                {(id) => <input id={id} className={INPUT} maxLength={2048} value={draft.secondary_action_ref} onChange={(e) => set({ secondary_action_ref: e.target.value })} />}
              </Field>
            ) : null}
          </>
        ) : null}

        <label className="gr-check">
          <input type="checkbox" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
          In use (posts show it)
        </label>

        <p className="gr-row-title">Preview</p>
        <CtaPreview d={draft} />
        {/* A refusal can be about any field (the headline, a reference, the second button), so it is shown once, by Save. */}
        <Refusal message={refused} />
      </div>
    </Dialog>
  );
}
