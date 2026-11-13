import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Card, ChoiceGroup, Dialog, Field, INPUT, Kebab, Loading, Notice, Pill, copyText } from '../ui/primitives';
import { dayLabel, monthLabel, shiftMonth } from './dates';
import { unwrap, type Envelope, type PlanIdea, type PlanIdeas, type SkipReason } from './types';

/**
 * Plan > Ideas (source: Portify `PlanIdeasView`, G3e2). The service writes these when this view opens,
 * from what people really asked, so each one shows where it came from. Accept is the row's main verb;
 * everything else sits in the kebab.
 *
 * `onStartDraft` is a HOST action until posts move (G7a): without it, "Start the post" is not shown.
 */

const FORMATS: Record<string, string> = { blog: 'Blog', newsletter: 'Newsletter', linkedin: 'LinkedIn' };
const SKIP_WORDS: Record<SkipReason, string> = {
  already_covered: 'We already covered this',
  not_our_audience: 'Not our audience',
  wrong_timing: 'Wrong timing',
  other: 'Something else',
};

export function MonthNav({ month, onMonth }: { month: string; onMonth: (m: string) => void }) {
  return (
    <div className="gr-month-nav">
      <button type="button" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))} className="gr-kebab">
        ‹
      </button>
      <span className="gr-month-label">{monthLabel(month)}</span>
      <button type="button" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))} className="gr-kebab">
        ›
      </button>
    </div>
  );
}

export interface PlanIdeasViewProps {
  month: string;
  onMonth: (month: string) => void;
  /** Host action until G7a: start the idea's draft post; resolves to the message to show. */
  onStartDraft?: (idea: PlanIdea) => Promise<string | void>;
}

