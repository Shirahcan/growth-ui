import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import type { AudienceSettings } from '../audience/types';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Field, INPUT, Loading } from '../ui/primitives';

type Values = { split: number | null; wait: number | null; min: number | null };

const whole = (v: string) => (v.trim() === '' ? null : Math.max(1, Math.round(Number(v))));

/**
 * Settings > Growth > Subject-line tests (G5e): each subject's share of the audience, the wait before the winner, and
 * the smallest audience a test runs on. The product's own numbers on growth-service (`settings/audience`), so an admin
 * changes them without a developer. A host whose own settings screen does not mount AudienceSettingsView mounts this.
 */
export function SubjectTestSettingsView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [values, setValues] = useState<Values | null>(null);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ audience: AudienceSettings }>>('GET', 'settings/audience')
      .then((res) => {
        if (!live) return;
        const a = unwrap(res).audience;
        setValues({ split: a.subject_test_split_percent ?? null, wait: a.subject_test_wait_hours ?? null, min: a.subject_test_min_audience ?? null });
      })
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError]);

  if (values === null) return <Loading />;

  async function save() {
    if (!values) return;
    setSaving(true);
    setRefused(null);
    try {
      const res = await request<Envelope<{ audience: AudienceSettings }>>('PUT', 'settings/audience', {
        ...(values.split ? { subject_test_split_percent: values.split } : {}),
        ...(values.wait ? { subject_test_wait_hours: values.wait } : {}),
        ...(values.min ? { subject_test_min_audience: values.min } : {}),
      });
      const a = unwrap(res).audience;
      setValues({ split: a.subject_test_split_percent ?? null, wait: a.subject_test_wait_hours ?? null, min: a.subject_test_min_audience ?? null });
      notify('Subject-line test settings saved.');
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">Subject-line tests</h2>
          <p className="gr-hint">
            When a newsletter tests two subjects, each goes to a small share of the audience first. After the wait, the one more people
            clicked goes to everyone else. Nobody gets both.
          </p>
        </div>
        <div className="gr-settings-block gr-grid-3">
          <Field label="Share per subject (%)" hint="Each subject goes to this share first. Example: 10.">
            {(id) => <input id={id} type="number" min={1} max={45} className={INPUT} value={values.split ?? ''} onChange={(e) => setValues({ ...values, split: whole(e.target.value) })} disabled={!canEdit} />}
          </Field>
          <Field label="Wait before the winner (hours)" hint="How long clicks are counted. Example: 4.">
            {(id) => <input id={id} type="number" min={1} max={72} className={INPUT} value={values.wait ?? ''} onChange={(e) => setValues({ ...values, wait: whole(e.target.value) })} disabled={!canEdit} />}
          </Field>
          <Field label="Smallest audience" hint="Below this many people a test picks a winner by luck, so the send waits and says why. Example: 200.">
            {(id) => <input id={id} type="number" min={2} className={INPUT} value={values.min ?? ''} onChange={(e) => setValues({ ...values, min: whole(e.target.value) })} disabled={!canEdit} />}
          </Field>
        </div>
        {refused ? <p className="gr-field-error">{refused}</p> : null}
        {canEdit ? (
          <div className="gr-row-actions">
            <Button tone="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save subject-line test settings'}</Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
