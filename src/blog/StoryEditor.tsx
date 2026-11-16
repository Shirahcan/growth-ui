import { Button, ChoiceGroup, Dialog, Field, INPUT, Notice } from '../ui/primitives';
import { CONSENT_METHODS, type ConsentMethod, type Story, type StoryStatus } from './types';
import { consentAt, localToday } from './useStoryFlow';

/** What the edit dialog holds (post-and-newsletter-layouts B6). */
export interface StoryEdit {
  story: Story;
  case_type: string;
  challenge: string;
  strategy: string;
  outcome: string;
  how_found: string;
  consent_method: ConsentMethod | null;
  consent_on: string;
  status: StoryStatus;
}

/** A stored instant as the viewer's own yyyy-mm-dd. */
function localDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function editFrom(story: Story): StoryEdit {
  return {
    story,
    case_type: story.case_type,
    challenge: story.challenge,
    strategy: story.strategy,
    outcome: story.outcome,
    how_found: story.how_found ?? '',
    consent_method: story.consent.method,
    consent_on: localDay(story.consent.at),
    status: story.status,
  };
}

/** Only what changed is sent, so re-saving an untouched consent never re-dates it or re-stamps who recorded it. */
export function editBody(e: StoryEdit): Record<string, unknown> {
  const s = e.story;
  const body: Record<string, unknown> = {};
  const text = (v: string) => v.trim();

  for (const field of ['case_type', 'challenge', 'strategy', 'outcome'] as const) {
    if (text(e[field]) !== s[field]) body[field] = text(e[field]);
  }
  if ((text(e.how_found) || null) !== s.how_found) body.how_found = text(e.how_found) || null;
  if (e.consent_method !== s.consent.method || e.consent_on !== localDay(s.consent.at)) {
    body.consent_method = e.consent_method;
    body.consent_at = e.consent_method ? consentAt(e.consent_on) : null;
  }
  if (e.status !== s.status) body.status = e.status;

  return body;
}

const STATUS_OPTIONS: Array<{ value: StoryStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready' },
  { value: 'archived', label: 'Archived' },
];

/** Edits a story's words, consent and status. Changing the words or the consent takes it out of posts until checked again. */
export function StoryEditor({ edit, onChange, onClose, onSave, refused, saving }: {
  edit: StoryEdit;
  onChange: (e: StoryEdit) => void;
  onClose: () => void;
  onSave: () => void;
  refused: string | null;
  saving: boolean;
}) {
  const set = (patch: Partial<StoryEdit>) => onChange({ ...edit, ...patch });
  const consentOk = edit.consent_method !== null && edit.consent_on !== '';
  const filled = ['case_type', 'challenge', 'strategy', 'outcome'].every((f) => edit[f as 'case_type'].trim() !== '');
  const ready = filled && (edit.consent_method === null || edit.consent_on !== '') && (edit.status !== 'ready' || consentOk);

  return (
    <Dialog
      wide
      title="Edit story"
      description="No names or details that could identify the client. Changing the words or the consent means someone checks it again before posts show it."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready || saving} onClick={onSave}>{saving ? 'Saving…' : 'Save story'}</Button>
        </>
      }
    >
      <div className="gr-stack">
        <Field label="Kind of case">
          {(id) => <input id={id} className={INPUT} maxLength={120} value={edit.case_type} onChange={(e) => set({ case_type: e.target.value })} />}
        </Field>
        <Field label="The challenge">
          {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={edit.challenge} onChange={(e) => set({ challenge: e.target.value })} />}
        </Field>
        <Field label="What was done">
          {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={edit.strategy} onChange={(e) => set({ strategy: e.target.value })} />}
        </Field>
        <Field label="The outcome">
          {(id) => <textarea id={id} className={INPUT} rows={2} maxLength={2000} value={edit.outcome} onChange={(e) => set({ outcome: e.target.value })} />}
        </Field>
        <Field label="How they found their consultant (optional)">
          {(id) => <input id={id} className={INPUT} maxLength={1000} value={edit.how_found} onChange={(e) => set({ how_found: e.target.value })} />}
        </Field>
        <Field label="How the client agreed">
          {() => <ChoiceGroup label="Consent" value={edit.consent_method} options={CONSENT_METHODS} onChange={(consent_method) => set({ consent_method })} />}
        </Field>
        {edit.consent_method ? (
          <div className="gr-row-between">
            <Field label="The day they agreed">
              {(id) => <input id={id} type="date" className={INPUT} max={localToday()} value={edit.consent_on} onChange={(e) => set({ consent_on: e.target.value })} />}
            </Field>
            <Button onClick={() => set({ consent_method: null, consent_on: '', status: edit.status === 'ready' ? 'draft' : edit.status })}>Remove consent</Button>
          </div>
        ) : null}
        <Field label="Status">
          {() => <ChoiceGroup label="Status" value={edit.status} options={STATUS_OPTIONS} onChange={(status) => set({ status })} />}
        </Field>
        {edit.status === 'ready' && !consentOk ? <Notice>A story is ready only once the consent is recorded: how they agreed and the day.</Notice> : null}
        {refused ? <Notice>{refused}</Notice> : null}
      </div>
    </Dialog>
  );
}
