import type { ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { TargetPicker } from '../audience/TargetPicker';
import { Button, ChoiceGroup, Field, INPUT, Notice } from '../ui/primitives';
import { announcementTiming } from './AnnouncementsView';
import type { AnnouncementFlow } from './useAnnouncementFlow';

/**
 * The announcement's steps (G5c3d), for the HOST's wizard shell, as `importSteps()` is: one decision per step, each
 * saying what it decides and the consequence, the real verb on the last. Where it shows and how it looks are the
 * PRODUCT's words (`surfaces`, `themes`), passed in by the host, because each product draws its own notices.
 * There is no email here: an announcement's email goes through the shared sender, which waits on the owner (G5b).
 */
export interface AnnouncementStep {
  id: 'who' | 'message' | 'where' | 'when' | 'review';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface AnnouncementStepsOptions {
  /** Where the product can show a notice (Portify: banner, sticky, toast), in its own words. */
  surfaces: Array<{ value: string; label: string }>;
  themes: Array<{ value: string; label: string }>;
  /** The host's shell carries the publish verb in its own footer; the last step then draws no button. */
  hostSubmits?: boolean;
}

function Lead({ decides, children }: { decides: string; children?: ReactNode }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">{decides}</p>
      {children}
    </div>
  );
}

const inFuture = (local: string) => local !== '' && new Date(local).getTime() > Date.now();

/** A page inside the product ("/consultant/billing") or a full https address; never another scheme or "//host". */
const linkOk = (url: string) => /^(https:\/\/\S+|\/(?!\/)\S*)$/.test(url);

export function verbFor(flow: AnnouncementFlow): string {
  return flow.draft.when === 'now' ? 'Publish now' : 'Schedule';
}

function Review({ flow, options }: { flow: AnnouncementFlow; options: AnnouncementStepsOptions }) {
  const { words } = useGrowth();
  const d = flow.draft;
  const where = [...options.surfaces.filter((s) => d.surfaces.includes(s.value)).map((s) => s.label), ...(d.inbox ? ['An inbox message'] : [])];

  return (
    <div className="gr-stack">
      <Lead decides="Check it, then publish.">
        <p className="gr-hint">{d.when === 'now' ? `It starts showing on ${words.product} within a minute.` : `It starts showing at the time you chose.`} You can end it early from the list.</p>
      </Lead>
      <ul className="gr-list">
        <li className="gr-hint"><strong>{d.subject}</strong></li>
        <li className="gr-hint">Who: {d.target.mode === 'all' ? `everyone on ${words.product}` : `${d.target.include.length} pick(s)`}{d.target.exclude.length ? `, ${d.target.exclude.length} left out` : ''}</li>
        <li className="gr-hint">Where: {where.join(', ')}</li>
        <li className="gr-hint">When: {d.when === 'now' ? 'now' : new Date(d.at).toLocaleString()}{d.ends ? `, until ${new Date(d.ends).toLocaleString()}` : ', until you end it'}</li>
      </ul>
      {flow.refusal ? <Notice>{flow.refusal}</Notice> : null}
      {flow.done ? <p className="gr-row-title">Done. {announcementTiming(flow.done)}.</p> : null}
      {options.hostSubmits || flow.done ? null : (
        <div>
          <Button tone="primary" disabled={flow.submitting} onClick={() => void flow.submit()}>{flow.submitting ? 'Working…' : verbFor(flow)}</Button>
        </div>
      )}
    </div>
  );
}

export function announcementSteps(flow: AnnouncementFlow, options: AnnouncementStepsOptions): AnnouncementStep[] {
  const d = flow.draft;

  return [
    {
      id: 'who', title: 'Who sees it',
      validate: () => (d.target.mode === 'specific' && d.target.include.length === 0 ? 'Pick at least one group or person, or choose everyone.' : null),
      render: () => (
        <div className="gr-stack">
          <Lead decides="Who sees this announcement."><p className="gr-hint">Only people with an account see it, where they already work. Example: every consultant, minus one firm.</p></Lead>
          <TargetPicker kind="announcement" value={d.target} onChange={(target) => flow.set({ target })} />
        </div>
      ),
    },
    {
      id: 'message', title: 'Write it',
      validate: () => (d.subject.trim() === '' ? 'Give it a title.' : d.body.trim() === '' ? 'Write the message.' : null),
      render: () => (
        <div className="gr-stack">
          <Lead decides="What it says."><p className="gr-hint">A short title and a few sentences. Example: "Book a call from your case page" and one line on where to find it.</p></Lead>
          <Field label="Title">{(id) => <input id={id} className={INPUT} maxLength={255} value={d.subject} onChange={(e) => flow.set({ subject: e.target.value })} />}</Field>
          <Field label="Message" hint="A blank line starts a new paragraph.">{(id) => <textarea id={id} className={INPUT} rows={5} value={d.body} onChange={(e) => flow.set({ body: e.target.value })} />}</Field>
        </div>
      ),
    },
    {
      id: 'where', title: 'Where it shows',
      validate: () => {
        if (d.surfaces.length === 0 && !d.inbox) return 'Choose at least one place it shows.';
        if ((d.ctaLabel.trim() === '') !== (d.ctaUrl.trim() === '')) return 'A button needs both its words and its link.';
        if (d.ctaUrl.trim() !== '' && !linkOk(d.ctaUrl.trim())) return 'The button link must be a page here (starting with /) or an address starting with https://.';

        return null;
      },
      render: () => (
        <div className="gr-stack">
          <Lead decides="Where people see it and how it looks."><p className="gr-hint">A banner stays until they close it; an inbox message stays in their inbox. Ask them to acknowledge it only when they must act.</p></Lead>
          <div className="gr-pills" role="group" aria-label="Where it shows">
            {options.surfaces.map((s) => {
              const on = d.surfaces.includes(s.value);
              return <button key={s.value} type="button" aria-pressed={on} className={`gr-choice${on ? ' gr-choice-on' : ''}`} onClick={() => flow.set({ surfaces: on ? d.surfaces.filter((x) => x !== s.value) : [...d.surfaces, s.value] })}>{s.label}</button>;
            })}
          </div>
          <label className="gr-check"><input type="checkbox" checked={d.inbox} onChange={(e) => flow.set({ inbox: e.target.checked })} /> Also put it in their inbox</label>
          <ChoiceGroup label="How it looks" value={d.theme} options={options.themes} onChange={(theme) => flow.set({ theme })} />
          <label className="gr-check"><input type="checkbox" checked={d.requiresAck} onChange={(e) => flow.set({ requiresAck: e.target.checked })} /> They must acknowledge it</label>
          <Field label="Button words (optional)">{(id) => <input id={id} className={INPUT} maxLength={80} value={d.ctaLabel} onChange={(e) => flow.set({ ctaLabel: e.target.value })} placeholder="Book a call" />}</Field>
          <Field label="Button link (optional)">{(id) => <input id={id} className={INPUT} maxLength={500} value={d.ctaUrl} onChange={(e) => flow.set({ ctaUrl: e.target.value })} placeholder="/consultant/billing or https://..." />}</Field>
        </div>
      ),
    },
    {
      id: 'when', title: 'When',
      validate: () => {
        if (d.when === 'later' && !inFuture(d.at)) return 'Choose a time in the future, or publish it now.';
        const start = d.when === 'later' ? new Date(d.at).getTime() : Date.now();
        if (d.ends !== '' && new Date(d.ends).getTime() <= start) return 'The end must come after it starts.';

        return null;
      },
      render: () => (
        <div className="gr-stack">
          <Lead decides="When it starts and when it stops."><p className="gr-hint">Times are yours, in this computer&apos;s time zone. Leave the end empty to keep it up until you end it.</p></Lead>
          <ChoiceGroup<'now' | 'later'> label="When it starts" value={d.when} options={[{ value: 'now', label: 'As soon as I publish' }, { value: 'later', label: 'At a time I choose' }]} onChange={(when) => flow.set({ when })} />
          {d.when === 'later' ? <Field label="Starts">{(id) => <input id={id} type="datetime-local" className={INPUT} value={d.at} onChange={(e) => flow.set({ at: e.target.value })} />}</Field> : null}
          <Field label="Ends (optional)">{(id) => <input id={id} type="datetime-local" className={INPUT} value={d.ends} onChange={(e) => flow.set({ ends: e.target.value })} />}</Field>
        </div>
      ),
    },
    { id: 'review', title: 'Review and publish', validate: () => null, render: () => <Review flow={flow} options={options} /> },
  ];
}
