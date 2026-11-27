import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import { WelcomeSeriesEditor, type WelcomeChoices, type WelcomeSeries } from './WelcomeSeriesEditor';

/** Who a series is for, in plain words. */
export function welcomeAudience(s: WelcomeSeries, choices: WelcomeChoices): string {
  if (s.trigger_kind === 'topic') return `People who chose ${choices.topics.find((t) => t.key === s.trigger_value)?.label ?? 'a topic'}`;
  if (s.trigger_kind === 'landing') return `People who signed up on ${choices.pages.find((p) => p.uuid === s.trigger_value)?.name ?? 'a landing page'}`;

  return 'Everyone who confirms';
}

/**
 * The Newsletter tab's Welcome series card (shared program G5g): each series with who it is for, how many emails, and
 * how many people are in it, finished it or stopped. Its menu edits, switches it on or off, copies its reference, and
 * deletes it (confirmed). Switching one on starts it only for people who confirm from then on.
 */
export function WelcomeSeriesView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [items, setItems] = useState<WelcomeSeries[] | null>(null);
  const [choices, setChoices] = useState<WelcomeChoices>({ topics: [], pages: [] });
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ series: WelcomeSeries | null } | null>(null);
  const [deleting, setDeleting] = useState<WelcomeSeries | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ series: WelcomeSeries[] }>>('GET', 'welcome-series')
      .then((res) => {
        if (live) {
          setItems(unwrap(res).series ?? []);
          setFailed(null);
        }
      })
      .catch((e) => {
        if (!live) return;
        setFailed('The welcome series could not be loaded.');
        onError(e);
      });
    // What a series can be for: the product's topics and its landing pages. Either may be missing; the choice is then off.
    Promise.allSettled([
      request<Envelope<{ audience: { topics: Array<{ key: string; label: string }> | null } }>>('GET', 'settings/audience'),
      request<Envelope<{ pages: Array<{ uuid: string; name: string }> }>>('GET', 'landing-pages'),
    ]).then(([a, p]) => {
      if (!live) return;
      setChoices({
        topics: a.status === 'fulfilled' ? unwrap(a.value)?.audience?.topics ?? [] : [],
        pages: p.status === 'fulfilled' ? (unwrap(p.value)?.pages ?? []).map((x) => ({ uuid: x.uuid, name: x.name })) : [],
      });
    });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function toggle(s: WelcomeSeries) {
    try {
      await request('PUT', `welcome-series/${s.uuid}`, { name: s.name, trigger_kind: s.trigger_kind, trigger_value: s.trigger_value, is_active: !s.is_active, steps: s.steps });
      notify(s.is_active ? 'Switched off. Nobody new starts it, and nothing more is sent from it.' : 'Switched on. People who confirm from now on receive it.');
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function remove(s: WelcomeSeries) {
    try {
      await request('DELETE', `welcome-series/${s.uuid}`);
      notify('Welcome series deleted.');
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function copy(uuid: string) {
    if (await copyText(uuid)) notify('Reference copied.');
    else onError(new Error('Copying was blocked by the browser. Select the reference and copy it instead.'));
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Welcome series</h2>
            <p className="gr-hint">A few emails a new subscriber gets after they confirm, in order. Each is checked when it is due: nobody who unsubscribed, paused or got a newsletter that day receives one.</p>
          </div>
          {canEdit ? <Button tone="primary" onClick={() => setEditing({ series: null })}>New welcome series</Button> : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>No welcome series yet. Write one, and new subscribers get it after they confirm.</Empty>
        ) : (
          <ul className="gr-list">
            {items.map((s) => (
              <li key={s.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <div className="gr-row-between">
                    <span className="gr-row-title">{s.name}</span>
                    <Pill tone={s.is_active ? 'good' : 'muted'}>{s.is_active ? 'On' : 'Off'}</Pill>
                  </div>
                  <span className="gr-hint">
                    {welcomeAudience(s, choices)}. {s.steps.length} {s.steps.length === 1 ? 'email' : 'emails'}. {s.people.in_progress} in it now, {s.people.finished} finished
                    {s.people.stopped > 0 ? `, ${s.people.stopped} stopped (unsubscribed or no longer reachable)` : ''}.
                  </span>
                </div>
                <Kebab
                  label={`Actions for ${s.name}`}
                  items={[
                    { label: 'Edit', hidden: !canEdit, onSelect: () => setEditing({ series: s }) },
                    { label: s.is_active ? 'Switch off' : 'Switch on', hidden: !canEdit, onSelect: () => void toggle(s) },
                    { label: 'Copy reference', onSelect: () => void copy(s.uuid) },
                    { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setDeleting(s) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <WelcomeSeriesEditor
          series={editing.series}
          choices={choices}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {deleting ? (
        <Dialog
          title={`Delete ${deleting.name}?`}
          description="Nobody new starts it, and the people in it get no more of its emails. What was already sent stays in the record. This cannot be undone."
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button tone="danger" onClick={() => { const s = deleting; setDeleting(null); void remove(s); }}>Delete</Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
    </Card>
  );
}
