import { useEffect, useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { momentLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';

/**
 * Growth > Announcements (G5c3c): every announcement the product has written on the shared service, what state it is
 * in and how many people it reached. An announcement is shown INSIDE the product (a banner, an inbox message) to people
 * on the platform; it is not a newsletter. `newAnnouncement` is the host's way into its wizard (`announcementSteps()`).
 */
export interface Announcement {
  uuid: string;
  subject: string;
  state: 'draft' | 'scheduled' | 'live' | 'ended';
  presentation: { surfaces?: string[]; requires_ack?: boolean } | null;
  scheduled_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  ended_at: string | null;
  /** How many people the product showed it to, reported back after publishing. */
  recipients_total: number;
  /** When the product reported that reach; null until then, when the reach is unknown (never 0). */
  delivered_at?: string | null;
}

const STATE_WORDS: Record<Announcement['state'], string> = { draft: 'Draft', scheduled: 'Scheduled', live: 'Showing now', ended: 'Ended' };

const STATE_TONE: Record<Announcement['state'], 'muted' | 'accent' | 'good' | 'bad'> = { draft: 'muted', scheduled: 'accent', live: 'good', ended: 'muted' };

/** One line on when it shows and whom it reached, in the viewer's own time zone. */
export function announcementTiming(a: Announcement): string {
  if (a.state === 'draft') return 'Not published yet';
  if (a.state === 'scheduled') return a.scheduled_at ? `Publishes ${momentLabel(a.scheduled_at)}` : 'Scheduled';
  if (a.delivered_at === null) {
    // Published, but the product has not said how many it reached yet (it does within a minute).
    if (a.state === 'live') return 'Being delivered. The number reached shows here within a minute';
    const over = a.ended_at ?? a.expires_at;

    return over ? `Ended ${momentLabel(over)}` : 'Ended';
  }
  const reached = a.recipients_total === 1 ? 'Shown to 1 person' : `Shown to ${a.recipients_total.toLocaleString()} people`;
  if (a.state === 'live') return a.expires_at ? `${reached}. Ends ${momentLabel(a.expires_at)}` : reached;
  const ended = a.ended_at ?? a.expires_at;

  return ended ? `${reached}. Ended ${momentLabel(ended)}` : reached;
}

export function AnnouncementsView({ newAnnouncement }: { newAnnouncement?: ReactNode }) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirming, setConfirming] = useState<{ a: Announcement; act: 'publish' | 'end' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    request<Envelope<{ announcements: Announcement[] }>>('GET', 'announcements')
      .then((res) => {
        if (!live) return;
        setItems(unwrap(res).announcements);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The announcements could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function act(a: Announcement, verb: 'publish' | 'end') {
    setBusy(true);
    try {
      await request('POST', `announcements/${a.uuid}/${verb}`, {});
      notify(verb === 'publish' ? 'Published. It shows to the people it was written for within a minute.' : 'Ended. It no longer shows to anyone.');
      setConfirming(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) notify('Reference copied.');
    else onError(new Error('Copying was blocked by the browser. Select the reference and copy it instead.'));
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Announcements</h2>
            <p className="gr-hint">Notices shown inside the platform, as a banner or an inbox message, to the people you pick.</p>
          </div>
          {canEdit ? newAnnouncement ?? null : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>No announcements yet. Tell clients, consultants or employers about something new, right where they work.</Empty>
        ) : (
          <ul className="gr-list">
            {items.map((a) => (
              <li key={a.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{a.subject}</p>
                  <div className="gr-pills">
                    <Pill tone={STATE_TONE[a.state]}>{STATE_WORDS[a.state]}</Pill>
                    <span className="gr-hint">{announcementTiming(a)}</span>
                  </div>
                </div>
                <Kebab
                  label={`Actions for ${a.subject}`}
                  items={[
                    { label: 'Publish now', hidden: !canEdit || (a.state !== 'draft' && a.state !== 'scheduled'), onSelect: () => setConfirming({ a, act: 'publish' }) },
                    { label: 'Copy reference', onSelect: () => copy(a.uuid) },
                    { label: 'End early', danger: true, hidden: !canEdit || a.state !== 'live', onSelect: () => setConfirming({ a, act: 'end' }) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirming ? (
        <Dialog
          title={confirming.act === 'publish' ? `Publish "${confirming.a.subject}" now?` : `End "${confirming.a.subject}" now?`}
          description={
            confirming.act === 'publish'
              ? 'It starts showing to everyone it was written for within a minute. You can end it early later.'
              : 'It stops showing to everyone at once. People who already saw it keep any inbox message they received.'
          }
          onClose={() => setConfirming(null)}
          footer={
            <>
              <Button onClick={() => setConfirming(null)}>Cancel</Button>
              <Button tone={confirming.act === 'end' ? 'danger' : 'primary'} disabled={busy} onClick={() => act(confirming.a, confirming.act)}>
                {confirming.act === 'publish' ? 'Publish now' : 'End early'}
              </Button>
            </>
          }
        >
          <p className="gr-hint">{announcementTiming(confirming.a)}</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
