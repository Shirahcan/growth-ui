import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import { TargetPicker, type Target } from './TargetPicker';

/**
 * Growth > Audience > Saved audiences (G4e4b2): a pick of people kept under a name, so a campaign can reuse
 * it ("Paid clients who chose Express Entry"). Reach is counted live; when the product's own groups cannot
 * be read the reach is UNKNOWN and the row says why, never 0.
 */
export interface SavedAudience {
  uuid: string;
  name: string;
  description: string | null;
  definition: { target?: Target } & Record<string, unknown>;
  reach: number | null;
  reach_unavailable?: string;
  updated_at: string | null;
}

const EMPTY: Target = { mode: 'specific', include: [], exclude: [] };

export function SegmentsView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [items, setItems] = useState<SavedAudience[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ item: SavedAudience | null; name: string; target: Target } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SavedAudience | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ segments: SavedAudience[] }>>('GET', 'audience/segments')
      .then((res) => {
        if (!live) return;
        setItems(unwrap(res).segments);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The saved audiences could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function save() {
    if (!editing) return;
    setRefused(null);
    const body = { name: editing.name.trim(), definition: { target: editing.target } };
    try {
      if (editing.item) await request('PUT', `audience/segments/${editing.item.uuid}`, body);
      else await request('POST', 'audience/segments', body);
      notify(editing.item ? 'Saved audience updated.' : 'Saved audience created.');
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    }
  }

  async function remove(item: SavedAudience) {
    try {
      await request('DELETE', `audience/segments/${item.uuid}`, {});
      notify('Saved audience removed.');
      setRemoving(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
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
            <h2 className="gr-section-title">Saved audiences</h2>
            <p className="gr-hint">A pick of people under a name, ready for the next campaign. The count is who it reaches today.</p>
          </div>
          {canEdit ? <Button tone="primary" onClick={() => setEditing({ item: null, name: '', target: EMPTY })}>New saved audience</Button> : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>No saved audiences yet. Example: everyone who said they are moving to Canada and chose Express Entry news.</Empty>
        ) : (
          <ul className="gr-list">
            {items.map((s) => (
              <li key={s.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{s.name}</p>
                  <div className="gr-pills">
                    {s.reach === null ? <Pill tone="bad">Reach unknown</Pill> : <Pill tone="accent">Reaches {s.reach}</Pill>}
                    {s.reach === null && s.reach_unavailable ? <span className="gr-hint">{s.reach_unavailable}</span> : null}
                  </div>
                </div>
                <Kebab
                  label={`Actions for ${s.name}`}
                  items={[
                    { label: 'Edit', hidden: !canEdit, onSelect: () => setEditing({ item: s, name: s.name, target: s.definition.target ?? EMPTY }) },
                    { label: 'Copy reference', onSelect: () => copy(s.uuid) },
                    { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setRemoving(s) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <Dialog
          title={editing.item ? 'Edit saved audience' : 'New saved audience'}
          description="Pick who it reaches. Nobody is emailed by saving it; a campaign uses it later."
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button tone="primary" disabled={editing.name.trim() === ''} onClick={save}>{editing.item ? 'Save changes' : 'Save audience'}</Button>
            </>
          }
        >
          <div className="gr-stack">
            <Field label="Name" hint="Example: Paid clients, Express Entry news." error={refused}>
              {(id) => <input id={id} className={INPUT} maxLength={120} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
            </Field>
            <TargetPicker value={editing.target} onChange={(target) => setEditing({ ...editing, target })} />
          </div>
        </Dialog>
      ) : null}

      {removing ? (
        <Dialog
          title={`Delete "${removing.name}"?`}
          description="Only the saved pick goes; nobody is unsubscribed. A campaign already sent keeps who it reached."
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Keep it</Button>
              <Button tone="danger" onClick={() => remove(removing)}>Delete</Button>
            </>
          }
        >
          <p className="gr-hint">You can make it again at any time.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
