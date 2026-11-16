import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import { CtaEditor, bodyFrom, draftFrom, type CtaDraft } from './CtaEditor';
import { CTA_ACTIONS, CTA_STAGES, CTA_VARIANTS, type CtaItem } from './types';

/**
 * Growth > Blog > Calls to action (post-and-newsletter-layouts B2): the product's CTA library. A post's call-to-action
 * part reads its copy from here by stage, position and category, so an admin edits it once and every post updates.
 * A position with nothing set up shows "not set up" on the post rather than invented words (growth-service resolve).
 */
export function CtaLibrary() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [ctas, setCtas] = useState<CtaItem[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<CtaDraft | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<CtaItem | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ ctas: CtaItem[] }>>('GET', 'ctas')
      .then((res) => {
        if (!live) return;
        setCtas(unwrap(res).ctas);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The calls to action could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  function open(cta: CtaItem | null) {
    setRefused(null);
    setEditing(draftFrom(cta));
  }

  async function save() {
    if (!editing) return;
    setRefused(null);
    setSaving(true);
    try {
      if (editing.id) await request('PUT', `ctas/${editing.id}`, bodyFrom(editing));
      else await request('POST', 'ctas', bodyFrom(editing));
      notify(editing.id ? 'Saved. Every post using it shows the new words.' : 'Added. Posts using this stage and position show it now.');
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove(cta: CtaItem) {
    try {
      await request('DELETE', `ctas/${cta.id}`, {});
      notify('Deleted. Posts that used it fall back to the any-category copy, or say it is not set up.');
      setRemoving(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function copy(text: string, what: string) {
    if (await copyText(text)) notify(`${what} copied.`);
    else onError(new Error('Copying was blocked by the browser. Select the text and copy it instead.'));
  }

  const label = (list: Array<{ value: string; label: string }>, v: string) => list.find((x) => x.value === v)?.label ?? v;

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Calls to action</h2>
            <p className="gr-hint">The words every post shows at each stage. Edit them here once; posts update without being opened.</p>
          </div>
          {canEdit ? <Button tone="primary" onClick={() => open(null)}>New call to action</Button> : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : ctas === null ? (
          <Loading />
        ) : ctas.length === 0 ? (
          <Empty>No calls to action yet. Add one for each stage a post uses: awareness, consideration and decision.</Empty>
        ) : (
          CTA_STAGES.map((stage) => {
            const rows = ctas.filter((c) => c.stage === stage.value);

            return (
              <section key={stage.value} className="gr-stack" aria-label={stage.label}>
                <p className="gr-row-title">{stage.label}</p>
                {rows.length === 0 ? (
                  <p className="gr-hint">Nothing set up yet, so posts show &quot;not set up&quot; in this spot.</p>
                ) : (
                  <ul className="gr-list">
                    {rows.map((c) => (
                      <li key={c.id} className="gr-list-row">
                        <div className="gr-grow">
                          {c.eyebrow ? <p className="gr-hint">{c.eyebrow}</p> : null}
                          <p className="gr-row-title">{c.headline}</p>
                          <div className="gr-pills">
                            <Pill>{label(CTA_VARIANTS, c.variant)}</Pill>
                            <Pill>{c.category ?? 'Any category'}</Pill>
                            <Pill tone="accent">{c.button_label}: {label(CTA_ACTIONS, c.action_kind).toLowerCase()}</Pill>
                            {c.secondary ? <Pill>+ {c.secondary.label}</Pill> : null}
                            {c.active ? null : <Pill tone="bad">Not in use</Pill>}
                          </div>
                        </div>
                        <Kebab
                          label={`Actions for ${c.headline}`}
                          items={[
                            { label: 'Edit', hidden: !canEdit, onSelect: () => open(c) },
                            { label: 'Copy words', onSelect: () => copy([c.eyebrow, c.headline, c.body, c.button_label].filter(Boolean).join('\n'), 'Words') },
                            { label: 'Copy link', hidden: !c.action_ref, onSelect: () => copy(c.action_ref ?? '', 'Link') },
                            { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setRemoving(c) },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {editing ? <CtaEditor draft={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={save} refused={refused} saving={saving} /> : null}

      {removing ? (
        <Dialog
          title={`Delete "${removing.headline}"?`}
          description="Posts that use it fall back to the any-category copy for the same stage and position, or show that it is not set up."
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>Keep it</Button>
              <Button tone="danger" onClick={() => remove(removing)}>Delete</Button>
            </>
          }
        >
          <p className="gr-hint">You can switch it off instead (Edit, then untick "In use") to keep the words for later.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
