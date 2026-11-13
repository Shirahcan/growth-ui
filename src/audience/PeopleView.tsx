import { useEffect, useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { dayLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, ChoiceGroup, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import { PersonSheet } from './PersonSheet';
import type { PeoplePage, Person, PersonSheet as Sheet } from './types';

/**
 * Growth > Audience > People (G4e4b1): everyone on the product's list, pending included, searchable and
 * filterable; a row opens the person sheet. Counts come from the service, never from this page.
 */
export interface PeopleViewProps {
  /** The host's own facts about a person, drawn in the sheet (see PersonSheet). */
  personExtras?: (person: Sheet) => ReactNode;
  /** Start from a source ("landing:study-guide") when the host links here from a page's results. */
  initialSource?: string;
}

type StatusFilter = 'all' | 'subscribed' | 'pending' | 'unsubscribed';

const STATUS_WORDS: Record<string, string> = { pending: 'Waiting to confirm', subscribed: 'Subscribed', unsubscribed: 'Unsubscribed' };

export function PeopleView({ personExtras, initialSource }: PeopleViewProps) {
  const { request, notify, onError, canEdit, words } = useGrowth();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [audience, setAudience] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PeoplePage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [stopping, setStopping] = useState<Person | null>(null);

  // Search waits for a pause in typing, so each keystroke is not a request.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ page: String(page), per_page: '25' });
    if (query) params.set('q', query);
    if (status !== 'all') params.set('status', status);
    if (audience) params.set('audience', audience);
    if (initialSource) params.set('source', initialSource);
    request<Envelope<PeoplePage>>('GET', `audience/subscribers?${params.toString()}`)
      .then((res) => {
        if (!live) return;
        setData(unwrap(res));
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The audience could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, query, status, audience, page, initialSource, reloadKey]);

  async function copy(text: string) {
    if (await copyText(text)) notify('Address copied.');
    else onError(new Error('Copying was blocked by the browser. Select the address and copy it instead.'));
  }

  async function stop(person: Person) {
    try {
      await request('POST', `audience/subscribers/${person.uuid}/suppress`, {});
      notify('This person will not be emailed.');
      setStopping(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  const audienceOptions = Object.entries(words.audiences);

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">People</h2>
          <p className="gr-hint">Everyone who may hear from {words.product}, including people still confirming. Open someone to see why we may write to them.</p>
        </div>

        <div className="gr-filters">
          <Field label="Search by email address">
            {(id) => <input id={id} className={INPUT} value={q} onChange={(e) => setQ(e.target.value)} placeholder="name@example.com" />}
          </Field>
          {audienceOptions.length > 0 ? (
            <Field label="Who they are">
              {(id) => (
                <select id={id} className={INPUT} value={audience} onChange={(e) => { setAudience(e.target.value); setPage(1); }}>
                  <option value="">Everyone</option>
                  {audienceOptions.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                  <option value="unknown">Not told us yet</option>
                </select>
              )}
            </Field>
          ) : null}
        </div>
        <ChoiceGroup<StatusFilter>
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { value: 'all', label: 'All' },
            { value: 'subscribed', label: 'Subscribed' },
            { value: 'pending', label: 'Waiting to confirm' },
            { value: 'unsubscribed', label: 'Unsubscribed' },
          ]}
        />

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : data === null ? (
          <Loading />
        ) : data.people.length === 0 ? (
          <Empty>{query || status !== 'all' || audience ? 'Nobody matches these filters.' : `Nobody is on ${words.product}'s list yet. People appear here when they sign up or you import a list.`}</Empty>
        ) : (
          <>
            <ul className="gr-list">
              {data.people.map((p) => (
                <li key={p.uuid} className="gr-list-row">
                  <button type="button" className="gr-row-button gr-grow" onClick={() => setOpen(p.uuid)}>
                    <span className="gr-row-title">{p.email}</span>
                    <span className="gr-pills">
                      <Pill tone={p.status === 'subscribed' ? 'good' : p.status === 'pending' ? 'accent' : 'muted'}>{STATUS_WORDS[p.status] ?? p.status}</Pill>
                      {p.audience ? <Pill>{words.audiences[p.audience] ?? p.audience}</Pill> : null}
                      {p.since ? <span className="gr-hint">Since {dayLabel(p.since)}</span> : null}
                    </span>
                  </button>
                  <Kebab
                    label={`Actions for ${p.email}`}
                    items={[
                      { label: 'Open', onSelect: () => setOpen(p.uuid) },
                      { label: 'Copy address', onSelect: () => copy(p.email) },
                      { label: 'Stop emailing', danger: true, hidden: !canEdit || p.status === 'unsubscribed', onSelect: () => setStopping(p) },
                    ]}
                  />
                </li>
              ))}
            </ul>
            <div className="gr-pager">
              <span>
                {data.meta.total} {data.meta.total === 1 ? 'person' : 'people'}, page {data.meta.current_page} of {data.meta.last_page}
              </span>
              <span className="gr-row-actions">
                <Button disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
                <Button disabled={page >= data.meta.last_page} onClick={() => setPage((n) => n + 1)}>Next</Button>
              </span>
            </div>
          </>
        )}
      </div>

      {open ? <PersonSheet uuid={open} onClose={() => setOpen(null)} onChanged={() => setReloadKey((k) => k + 1)} extras={personExtras} /> : null}

      {stopping ? (
        <Dialog
          title="Stop emailing this person?"
          description={`${stopping.email} is unsubscribed and blocked here, so no campaign reaches them. They can sign up again themselves; an import cannot add them back.`}
          onClose={() => setStopping(null)}
          footer={
            <>
              <Button onClick={() => setStopping(null)}>Keep them</Button>
              <Button tone="danger" onClick={() => stop(stopping)}>Stop emailing</Button>
            </>
          }
        >
          <p className="gr-hint">The change also reaches {words.product}&apos;s own copy of the list.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