export function PlanIdeasView({ month, onMonth, onStartDraft }: PlanIdeasViewProps) {
  const { request, notify, onError, words, Link, areaHref, canEdit } = useGrowth();
  const [loaded, setLoaded] = useState<{ month: string; plan: PlanIdeas } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState<PlanIdea | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<PlanIdeas>>('GET', `plan/ideas?month=${encodeURIComponent(month)}`)
      .then((body) => live && setLoaded({ month, plan: unwrap(body) }))
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError, month, reloadKey]);

  const plan = loaded?.month === month ? loaded.plan : null;
  const reload = () => setReloadKey((k) => k + 1);

  async function act(path: string, body: Record<string, unknown>, done: string) {
    try {
      await request('POST', path, body);
      notify(done);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function more() {
    setBusy(true);
    try {
      setLoaded({ month, plan: unwrap(await request<Envelope<PlanIdeas>>('POST', `plan/ideas/more?month=${encodeURIComponent(month)}`, {})) });
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function startDraft(idea: PlanIdea) {
    if (!onStartDraft) return;
    try {
      notify((await onStartDraft(idea)) || 'Draft post started.');
      reload();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="gr-stack">
      <div className="gr-row-between">
        <div>
          <MonthNav month={month} onMonth={onMonth} />
          {plan ? (
            <p className="gr-hint">
              Plan due {dayLabel(plan.plan_due)}. {plan.accepted} accepted.
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <Button disabled={busy || plan === null} onClick={() => void more()}>
            {busy ? 'Suggesting…' : 'Suggest more'}
          </Button>
        ) : null}
      </div>

      <Card>
        {plan === null ? (
          <Loading label={`${words.assistant} is reading what people asked this month…`} />
        ) : (
          <>
            {(plan.notices ?? []).map((n) => (
              <Notice key={n}>{n}</Notice>
            ))}
            {plan.ideas.length === 0 ? (
              <p className="gr-empty">Nothing to suggest yet. Ideas come from questions {words.assistant} could not answer, official changes and what people ask for.</p>
            ) : (
              <>
                <p className="gr-hint">{words.assistant} writes these when you open this tab. Each shows where the idea came from.</p>
                <ul className="gr-list">
                  {plan.ideas.map((idea) => (
                    <li key={idea.uuid} className={`gr-list-row${idea.status === 'skipped' ? ' gr-dim' : ''}`}>
                      <div className="gr-grow">
                        <p className="gr-row-title">{idea.title}</p>
                        <p className="gr-row-detail">{idea.why}</p>
                        <div className="gr-pills">
                          <Pill>{words.audiences[idea.audience] ?? idea.audience}</Pill>
                          {idea.formats.map((f) => (
                            <Pill key={f}>{FORMATS[f] ?? f}</Pill>
                          ))}
                          {idea.status === 'skipped' && idea.skip_reason ? <Pill>Skipped: {SKIP_WORDS[idea.skip_reason]}</Pill> : null}
                        </div>
                      </div>
                      <div className="gr-row-actions">
                        {canEdit && idea.status === 'idea' ? (
                          <Button tone="primary" onClick={() => void act(`plan/ideas/${idea.uuid}/accept`, {}, 'Added to the plan.')}>
                            Accept
                          </Button>
                        ) : null}
                        {canEdit && idea.status === 'accepted' ? (
                          <>
                            <label htmlFor={`idea-date-${idea.uuid}`} className="gr-sr-only">
                              Planned for
                            </label>
                            <input
                              id={`idea-date-${idea.uuid}`}
                              type="date"
                              value={idea.planned_for ?? ''}
                              onChange={(e) => e.target.value && void act(`plan/ideas/${idea.uuid}/schedule`, { planned_for: e.target.value }, 'Date changed.')}
                              className={INPUT}
                            />
                            {onStartDraft ? (
                              <Button tone="primary" onClick={() => void startDraft(idea)}>
                                Start the post
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {idea.post_uuid ? (
                          <Link href={areaHref(`blog/${idea.post_uuid}`)} className="gr-button gr-button-quiet">
                            Open the post
                          </Link>
                        ) : null}
                        <Kebab
                          label={`Actions for ${idea.title}`}
                          items={[
                            { label: 'Skip', hidden: !canEdit || idea.status !== 'idea', onSelect: () => setSkipping(idea) },
                            {
                              label: 'Undo',
                              hidden: !canEdit || (idea.status !== 'accepted' && idea.status !== 'skipped'),
                              onSelect: () => void act(`plan/ideas/${idea.uuid}/undo`, {}, 'Back in the ideas.'),
                            },
                            {
                              label: 'Copy title',
                              onSelect: () => void copyText(idea.title).then((ok) => (ok ? notify('Title copied.') : onError(new Error('Could not copy the title to your clipboard.')))),
                            },
                          ]}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Card>

      {skipping ? (
        <SkipDialog
          key={skipping.uuid}
          idea={skipping}
          assistant={words.assistant}
          onClose={() => setSkipping(null)}
          onSkip={(reason, note) => {
            const uuid = skipping.uuid;
            setSkipping(null);
            void act(`plan/ideas/${uuid}/skip`, { reason, note }, `Skipped. ${words.assistant} will use the reason.`);
          }}
        />
      ) : null}
    </div>
  );
}

function SkipDialog({ idea, assistant, onClose, onSkip }: { idea: PlanIdea; assistant: string; onClose: () => void; onSkip: (reason: SkipReason, note: string | null) => void }) {
  const [reason, setReason] = useState<SkipReason>('already_covered');
  const [note, setNote] = useState('');

  return (
    <Dialog
      title="Skip this idea?"
      description={`${assistant} uses the reason so it stops suggesting things you do not want. Wrong timing can come back next month.`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={() => onSkip(reason, note.trim() || null)}>
            Skip this idea
          </Button>
        </>
      }
    >
      <div className="gr-stack">
        <p className="gr-row-title">{idea.title}</p>
        <ChoiceGroup<SkipReason>
          label="Why skip this idea"
          value={reason}
          onChange={setReason}
          options={(Object.keys(SKIP_WORDS) as SkipReason[]).map((key) => ({ value: key, label: SKIP_WORDS[key] }))}
        />
        <Field label="A note (optional)">
          {(id) => <textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} />}
        </Field>
      </div>
    </Dialog>
  );
}
