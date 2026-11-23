import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { TemplateThumb } from '../blog/TemplateCards';
import { fieldError } from '../settings/SourceDialog';
import { Button, ChoiceGroup, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, Refusal, copyText } from '../ui/primitives';
import { useTemplates, type TemplateFilter, type TemplateRow, type TemplatesOptions } from './useTemplates';

export interface TemplatesPageProps extends TemplatesOptions {
  /** Open a template in the host's designer. */
  onEdit: (template: TemplateRow) => void;
  /**
   * Show the template as its reader gets it, the way its designer's "Preview" does (owner 2026-11-23: preview belongs in
   * the card's menu): a blog template on the product's public post page, a newsletter template as sent. Absent: no item.
   */
  onPreview?: (template: TemplateRow) => void;
}

const FILTERS: Array<{ value: TemplateFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'post', label: 'Blog' },
  { value: 'email', label: 'Newsletter' },
  { value: 'retired', label: 'Retired' },
];

/**
 * Growth > Templates (growth templates D1, owner 2026-11-20: "admins should be able to manage (CRUD) templates"; one page
 * for blog and newsletter templates; "retire, never erase"). Each template is shown as the page a reader would get from it,
 * so the shelf of templates is a shelf of real pages. Its menu: Edit, Preview (the host's), Duplicate, Copy key, then
 * Retire (asked first); a retired one offers Restore. Making a new template is the host's "New template" action (D2).
 */
export function TemplatesPage({ onEdit, onPreview, framePreview }: TemplatesPageProps) {
  const { notify, onError, canEdit } = useGrowth();
  const t = useTemplates({ framePreview });
  const [copying, setCopying] = useState<TemplateRow | null>(null);
  const [copyName, setCopyName] = useState('');
  const [retiring, setRetiring] = useState<TemplateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setRefusal(null);
    try {
      await work();
      notify(done);

      return true;
    } catch (e) {
      // A refusal in the service's words stays on the dialog (the last template of a kind, a name in use); anything
      // else is the host's to report. Never both, so one refusal is never said twice.
      const field = fieldError(e);
      if (field) setRefusal(field);
      else onError(e);

      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async (row: TemplateRow) => {
    if (await copyText(row.key)) notify(`Copied the key "${row.key}".`);
    else onError(new Error('The key could not be copied. Select it and copy it by hand.'));
  };

  return (
    <div className="gr-stack">
      <div className="gr-filters">
        <Field label="Search templates">
          {(id) => <input id={id} type="search" className={INPUT} value={t.q} onChange={(e) => t.setQ(e.target.value)} placeholder="A word in the name" />}
        </Field>
      </div>
      <ChoiceGroup<TemplateFilter> label="Which templates" value={t.filter} options={FILTERS} onChange={t.setFilter} />

      {t.failed ? (
        <LoadError message={t.failed} onRetry={t.reload} />
      ) : t.rows === null ? (
        <Loading label="Loading the templates…" />
      ) : t.rows.length === 0 ? (
        <Empty>
          {t.filter === 'retired'
            ? 'No retired templates. A template you retire waits here, and you can restore it.'
            : t.q.trim() !== '' ? `No template has "${t.q.trim()}" in its name.` : 'No templates yet. Make one with New template.'}
        </Empty>
      ) : (
        <ul className="gr-template-cards gr-template-shelf" aria-label="Templates">
          {t.rows.map((row) => {
            const retired = row.status === 'retired';

            return (
              <li key={row.key} className={`gr-template-card gr-template-shelf-card${retired ? ' gr-template-retired' : ''}`}>
                <button type="button" className="gr-row-button" onClick={() => onEdit(row)} aria-label={`Edit ${row.name}`}>
                  <TemplateThumb name={row.name} preview={t.previewOf(row)} />
                </button>
                <span className="gr-template-name">
                  <span>{row.name}</span>
                  {canEdit ? (
                    <Kebab
                      label={`Actions for ${row.name}`}
                      items={[
                        { label: 'Edit', onSelect: () => onEdit(row) },
                        { label: 'Preview', hidden: !onPreview, onSelect: () => onPreview?.(row) },
                        { label: 'Duplicate', hidden: retired, onSelect: () => { setCopyName(`${row.name} copy`); setRefusal(null); setCopying(row); } },
                        { label: 'Copy key', onSelect: () => void copyKey(row) },
                        { label: 'Restore', hidden: !retired, onSelect: () => void run(() => t.restore(row), `Restored "${row.name}".`) },
                        { label: 'Retire', danger: true, hidden: retired, onSelect: () => { setRefusal(null); setRetiring(row); } },
                      ]}
                    />
                  ) : null}
                </span>
                <span className="gr-template-meta">
                  {row.kind === 'email' ? 'Newsletter' : 'Blog'} template, {row.parts} {row.parts === 1 ? 'part' : 'parts'}, version {row.version}
                  {retired ? <> <Pill>Retired</Pill></> : null}
                </span>
                {row.source ? <span className="gr-template-meta">Made from &ldquo;{row.source.title}&rdquo;</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      {copying ? (
        <Dialog
          title={`Duplicate "${copying.name}"`}
          description="The copy starts with the same parts, words and rules. Posts already made from the original are not touched."
          onClose={() => setCopying(null)}
          footer={
            <>
              <Button onClick={() => setCopying(null)}>Cancel</Button>
              <Button tone="primary" disabled={busy || copyName.trim() === ''} onClick={() => void run(() => t.duplicate(copying, copyName.trim()), `Made "${copyName.trim()}".`).then((ok) => ok && setCopying(null))}>
                Duplicate
              </Button>
            </>
          }
        >
          <Field label="Name of the copy">{(id) => <input id={id} className={INPUT} value={copyName} onChange={(e) => setCopyName(e.target.value)} maxLength={120} />}</Field>
          <Refusal message={refusal} />
        </Dialog>
      ) : null}

      {retiring ? (
        <Dialog
          title={`Retire "${retiring.name}"?`}
          description="It leaves the template list and the choice of templates for new posts. Posts made from it keep its checks, and you can restore it from Retired."
          onClose={() => setRetiring(null)}
          footer={
            <>
              <Button onClick={() => setRetiring(null)}>Keep it</Button>
              <Button tone="danger" disabled={busy} onClick={() => void run(() => t.retire(retiring), `Retired "${retiring.name}".`).then((ok) => ok && setRetiring(null))}>
                Retire
              </Button>
            </>
          }
        >
          <Refusal message={refusal} />
        </Dialog>
      ) : null}
    </div>
  );
}
