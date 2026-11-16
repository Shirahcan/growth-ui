import { useEffect, useRef, type ReactNode } from 'react';
import { RichTextEditor } from '@shirahcan/ai-ui/editor';
import { TargetPicker } from '../audience/TargetPicker';
import { Button, ChoiceGroup, Field, INPUT, Notice } from '../ui/primitives';
import { campaignProgress } from './NewsletterView';
import type { CampaignFlow } from './useCampaignFlow';

/**
 * A newsletter's or alert's steps on the shared service (G5d4c), for the HOST's wizard shell, as `announcementSteps()`
 * are: one decision per step, each saying what it decides and its consequence, the real verb on the last. The same
 * steps as Portify's own wizard (kind, who, content, checks, when, review), so moving to the service changes where
 * the campaign lives, not how an admin writes one.
 *
 * The body is written with the estate's editor (ai-ui, owner 2026-11-16) in its EMAIL form: no class or style, links
 * without target/rel, because the product's layout styles it when it is sent. No tables or note cards here: the
 * campaign body is not run through a product's email compiler, so they would arrive unstyled.
 */
export interface CampaignStep {
  id: 'kind' | 'who' | 'content' | 'checks' | 'when' | 'review';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface CampaignStepsOptions {
  /** The host's shell carries the send verb in its own footer; the last step then draws no button. */
  hostSubmits?: boolean;
  /** The host's way to have its assistant draft the body from the subject (G5d5), shown on the content step. */
  draftAction?: ReactNode;
}

function Lead({ decides, children }: { decides: string; children?: ReactNode }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">{decides}</p>
      {children}
    </div>
  );
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const inFuture = (local: string) => local !== '' && new Date(local).getTime() > Date.now();

export function campaignVerb(flow: CampaignFlow): string {
  return flow.draft.when === 'now' ? 'Send now' : 'Schedule';
}

function Reach({ flow }: { flow: CampaignFlow }) {
  if (flow.reachError) return <p className="gr-warning">Reach unknown: {flow.reachError}</p>;
  if (flow.reach === null) return <p className="gr-hint">Counting who it reaches…</p>;
  const count = flow.reach.toLocaleString();

  // Said as a narrowing of the picker's own count above it, never a second "Reaches N" that could disagree with it:
  // the picker counts who is in the audience, this counts who gets THIS one today.
  return (
    <p className="gr-row-title">
      {flow.draft.kind === 'alert'
        ? `This alert goes to ${count} of them today: only people who asked for every update.`
        : `This newsletter goes to ${count} of them today, after each person’s pace and topic choices.`}
    </p>
  );
}

/** The checks, read from the saved draft when the step opens. */
function Checks({ flow }: { flow: CampaignFlow }) {
  const { loadChecks } = flow;
  const ran = useRef(false);
  // Opening the step is the moment to check: it saves the draft first, so the checks read what will be sent. Once per
  // visit: the first save gives the draft its id, which renews `loadChecks`, and must not start a second round.
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void loadChecks();
  }, [loadChecks]);

  if (flow.refusal) return <Notice>{flow.refusal}</Notice>;
  if (flow.checks === null) return <p className="gr-hint">Checking…</p>;

  return (
    <ul className="gr-list">
      {flow.checks.map((c) => (
        <li key={c.key} className="gr-list-row">
          <div className="gr-grow">
            <p className="gr-row-title">{c.pass ? '✓' : c.blocking ? '✗' : '!'} {c.label}</p>
            <p className={c.pass ? 'gr-hint' : c.blocking ? 'gr-warning' : 'gr-hint'}>{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Review({ flow, options }: { flow: CampaignFlow; options: CampaignStepsOptions }) {
  const d = flow.draft;
  const topic = flow.topics.find((t) => t.key === d.topic)?.label;

  return (
    <div className="gr-stack">
      <Lead decides={d.when === 'now' ? 'Check it, then send.' : 'Check it, then schedule.'}>
        <p className="gr-hint">{d.when === 'now' ? 'It starts going out within a minute, at the pace you set.' : 'It starts going out at the time you chose.'} Until then it stays editable in the list.</p>
      </Lead>
      <ul className="gr-list">
        <li className="gr-hint"><strong>{d.subject}</strong></li>
        {d.preheader ? <li className="gr-hint">Preview text: {d.preheader}</li> : null}
        <li className="gr-hint">What: {d.kind === 'alert' ? 'an alert' : 'a newsletter'}{topic ? `, about ${topic}` : ''}</li>
        <li className="gr-hint">Who: {flow.reach === null ? 'still counting' : `${flow.reach.toLocaleString()} ${flow.reach === 1 ? 'person' : 'people'} today`}</li>
        <li className="gr-hint">When: {d.when === 'now' ? 'now' : new Date(d.at).toLocaleString()}</li>
      </ul>
      {flow.refusal ? <Notice>{flow.refusal}</Notice> : null}
      {flow.done ? <p className="gr-row-title">{flow.done.status === 'scheduled' ? `Scheduled. ${campaignProgress(flow.done)}.` : 'Sending. The list shows how many it has reached so far.'}</p> : null}
      {options.hostSubmits || flow.done ? null : (
        <div>
          <Button tone="primary" disabled={flow.submitting} onClick={() => void flow.submit()}>{flow.submitting ? 'Working…' : campaignVerb(flow)}</Button>
        </div>
      )}
    </div>
  );
}

export function campaignSteps(flow: CampaignFlow, options: CampaignStepsOptions = {}): CampaignStep[] {
  const d = flow.draft;

  return [
    {
      id: 'kind', title: 'What you are sending',
      validate: () => null,
      render: () => (
        <div className="gr-stack">
          <Lead decides="Choose the kind first; the rest follows from it.">
            <p className="gr-hint">A newsletter respects each person&apos;s pace: someone who chose every 2 weeks is not mailed twice inside that time. An alert goes the same day, only to people who asked for every update. You can change this until it goes out.</p>
          </Lead>
          <ChoiceGroup<'regular' | 'alert'> label="Kind" value={d.kind} options={[{ value: 'regular', label: 'Newsletter' }, { value: 'alert', label: 'Alert' }]} onChange={(kind) => flow.set({ kind })} />
        </div>
      ),
    },
    {
      id: 'who', title: 'Who it is for',
      validate: () => (d.target.mode === 'specific' && d.target.include.length === 0 ? 'Add at least one group, list or person, or choose everyone.' : null),
      render: () => (
        <div className="gr-stack">
          <Lead decides="Pick groups, lists and people, and leave anyone out.">
            <p className="gr-hint">Only people who said yes are ever mailed. Example: everyone, minus one list.</p>
          </Lead>
          <TargetPicker value={d.target} onChange={(target) => flow.set({ target })} />
          {flow.topics.length > 0 ? (
            <Field label="What is it about? (optional)" hint="With a topic, only people who chose it, or chose no topics, receive it: that is what their preferences promise.">
              {(id) => (
                <select id={id} className={INPUT} value={d.topic} onChange={(e) => flow.set({ topic: e.target.value })}>
                  <option value="">Everything (no single topic)</option>
                  {flow.topics.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              )}
            </Field>
          ) : null}
          <Reach flow={flow} />
        </div>
      ),
    },
    {
      id: 'content', title: 'What goes in it',
      validate: () => (d.subject.trim() === '' ? 'Write a subject line.' : textOf(d.bodyHtml).length < 20 ? 'Write the email (at least a couple of sentences).' : null),
      render: () => (
        <div className="gr-stack">
          <Lead decides="Write the subject and the email.">
            <p className="gr-hint">Example subject: Express Entry draw: 2,500 invitations at CRS 520. Nothing is sent from this step.</p>
          </Lead>
          <Field label="Subject">{(id) => <input id={id} className={INPUT} maxLength={255} value={d.subject} onChange={(e) => flow.set({ subject: e.target.value })} />}</Field>
          <Field label="Preview text (optional)" hint="Shown next to the subject in most inboxes.">
            {(id) => <input id={id} className={INPUT} maxLength={255} value={d.preheader} onChange={(e) => flow.set({ preheader: e.target.value })} />}
          </Field>
          {options.draftAction ?? null}
          <div className="gr-stack">
            <span className="gr-row-title">The email</span>
            <RichTextEditor
              variant="email"
              value={d.bodyHtml}
              onChange={(bodyHtml) => flow.set({ bodyHtml })}
              controls={['format', 'headings', 'lists', 'link']}
              placeholder="Write the email. Headings, lists and links are kept; the layout around it is added when it is sent."
              contentClassName="min-h-[220px]"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'checks', title: 'Is it safe to send',
      validate: () => {
        if (flow.checks === null) return flow.refusal ?? 'Wait for the checks to finish.';
        const red = flow.checks.find((c) => c.blocking && !c.pass);

        return red ? `Fix this first: ${red.detail}` : null;
      },
      render: () => (
        <div className="gr-stack">
          <Lead decides="Check it is safe to send.">
            <p className="gr-hint">A red check stops it, and says how to fix it. An amber one is worth knowing but does not stop it. The draft is saved as you reach this step.</p>
          </Lead>
          <Checks flow={flow} />
        </div>
      ),
    },
    {
      id: 'when', title: 'When it goes out',
      validate: () => (d.when === 'later' && !inFuture(d.at) ? 'Choose a time in the future, or send it now.' : null),
      render: () => (
        <div className="gr-stack">
          <Lead decides="Choose when it starts sending."><p className="gr-hint">Times are yours, in this computer&apos;s time zone. A scheduled one stays editable until its time comes.</p></Lead>
          <ChoiceGroup<'now' | 'later'> label="When" value={d.when} options={[{ value: 'now', label: 'As soon as I send it' }, { value: 'later', label: 'At a time I choose' }]} onChange={(when) => flow.set({ when })} />
          {d.when === 'later' ? <Field label="Starts">{(id) => <input id={id} type="datetime-local" className={INPUT} value={d.at} onChange={(e) => flow.set({ at: e.target.value })} />}</Field> : null}
        </div>
      ),
    },
    { id: 'review', title: 'Review and confirm', validate: () => null, render: () => <Review flow={flow} options={options} /> },
  ];
}
