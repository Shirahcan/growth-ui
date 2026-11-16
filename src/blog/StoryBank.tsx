import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import { StoryEditor, editBody, editFrom, type StoryEdit } from './StoryEditor';
import type { Story } from './types';

/** The service records who checked as "name (ref)" for the audit; a person reads only the name. */
export function personName(recorded: string): string {
  return recorded.replace(/\s*\([^()]*\)\s*$/, '') || recorded;
}

/**
 * Growth > Blog > Client stories (post-and-newsletter-layouts B6): the product's story bank. A post's story part picks
 * from here, and only a story that is anonymised, has the client's consent on record, is ready, and was checked by a
 * person can be picked. Adding one is a guided flow on the host's wizard (`storySteps`); this is the list.
 */
export function StoryBank() {
  const { request, notify, onError, canEdit, Link, areaHref } = useGrowth();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<StoryEdit | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Story | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ stories: Story[] }>>('GET', 'stories')
      .then((res) => {
        if (!live) return;
        setStories(unwrap(res).stories);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The stories could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function save() {
    if (!editing) return;
    const body = editBody(editing);
    if (Object.keys(body).length === 0) {
      setEditing(null);
      return;
    }
    setRefused(null);
    setSaving(true);
    try {
      const res = await request<Envelope<{ story: Story }>>('PUT', `stories/${editing.story.id}`, body);
      notify(res.message ?? 'Story saved.');
      setEditing(null);
      reload();
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  async function act(run: () => Promise<Envelope<unknown>>) {
    try {
      const res = await run();
      notify(res.message ?? 'Done.');
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function remove(story: Story) {
    try {
      await request('DELETE', `stories/${story.id}`, {});
      notify('Story deleted. A post that showed it now asks to pick a story.');
      setRemoving(null);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function copy(text: string, what: string) {
    if (await copyText(text)) notify(`${what} copied.`);
    else onError(new Error('Copying was blocked by the browser. Select the text and copy it instead.'));
  }

  const state = (s: Story) =>
    s.pickable ? <Pill tone="good">Posts can use it</Pill>
      : s.status === 'ready' ? <Pill tone="accent">Ready, needs a check</Pill>
        : s.status === 'archived' ? <Pill>Archived</Pill>
          : <Pill>Draft</Pill>;

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Client stories</h2>
            <p className="gr-hint">Real, anonymised outcomes a post can tell. A story is shown only with the client&apos;s consent on record and after someone checks it.</p>
          </div>
          {canEdit ? <Link href={areaHref('blog/stories/new')} className="gr-button gr-button-primary">Add a story</Link> : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={reload} />
        ) : stories === null ? (
          <Loading />
        ) : stories.length === 0 ? (
          <Empty>No stories yet. Add one from a case that went well, once the client has agreed in writing.</Empty>
        ) : (
          <ul className="gr-list">
            {stories.map((s) => (
              <li key={s.id} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{s.case_type}</p>
                  <p className="gr-hint">{s.outcome}</p>
                  <div className="gr-pills">
                    {state(s)}
                    {s.consent.method ? <Pill>Consent recorded</Pill> : <Pill tone="bad">No consent yet</Pill>}
                    {s.verified_by ? <span className="gr-hint">Checked by {personName(s.verified_by)}</span> : null}
                  </div>
                </div>
                <Kebab
                  label={`Actions for ${s.case_type}`}
                  items={[
                    { label: 'Edit', hidden: !canEdit, onSelect: () => { setRefused(null); setEditing(editFrom(s)); } },
                    { label: 'Mark as checked', hidden: !canEdit || s.status !== 'ready' || !s.consent.method || s.verified_at !== null, onSelect: () => act(() => request('POST', `stories/${s.id}/verify`, {})) },
                    { label: 'Copy story', onSelect: () => copy([s.case_type, s.challenge, s.strategy, s.outcome].join('\n\n'), 'Story') },
                    { label: 'Copy reference', onSelect: () => copy(`story-${s.id}`, 'Reference') },
                    { label: 'Archive', hidden: !canEdit || s.status === 'archived', onSelect: () => act(() => request('PUT', `stories/${s.id}`, { status: 'archived' })) },
                    { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setRemoving(s) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? <StoryEditor edit={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={save} refused={refused} saving={saving} /> : null}

      {removing ? (
        <Dialog
          title="Delete this story?"
          description="Posts and newsletters that show it will ask to pick another story. Archive it instead to keep it out of new posts but on record."
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Keep it</Button>
              <Button tone="danger" onClick={() => remove(removing)}>Delete story</Button>
            </>
          }
        >
          <p className="gr-hint">{removing.case_type}: {removing.outcome}</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
