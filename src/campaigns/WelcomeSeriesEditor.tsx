import { RichTextEditor } from '@shirahcan/ai-ui/editor';
import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Dialog, Field, INPUT, Refusal } from '../ui/primitives';

export type WelcomeTrigger = 'any' | 'topic' | 'landing';

export interface WelcomeStep { position?: number; delay_hours: number; subject: string; preheader?: string | null; body_html: string }

export interface WelcomeSeries {
  uuid: string;
  name: string;
  trigger_kind: WelcomeTrigger;
  trigger_value: string | null;
  is_active: boolean;
  steps: WelcomeStep[];
  people: { in_progress: number; finished: number; stopped: number };
}

export interface WelcomeChoices { topics: Array<{ key: string; label: string }>; pages: Array<{ uuid: string; name: string }> }

const BLANK_STEP: WelcomeStep = { delay_hours: 0, subject: '', body_html: '' };
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** What is wrong with the series as written, in plain words; null when it can be saved. */
export function welcomeProblem(name: string, trigger: WelcomeTrigger, value: string, steps: WelcomeStep[]): string | null {
  if (name.trim() === '') return 'Name the series.';
  if (trigger !== 'any' && value === '') return trigger === 'topic' ? 'Pick the topic.' : 'Pick the landing page.';
  if (steps.length === 0) return 'Add at least one email.';
  const n = steps.findIndex((s) => s.subject.trim() === '' || textOf(s.body_html).length < 10);

  return n === -1 ? null : `Email ${n + 1} needs a subject and a few words.`;
}

/**
 * Write or change a welcome series (G5g): its name, who it is for, and its emails in order, each with how long after
 * the previous one it goes. The emails are the admin's own words; the service sends each when it is due, after its
 * checks. The dialog's body scrolls inside a bounded height, so Save stays reachable on a short screen.
 */
export function WelcomeSeriesEditor({ series, choices, onClose, onSaved }: { series: WelcomeSeries | null; choices: WelcomeChoices; onClose: () => void; onSaved: (s: WelcomeSeries) => void }) {
  const { request, onError, notify } = useGrowth();
  const [name, setName] = useState(series?.name ?? 'Welcome');
  const [trigger, setTrigger] = useState<WelcomeTrigger>(series?.trigger_kind ?? 'any');
  const [value, setValue] = useState(series?.trigger_value ?? '');
  const [steps, setSteps] = useState<WelcomeStep[]>(series?.steps.length ? series.steps : [{ ...BLANK_STEP }]);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const setStep = (i: number, patch: Partial<WelcomeStep>) => setSteps((all) => all.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  async function save() {
    const problem = welcomeProblem(name, trigger, value, steps);
    if (problem) {
      setRefused(problem);
      return;
    }
    setSaving(true);
    setRefused(null);
    const body = {
      name: name.trim(), trigger_kind: trigger, trigger_value: trigger === 'any' ? null : value, is_active: series?.is_active ?? false,
      steps: steps.map((s) => ({ delay_hours: s.delay_hours, subject: s.subject.trim(), preheader: s.preheader?.trim() || null, body_html: s.body_html })),
    };
    try {
      const res = await request<Envelope<{ series: WelcomeSeries }>>(series ? 'PUT' : 'POST', series ? `welcome-series/${series.uuid}` : 'welcome-series', body);
      notify('Welcome series saved.');
      onSaved(unwrap(res).series);
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      wide
      title={series ? `Edit ${series.name}` : 'New welcome series'}
      description="A few emails a new subscriber gets after they confirm. Only people who confirm after you switch it on receive it."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save the series'}</Button>
        </>
      }
    >
      <div className="gr-stack">
        <Field label="Name" hint="Only your team sees it. Example: Welcome for new applicants.">
          {(id) => <input id={id} className={INPUT} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Who gets it" hint="Everyone who confirms, people who chose a topic, or people who signed up on one landing page.">
          {(id) => (
            <select id={id} className={INPUT} value={trigger} onChange={(e) => { setTrigger(e.target.value as WelcomeTrigger); setValue(''); }}>
              <option value="any">Everyone who confirms</option>
              <option value="topic" disabled={choices.topics.length === 0}>People who chose a topic</option>
              <option value="landing" disabled={choices.pages.length === 0}>People who signed up on a landing page</option>
            </select>
          )}
        </Field>
        {trigger === 'topic' ? (
          <Field label="Topic">
            {(id) => (
              <select id={id} className={INPUT} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Pick a topic</option>
                {choices.topics.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            )}
          </Field>
        ) : null}
        {trigger === 'landing' ? (
          <Field label="Landing page">
            {(id) => (
              <select id={id} className={INPUT} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Pick a landing page</option>
                {choices.pages.map((p) => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
              </select>
            )}
          </Field>
        ) : null}

        {steps.map((s, i) => (
          <div key={i} className="gr-settings-block gr-stack">
            <div className="gr-row-between">
              <span className="gr-row-title">Email {i + 1}</span>
              {steps.length > 1 ? <Button onClick={() => setSteps((all) => all.filter((_, k) => k !== i))}>Remove email {i + 1}</Button> : null}
            </div>
            <Field label={i === 0 ? `Email ${i + 1}: days after they confirm` : `Email ${i + 1}: days after email ${i}`} hint="0 sends it as soon as the series reaches them.">
              {(id) => <input id={id} type="number" min={0} max={90} className={INPUT} value={Math.round(s.delay_hours / 24)} onChange={(e) => setStep(i, { delay_hours: Math.max(0, Math.round(Number(e.target.value) || 0)) * 24 })} />}
            </Field>
            <Field label={`Email ${i + 1}: subject`}>
              {(id) => <input id={id} className={INPUT} maxLength={255} value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} />}
            </Field>
            <RichTextEditor
              variant="email"
              value={s.body_html}
              onChange={(body_html) => setStep(i, { body_html })}
              controls={['format', 'headings', 'lists', 'link']}
              placeholder="Write the email. The layout, your footer and the unsubscribe link are added when it is sent."
              contentClassName="min-h-[140px]"
            />
          </div>
        ))}
        {steps.length < 10 ? <div><Button onClick={() => setSteps((all) => [...all, { ...BLANK_STEP, delay_hours: 48 }])}>Add an email</Button></div> : null}
        <Refusal message={refused} />
      </div>
    </Dialog>
  );
}
