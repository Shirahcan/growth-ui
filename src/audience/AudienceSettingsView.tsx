import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, ChoiceGroup, Field, INPUT, Loading, Pill } from '../ui/primitives';
import type { AudienceSettings } from './types';

/**
 * Settings > Growth > Audience (G4c2/G4c3): the product's own answers to questions the law or its readers
 * care about. None but the warning window has a default; while one is unset, the flow that needs it is
 * refused in plain words, so this view says which are missing.
 */
const slug = (label: string) => label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

export function AudienceSettingsView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [draft, setDraft] = useState<AudienceSettings | null>(null);
  const [topicsText, setTopicsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ audience: AudienceSettings }>>('GET', 'settings/audience')
      .then((res) => {
        if (!live) return;
        const s = unwrap(res).audience;
        setDraft(s);
        setTopicsText((s.topics ?? []).map((t) => t.label).join('\n'));
      })
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError]);

  if (draft === null) return <Loading />;

  const missing = [
    draft.double_opt_in === null ? 'whether sign-ups confirm by email' : null,
    draft.topics === null ? 'the newsletter topics' : null,
    draft.regular_gap_days === null ? 'how often regular emails go' : null,
    draft.import_purge_days === null ? 'how long unanswered imported people are kept' : null,
  ].filter(Boolean);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setRefused(null);
    const labels = topicsText.split('\n').map((l) => l.trim()).filter(Boolean);
    const keep = new Map((draft.topics ?? []).map((t) => [t.label, t.key]));
    try {
      const res = await request<Envelope<{ audience: AudienceSettings }>>('PUT', 'settings/audience', {
        ...(draft.double_opt_in !== null ? { double_opt_in: draft.double_opt_in } : {}),
        ...(labels.length > 0 ? { topics: labels.map((label) => ({ label, key: keep.get(label) ?? slug(label) })) } : {}),
        ...(draft.regular_gap_days !== null ? { regular_gap_days: draft.regular_gap_days } : {}),
        ...(draft.import_purge_days !== null ? { import_purge_days: draft.import_purge_days } : {}),
        lapse_warning_days: draft.lapse_warning_days,
      });
      setDraft(unwrap(res).audience);
      notify('Audience settings saved.');
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  const number = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.round(Number(v))));

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">Audience</h2>
          <p className="gr-hint">How people join your list, what they can choose, and how long you keep people who never answered.</p>
          {missing.length > 0 ? <p className="gr-warning">Not set yet: {missing.join('; ')}. Anything that needs one of these is refused until you set it.</p> : null}
        </div>

        <div className="gr-settings-block">
          <p className="gr-row-title">Confirm new sign-ups by email {draft.double_opt_in === null ? <Pill tone="bad">Not set</Pill> : null}</p>
          <p className="gr-hint">With confirmation, a person only joins after clicking the link we email them. That proves the address is theirs, which is the strongest consent you can keep.</p>
          <ChoiceGroup<'yes' | 'no'> label="Confirm new sign-ups by email" value={draft.double_opt_in === null ? null : draft.double_opt_in ? 'yes' : 'no'} onChange={(v) => setDraft({ ...draft, double_opt_in: v === 'yes' })} options={[{ value: 'yes', label: 'Yes, confirm by email' }, { value: 'no', label: 'No, they join at once' }]} />
        </div>

        <div className="gr-settings-block">
          <Field label="Newsletter topics" hint="One per line. People pick from these on their preferences page. Example: Express Entry draws. Changing a topic's wording makes it a new topic, so people who picked the old one will need to pick again.">
            {(id) => <textarea id={id} className={INPUT} rows={4} value={topicsText} onChange={(e) => setTopicsText(e.target.value)} disabled={!canEdit} />}
          </Field>
        </div>

        <div className="gr-settings-block gr-grid-3">
          <Field label="Regular emails, every (days)" hint="People who chose the regular pace get at most one email in this many days. Example: 14.">
            {(id) => <input id={id} type="number" min={1} max={90} className={INPUT} value={draft.regular_gap_days ?? ''} onChange={(e) => setDraft({ ...draft, regular_gap_days: number(e.target.value) })} disabled={!canEdit} />}
          </Field>
          <Field label="Keep unanswered imports (days)" hint="After we first ask an imported person, how long we keep them if they never say yes. Then they are deleted. Example: 30.">
            {(id) => <input id={id} type="number" min={1} max={365} className={INPUT} value={draft.import_purge_days ?? ''} onChange={(e) => setDraft({ ...draft, import_purge_days: number(e.target.value) })} disabled={!canEdit} />}
          </Field>
          <Field label="Warn before consent runs out (days)" hint="How far ahead the Audience page warns you. Example: 30.">
            {(id) => <input id={id} type="number" min={1} max={180} className={INPUT} value={draft.lapse_warning_days} onChange={(e) => setDraft({ ...draft, lapse_warning_days: number(e.target.value) ?? 30 })} disabled={!canEdit} />}
          </Field>
        </div>

        {refused ? <p className="gr-field-error">{refused}</p> : null}
        {canEdit ? (
          <div className="gr-row-actions">
            <Button tone="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save audience settings'}</Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
