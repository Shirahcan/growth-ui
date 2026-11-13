import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Dialog, Field, INPUT } from '../ui/primitives';
import type { WatchedSource } from './types';

/**
 * Add or edit a watched page (source: Portify `WatchedSourceDialog`, G3e5). A refused field shows here,
 * beside the form; anything else goes to the host's error surface.
 */
export function SourceDialog({ source, onClose, onSaved }: { source: WatchedSource | null; onClose: () => void; onSaved: () => void }) {
  const { request, notify, onError, words } = useGrowth();
  const [name, setName] = useState(source?.name ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [heading, setHeading] = useState(source?.section_heading ?? '');
  const audiences = Object.entries(words.audiences);
  const [audience, setAudience] = useState(source?.audience ?? audiences[0]?.[0] ?? '');
  const [hours, setHours] = useState(Math.max(1, Math.round((source?.check_every_minutes ?? 120) / 60)));
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setRefused(null);
    const body = { name: name.trim(), url: url.trim(), section_heading: heading.trim() || null, audience, check_every_minutes: hours * 60 };
    try {
      await request(source ? 'PUT' : 'POST', source ? `watched-sources/${source.id}` : 'watched-sources', body);
      notify(source ? 'Source saved.' : 'Source added. Use Check now to confirm it can be read.');
      onSaved();
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={source ? `Edit ${source.name}` : 'Add a source'}
      description="This page is read on a schedule, and you are told when the part you chose changes. No AI runs until someone drafts from it."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={busy || !name.trim() || !url.trim() || hours < 1 || !audience} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="gr-stack">
        <Field label="Name">{(id) => <input id={id} maxLength={120} className={INPUT} value={name} placeholder="BC PNP invitations" onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Page address">{(id) => <input id={id} maxLength={500} className={INPUT} value={url} placeholder="https://..." onChange={(e) => setUrl(e.target.value)} />}</Field>
        <Field label="Heading to watch (optional)" hint="Type a heading exactly as it reads on the page, and only that section is watched. Leave blank to watch the whole page, which also catches small edits.">
          {(id) => <input id={id} maxLength={200} className={INPUT} value={heading} placeholder="Draw information" onChange={(e) => setHeading(e.target.value)} />}
        </Field>
        <Field label="Who it matters to">
          {(id) => (
            <select id={id} className={INPUT} value={audience} onChange={(e) => setAudience(e.target.value)}>
              {audiences.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Check every (hours)">{(id) => <input id={id} type="number" min={1} max={168} className={INPUT} value={hours} onChange={(e) => setHours(Number(e.target.value))} />}</Field>
        {refused ? (
          <p role="alert" className="gr-field-error">
            {refused}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The first field message of a refused write, from an axios-shaped rejection
 * (`error.response.data.errors` / `.message`, the service's 422). Null for anything else.
 */
export function fieldError(e: unknown): string | null {
  const data = (e as { response?: { status?: number; data?: { errors?: Record<string, string[]>; message?: string } } })?.response;
  if (data?.status !== 422) return null;
  const first = Object.values(data.data?.errors ?? {})[0]?.[0];

  return first ?? data.data?.message ?? null;
}
