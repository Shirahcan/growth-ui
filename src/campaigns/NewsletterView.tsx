import { useEffect, useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { momentLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { WelcomeSeriesView } from './WelcomeSeriesView';
import { Button, Card, ChoiceGroup, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';

/**
 * Growth > Newsletter on the shared service (G5d3): every newsletter and alert, its state, and what it did (sent,
 * opened, clicked). `newCampaign` is the host's way into its wizard; `onEdit` opens a draft there.
 */
export interface Campaign {
  uuid: string;
  kind: 'regular' | 'alert';
  subject: string;
  preheader: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  held_reason: string | null;
  topic: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  recipients_total: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  created_at: string | null;
  /** How its body is written: `pml` = designed (it can be previewed as sent and made into a template); `html` = written. */
  body_format?: 'pml' | 'html';
  /** A second subject: the campaign tests the two (G5e). */
  subject_b?: string | null;
  /** How the subject test stands: testing, waiting for the clicks, or decided (with the winner and each click rate). */
  subject_test?: SubjectTestState | null;
}

export interface SubjectTestState {
  phase: 'testing' | 'waiting' | 'decided';
  split_percent?: number;
  wait_hours?: number;
  winner?: 'a' | 'b';
  rates?: Record<'a' | 'b', { sent: number; clicked: number; rate: number }>;
}

/** The subject test in plain words, for the list; null when the campaign has one subject. */
export function subjectTestWords(c: Campaign): string | null {
  const t = c.subject_test;
  if (!c.subject_b) return null;
  if (!t) return `Tests two subjects: "${c.subject}" and "${c.subject_b}".`;
  if (t.phase === 'testing') return `Testing two subjects on ${t.split_percent ?? 10}% of the audience each.`;
  if (t.phase === 'waiting') return `Testing two subjects: the winner is picked ${t.wait_hours ?? 4} hours after the test sends.`;
  const pct = (v: 'a' | 'b') => `${Math.round((t.rates?.[v]?.rate ?? 0) * 1000) / 10}%`;
  const won = t.winner === 'b' ? c.subject_b : c.subject;

  return `"${won}" won: ${pct('a')} clicked subject A, ${pct('b')} clicked subject B. Everyone else got the winner.`;
}

type Filter = 'all' | 'regular' | 'alert';

const STATE: Record<Campaign['status'], { words: string; tone: 'muted' | 'accent' | 'good' | 'bad' }> = {
  draft: { words: 'Draft', tone: 'muted' },
  scheduled: { words: 'Scheduled', tone: 'accent' },
  sending: { words: 'Sending', tone: 'accent' },
  sent: { words: 'Sent', tone: 'good' },
  failed: { words: 'Failed', tone: 'bad' },
};

const people = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'person' : 'people'}`;

/** What it did, or when it goes, in plain words. */
export function campaignProgress(c: Campaign): string {
  if (c.status === 'draft') return 'Not sent yet';
  if (c.status === 'scheduled') return c.scheduled_at ? `Goes out ${momentLabel(c.scheduled_at)}` : 'Scheduled';
  const sent = c.status === 'sending' ? `Sent to ${people(c.sent_count)} of ${c.recipients_total.toLocaleString()} so far` : `Sent to ${people(c.sent_count)}`;
  const failed = c.failed_count > 0 ? `, ${c.failed_count.toLocaleString()} could not be delivered` : '';

  return `${sent}${failed}. Opened by ${c.open_count.toLocaleString()}, clicked by ${c.click_count.toLocaleString()}`;
}

export function NewsletterView({
  newCampaign,
  onEdit,
  onPreview,
  onSaveAsTemplate,
  showWelcome = true,
}: {
  newCampaign?: ReactNode;
  onEdit?: (uuid: string) => void;
  /**
   * A designed newsletter as its subscribers' inbox shows it, as its designer's "Preview as sent" (the host draws it).
   * Absent, or the newsletter is written rather than designed: no item.
   */
  onPreview?: (campaign: Campaign) => void;
  /** The Welcome series card below the list (G5g). On by default; a host that shows it elsewhere passes false. */
  showWelcome?: boolean;
  /**
   * A new template made from a designed newsletter, as its designer's "Save as a template" (the host's template flow).
   * Absent, or the newsletter is written (the service has no structure to make a template from): no item.
   */
  onSaveAsTemplate?: (campaign: Campaign) => void;
}) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [testing, setTesting] = useState<Campaign | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testError, setTestError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    request<Envelope<{ campaigns: Campaign[] }>>('GET', 'campaigns')
      .then((res) => {
        if (!live) return;
        setItems(unwrap(res).campaigns);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The newsletters could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function act(method: 'POST' | 'DELETE', path: string, message: string, after?: () => void) {
    setBusy(true);
    try {
      await request(method, path, {});
      notify(message);
      after?.();
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(c: Campaign) {
    setBusy(true);
    setTestError(null);
    try {
      await request('POST', `campaigns/${c.uuid}/test`, { email: testTo.trim() });
      notify(`Test sent to ${testTo.trim()}.`);
      setTesting(null);
    } catch (e) {
      const why = fieldError(e);
      if (why) setTestError(why);
      else onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) notify('Reference copied.');
    else onError(new Error('Copying was blocked by the browser. Select the reference and copy it instead.'));
  }

  const shown = (items ?? []).filter((c) => filter === 'all' || c.kind === filter);

  return (
    <>
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Newsletters</h2>
            <p className="gr-hint">Emails to people who said yes, at the pace they chose. Alerts reach only people who asked for every update.</p>
          </div>
          {canEdit ? newCampaign ?? null : null}
        </div>

        <ChoiceGroup<Filter> label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'regular', label: 'Newsletters' }, { value: 'alert', label: 'Alerts' }]} />

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>{items.length === 0 ? 'No newsletters yet. Write the first one; it goes only to people who said yes.' : 'Nothing of this kind yet.'}</Empty>
        ) : (
          <ul className="gr-list">
            {shown.map((c) => (
              <li key={c.uuid} className="gr-list-row">
                <div className="gr-grow">
                  {/* The title opens the newsletter, as its menu does (2026-11-26: only the kebab reached it): a draft to
                      edit, anything else to read when it has a preview. */}
                  {canEdit && onEdit && c.status === 'draft' ? (
                    <button type="button" className="gr-row-button" onClick={() => onEdit(c.uuid)} aria-label={`Continue editing ${c.subject}`}>
                      <span className="gr-row-title">{c.subject}</span>
                    </button>
                  ) : onPreview && c.body_format === 'pml' ? (
                    <button type="button" className="gr-row-button" onClick={() => onPreview(c)} aria-label={`Preview ${c.subject}`}>
                      <span className="gr-row-title">{c.subject}</span>
                    </button>
                  ) : (
                    <p className="gr-row-title">{c.subject}</p>
                  )}
                  <div className="gr-pills">
                    <Pill tone={c.held_reason ? 'bad' : STATE[c.status].tone}>{c.held_reason ? 'Held' : STATE[c.status].words}</Pill>
                    {c.kind === 'alert' ? <Pill tone="accent">Alert</Pill> : null}
                    <span className="gr-hint">{campaignProgress(c)}</span>
                  </div>
                  {subjectTestWords(c) ? <p className="gr-hint">{subjectTestWords(c)}</p> : null}
                  {c.held_reason ? <p className="gr-hint">Held: {c.held_reason}</p> : null}
                </div>
                <Kebab
                  label={`Actions for ${c.subject}`}
                  items={[
                    { label: 'Continue editing', hidden: !canEdit || !onEdit || c.status !== 'draft', onSelect: () => onEdit?.(c.uuid) },
                    { label: 'Send a test', hidden: !canEdit, onSelect: () => { setTesting(c); setTestTo(''); setTestError(null); } },
                    { label: 'Cancel schedule', hidden: !canEdit || c.status !== 'scheduled', onSelect: () => void act('POST', `campaigns/${c.uuid}/cancel`, 'Schedule cancelled. It is a draft again.') },
                    { label: 'Preview', hidden: !onPreview || c.body_format !== 'pml', onSelect: () => onPreview?.(c) },
                    { label: 'Save as a template', hidden: !canEdit || !onSaveAsTemplate || c.body_format !== 'pml', onSelect: () => onSaveAsTemplate?.(c) },
                    { label: 'Copy reference', onSelect: () => copy(c.uuid) },
                    { label: 'Delete draft', danger: true, hidden: !canEdit || c.status !== 'draft', onSelect: () => setDeleting(c) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {deleting ? (
        <Dialog
          title={`Delete "${deleting.subject}"?`}
          description="Nobody has received this draft. Deleting it cannot be undone."
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Keep it</Button>
              <Button tone="danger" disabled={busy} onClick={() => void act('DELETE', `campaigns/${deleting.uuid}`, 'Draft deleted.', () => setDeleting(null))}>Delete draft</Button>
            </>
          }
        >
          <p className="gr-hint">{deleting.kind === 'alert' ? 'An alert' : 'A newsletter'} written {deleting.created_at ? momentLabel(deleting.created_at) : 'earlier'}.</p>
        </Dialog>
      ) : null}

      {testing ? (
        <Dialog
          title="Send a test"
          description="One copy, exactly as people will see it, marked as a test. It is not counted and nobody else receives it."
          onClose={() => setTesting(null)}
          footer={
            <>
              <Button onClick={() => setTesting(null)}>Cancel</Button>
              <Button tone="primary" disabled={busy || testTo.trim() === ''} onClick={() => void sendTest(testing)}>Send the test</Button>
            </>
          }
        >
          <Field label="Send it to" error={testError}>
            {(id) => <input id={id} type="email" className={INPUT} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />}
          </Field>
        </Dialog>
      ) : null}
    </Card>
    {/* G5g: the welcome series a new subscriber gets after confirming, on the same tab. */}
    {showWelcome ? <WelcomeSeriesView /> : null}
    </>
  );
}
