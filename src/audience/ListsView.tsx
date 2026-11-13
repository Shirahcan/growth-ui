import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';

/**
 * Growth > Audience > Lists (G4e4b2): named groups of people a campaign can target (a webinar's sign-ups,
 * an imported list). "Reach" is who a send would really get today (subscribed, consent current, not
 * paused, not blocked), so it can be lower than the member count, and the row says so.
 */
export interface MailingList {
  uuid: string;
  name: string;
  description: string | null;
  origin: 'manual' | 'import' | 'landing';
  members: number;
  reachable: number;
  created_at: string | null;
}

const ORIGIN_WORDS: Record<string, string> = { manual: 'Made here', import: 'Imported', landing: 'From a landing page' };

export function ListsView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [lists, setLists] = useState<MailingList[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ list: MailingList | null; name: string; description: string } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MailingList | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ lists: MailingList[] }>>('GET', 'audience/lists')
      .then((res) => {
        if (!live) return;
        setLists(unwrap(res).lists);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The lists could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function save() {
    if (!editing) return;
    setRefused(null);
    const body = { name: editing.name.trim(), description: editing.description.trim() || null };
    try {
      if (editing.list) await request('PUT', `audience/lists/${editing.list.uuid}`, body);
      else await request('POST', 'audience/lists', body);
      notify(editing.list ? 'List saved.' : 'List created.');
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    }
  }

  async function remove(list: MailingList) {
    try {
      await request('DELETE', `audience/lists/${list.uuid}`, {});
      notify('List removed. Its people stay subscribed.');
      setRemoving(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) notify('List reference copied.');
    else onError(new Error('Copying was blocked by the browser. Select the reference and copy it instead.'));
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Lists</h2>
            <p className="gr-hint">Groups of people you can send a campaign to. Being on a list is not consent: a send only reaches people who may be emailed today.</p>
          </div>
          {canEdit ? <Button tone="primary" onClick={() => setEditing({ list: null, name: '', description: '' })}>New list</Button> : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : lists === null ? (
          <Loading />
        ) : lists.length === 0 ? (
          <Empty>No lists yet. Make one for a webinar or an event, or import a list of past clients.</Empty>
        ) : (
          <ul className="gr-list">
            {lists.map((l) => (
              <li key={l.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{l.name}</p>
                  <div className="gr-pills">
                    <Pill>{ORIGIN_WORDS[l.origin] ?? l.origin}</Pill>
                    <span className="gr-hint">
                      {l.members} {l.members === 1 ? 'member' : 'members'}, {l.reachable} reachable today
                    </span>
                  </div>
                  {l.description ? <p className="gr-hint">{l.description}</p> : null}
                </div>
                <Kebab
                  label={`Actions for ${l.name}`}
                  items={[
                    { label: 'Rename', hidden: !canEdit, onSelect: () => setEditing({ list: l, name: l.name, description: l.description ?? '' }) },
                    { label: 'Copy reference', onSelect: () => copy(l.uuid) },
                    { label: 'Remove list', danger: true, hidden: !canEdit, onSelect: () => setRemoving(l) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <Dialog
          title={editing.list ? 'Rename list' : 'New list'}
          description="A name your team will recognise when picking who a campaign goes to."
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button tone="primary" disabled={editing.name.trim() === ''} onClick={save}>{editing.list ? 'Save list' : 'Create list'}</Button>
            </>
          }
        >
          <div className="gr-stack">
            <Field label="Name" hint="Example: November webinar sign-ups." error={refused}>
              {(id) => <input id={id} className={INPUT} maxLength={120} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
            </Field>
            <Field label="Note for your team (optional)">
              {(id) => <textarea id={id} className={INPUT} rows={2} maxLength={500} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />}
            </Field>
          </div>
        </Dialog>
      ) : null}

      {removing ? (
        <Dialog
          title={`Remove "${removing.name}"?`}
          description="Only the grouping goes. Everyone on it stays subscribed, and saved audiences that used this list stop matching it."
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Keep list</Button>
              <Button tone="danger" onClick={() => remove(removing)}>Remove list</Button>
            </>
          }
        >
          <p className="gr-hint">{removing.members} {removing.members === 1 ? 'person is' : 'people are'} on it today.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
