import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Card, Dialog, Field, INPUT, Kebab, Loading, Pill, copyText } from '../ui/primitives';
import { fromNow } from './dates';
import { unwrap, type Envelope, type RadarSignal, type RadarStalePost } from './types';

/**
 * Plan > Updates radar (source: Portify `PlanRadarView`, G3e2): official changes caught by the
 * service's watchers, each with its post-by target.
 *
 * Host actions until posts and campaigns move (G7a/G5): `onDraftFromSignal` (without it the draft
 * button is not shown) and `loadStalePosts` (without it the stale-posts section is not shown).
 */

function TimeLeft({ postBy }: { postBy: string | null }) {
  if (!postBy) return null;
  const overdue = new Date(postBy).getTime() < Date.now();

  return <Pill tone={overdue ? 'bad' : 'accent'}>{overdue ? `Target passed ${fromNow(postBy)}` : `Post ${fromNow(postBy)}`}</Pill>;
}

export interface PlanRadarViewProps {
  /** Host action until G7a: draft a post and a newsletter item from the signal; resolves to the message. */
  onDraftFromSignal?: (signal: RadarSignal) => Promise<string | void>;
  /** Host data until posts move: live posts quoting a changed fact. */
  loadStalePosts?: () => Promise<RadarStalePost[]>;
}

export function PlanRadarView({ onDraftFromSignal, loadStalePosts }: PlanRadarViewProps) {
  const { request, notify, onError, words, Link, areaHref, canEdit } = useGrowth();
  const [radar, setRadar] = useState<{ enabled: boolean; signals: RadarSignal[] } | null>(null);
  const [stale, setStale] = useState<RadarStalePost[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafting, setDrafting] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<RadarSignal | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let live = true;
    request<Envelope<{ enabled?: boolean; signals: RadarSignal[] }>>('GET', 'plan/radar')
      .then((body) => {
        const data = unwrap(body);
        if (live) setRadar({ enabled: data.enabled !== false, signals: data.signals });
      })
      .catch((e) => live && onError(e));
    if (loadStalePosts) {
      loadStalePosts()
        .then((posts) => live && setStale(posts))
        .catch((e) => live && onError(e));
    }

    return () => {
      live = false;
    };
  }, [request, onError, loadStalePosts, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function draft(signal: RadarSignal) {
    if (!onDraftFromSignal) return;
    setDrafting(signal.id);
    try {
      notify((await onDraftFromSignal(signal)) || 'Draft started.');
      reload();
    } catch (e) {
      onError(e);
    } finally {
      setDrafting(null);
    }
  }

  async function dismiss() {
    if (!dismissing) return;
    try {
      await request('POST', `plan/radar/${dismissing.id}/dismiss`, { reason: reason.trim() });
      notify('Dismissed.');
      setDismissing(null);
      setReason('');
      reload();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <div className="gr-stack">
      {radar && !radar.enabled ? <p className="gr-warning">The updates radar is switched off, so nothing new is being caught.</p> : null}

      <Card>
        <h2 className="gr-section-title">Caught from official sources</h2>
        {radar === null ? (
          <Loading />
        ) : radar.signals.length === 0 ? (
          <p className="gr-hint">Nothing new. The sources in Growth settings keep being checked.</p>
        ) : (
          <ul className="gr-list">
            {radar.signals.map((s) => (
              <li key={s.id} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{s.title}</p>
                  <p className="gr-row-detail">{s.detail}</p>
                  <div className="gr-pills">
                    {s.status === 'new' ? <TimeLeft postBy={s.post_by} /> : null}
                    {s.source_name ? <span className="gr-hint">From {s.source_name}</span> : null}
                  </div>
                </div>
                <div className="gr-row-actions">
                  {s.status === 'new' ? (
                    canEdit && onDraftFromSignal ? (
                      <Button tone="primary" disabled={drafting !== null} onClick={() => void draft(s)}>
                        {drafting === s.id ? `${words.assistant} is drafting…` : 'Draft post and newsletter item'}
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {s.post_uuid ? (
                        <Link href={areaHref(`blog/${s.post_uuid}`)} className="gr-button gr-button-primary">
                          Open the post
                        </Link>
                      ) : null}
                      {s.campaign_uuid ? (
                        <Link href={areaHref(`newsletter/compose?id=${s.campaign_uuid}`)} className="gr-button gr-button-quiet">
                          Open the newsletter item
                        </Link>
                      ) : null}
                    </>
                  )}
                  <Kebab
                    label={`Actions for ${s.title}`}
                    items={[
                      {
                        label: 'Copy official link',
                        hidden: !s.source_url,
                        onSelect: () => void copyText(s.source_url ?? '').then((ok) => (ok ? notify('Link copied.') : onError(new Error('Could not copy the link to your clipboard.')))),
                      },
                      { label: 'Dismiss', hidden: !canEdit || s.status !== 'new', onSelect: () => setDismissing(s) },
                    ]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {loadStalePosts ? (
        <Card>
          <h2 className="gr-section-title">Posts quoting changed facts</h2>
          {stale.length === 0 ? (
            <p className="gr-hint">Every live post still matches its sources.</p>
          ) : (
            <ul className="gr-list">
              {stale.map((p) => (
                <li key={p.uuid} className="gr-list-row">
                  <div className="gr-grow">
                    <p className="gr-row-title">{p.title}</p>
                    <p className="gr-row-detail">{p.stale_reason}</p>
                  </div>
                  <Link href={areaHref(`blog/${p.uuid}`)} className="gr-button gr-button-quiet">
                    Update post
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {dismissing ? (
        <Dialog
          title="Dismiss this update?"
          description={`${dismissing.title}. It leaves the radar, and the reason is kept.`}
          onClose={() => setDismissing(null)}
          footer={
            <>
              <Button onClick={() => setDismissing(null)}>Cancel</Button>
              <Button tone="primary" disabled={!reason.trim()} onClick={() => void dismiss()}>
                Dismiss
              </Button>
            </>
          }
        >
          <Field label="Why does this not need a post?">
            {(id) => <textarea id={id} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} />}
          </Field>
        </Dialog>
      ) : null}
    </div>
  );
}
