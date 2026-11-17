import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, Pill, Refusal, copyText } from '../ui/primitives';
import type { BlogCategory } from './types';

/** What the editor holds while a category is being added or changed. */
export interface CategoryDraft {
  id: number | null;
  name: string;
  slug: string;
  /** The saved web address part, so a change to a live category's address can be warned about. */
  savedSlug: string | null;
  /** True once the author typed a web address part; until then it follows the name. */
  slugTouched: boolean;
  description: string;
  audience: string;
  sort: string;
  is_active: boolean;
}

export function categoryDraftFrom(c: BlogCategory | null): CategoryDraft {
  return {
    id: c?.id ?? null,
    name: c?.name ?? '',
    slug: c?.slug ?? '',
    savedSlug: c?.slug ?? null,
    slugTouched: c !== null,
    description: c?.description ?? '',
    audience: c?.audience ?? '',
    sort: String(c?.sort ?? 0),
    is_active: c?.is_active ?? true,
  };
}

/** The body the service takes (S1): empty optional words go as null, the order as a whole number. */
export function categoryBodyFrom(d: CategoryDraft): Record<string, unknown> {
  const sort = Number.parseInt(d.sort, 10);

  return {
    name: d.name.trim(),
    slug: d.slug.trim(),
    description: d.description.trim() || null,
    audience: d.audience || null,
    sort: Number.isFinite(sort) && sort >= 0 ? sort : 0,
    is_active: d.is_active,
  };
}

/** A web address part from a name: "Express Entry & PNP" -> "express-entry-pnp". The service checks it again. */
export function slugFrom(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

type View = { kind: 'list' } | { kind: 'edit'; draft: CategoryDraft } | { kind: 'delete'; category: BlogCategory };

/**
 * Growth > Blog > Categories (blog on growth-service S5): the product's blog categories, in ONE dialog that moves between
 * the list, the editor and the delete question, so nothing stacks a second dialog on the first. The dialog scrolls inside
 * its own body and keeps its buttons on screen at any height (the shared Dialog). The service decides what is allowed and
 * its refusal is shown as written, such as a category still used by posts.
 */
export function BlogCategories({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const { request, notify, onError, canEdit, words } = useGrowth();
  const [categories, setCategories] = useState<BlogCategory[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    request<Envelope<{ categories: BlogCategory[] }>>('GET', 'blog/categories')
      .then((res) => {
        if (!live) return;
        setCategories(unwrap(res).categories);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The categories could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  const audiences = Object.entries(words.audiences);
  const audienceLabel = (key: string | null) => (key === null ? null : (words.audiences[key] ?? key));

  function show(next: View) {
    setRefused(null);
    setView(next);
  }

  function changed(message: string) {
    notify(message);
    show({ kind: 'list' });
    setReloadKey((k) => k + 1);
    onChanged?.();
  }

  /** A 422 is about what was asked (shown in place); anything else goes to the host's error surface. */
  function refuse(e: unknown) {
    const field = fieldError(e);
    if (field) setRefused(field);
    else onError(e);
  }

  async function save(draft: CategoryDraft) {
    setBusy(true);
    setRefused(null);
    try {
      if (draft.id) await request('PUT', `blog/categories/${draft.id}`, categoryBodyFrom(draft));
      else await request('POST', 'blog/categories', categoryBodyFrom(draft));
      changed(draft.id ? 'Category saved.' : 'Category added. It can be picked for posts now.');
    } catch (e) {
      refuse(e);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(category: BlogCategory, isActive: boolean) {
    try {
      await request('PUT', `blog/categories/${category.id}`, { is_active: isActive });
      changed(isActive ? `"${category.name}" is in use again.` : `"${category.name}" is switched off. Its posts keep it; new posts cannot pick it.`);
    } catch (e) {
      onError(e);
    }
  }

  async function remove(category: BlogCategory) {
    setBusy(true);
    setRefused(null);
    try {
      await request('DELETE', `blog/categories/${category.id}`, {});
      changed(`"${category.name}" deleted.`);
    } catch (e) {
      refuse(e);
    } finally {
      setBusy(false);
    }
  }

  async function copy(category: BlogCategory) {
    if (await copyText(category.slug)) notify('Web address part copied.');
    else onError(new Error('Copying was blocked by the browser. Select the text and copy it instead.'));
  }

  if (view.kind === 'edit') {
    return (
      <CategoryEditor
        draft={view.draft}
        audiences={audiences}
        refused={refused}
        saving={busy}
        onChange={(draft) => setView({ kind: 'edit', draft })}
        onBack={() => show({ kind: 'list' })}
        onSave={() => void save(view.draft)}
      />
    );
  }

  if (view.kind === 'delete') {
    const c = view.category;

    return (
      <Dialog
        title={`Delete "${c.name}"?`}
        description="Deleting cannot be undone. A category that posts still use cannot be deleted; switch it off instead, and its posts keep it."
        onClose={() => show({ kind: 'list' })}
        footer={
          <>
            <Button onClick={() => show({ kind: 'list' })}>Keep it</Button>
            <Button tone="danger" disabled={busy} onClick={() => void remove(c)}>{busy ? 'Deleting…' : 'Delete'}</Button>
          </>
        }
      >
        <Refusal message={refused} />
      </Dialog>
    );
  }

  return (
    <Dialog
      wide
      title="Blog categories"
      description="The categories posts are filed under. Each one has its own page on the blog, at its web address part."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Done</Button>
          {canEdit ? <Button tone="primary" onClick={() => show({ kind: 'edit', draft: categoryDraftFrom(null) })}>Add a category</Button> : null}
        </>
      }
    >
      {failed ? (
        <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : categories === null ? (
        <Loading />
      ) : categories.length === 0 ? (
        <Empty>No categories yet. Add one so posts can be filed under it.</Empty>
      ) : (
        <ul className="gr-list" aria-label="Categories">
          {categories.map((c) => (
            <li key={c.id} className="gr-list-row">
              <div className="gr-grow">
                <p className="gr-row-title">{c.name}</p>
                <p className="gr-hint">/{c.slug}</p>
                {c.description ? <p className="gr-hint">{c.description}</p> : null}
                <div className="gr-pills">
                  <Pill>{audienceLabel(c.audience) ?? 'Every reader'}</Pill>
                  {typeof c.posts === 'number' ? <Pill>{c.posts === 1 ? '1 post' : `${c.posts} posts`}</Pill> : null}
                  {c.is_active ? null : <Pill tone="bad">Switched off</Pill>}
                </div>
              </div>
              <Kebab
                label={`Actions for ${c.name}`}
                items={[
                  { label: 'Edit', hidden: !canEdit, onSelect: () => show({ kind: 'edit', draft: categoryDraftFrom(c) }) },
                  { label: 'Copy web address part', onSelect: () => void copy(c) },
                  { label: c.is_active ? 'Switch off' : 'Switch on', hidden: !canEdit, onSelect: () => void setActive(c, !c.is_active) },
                  { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => show({ kind: 'delete', category: c }) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** The add / edit view of the categories dialog. */
function CategoryEditor({ draft, audiences, refused, saving, onChange, onBack, onSave }: {
  draft: CategoryDraft;
  audiences: Array<[string, string]>;
  refused: string | null;
  saving: boolean;
  onChange: (d: CategoryDraft) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<CategoryDraft>) => onChange({ ...draft, ...patch });
  const ready = draft.name.trim() !== '' && draft.slug.trim() !== '';
  const movesAddress = draft.savedSlug !== null && draft.slug.trim() !== draft.savedSlug;

  return (
    <Dialog
      title={draft.id ? 'Edit category' : 'Add a category'}
      description="Readers see the name on the blog; the web address part is the end of the category's page address."
      onClose={onBack}
      footer={
        <>
          <Button onClick={onBack}>Back to the list</Button>
          <Button tone="primary" disabled={!ready || saving} onClick={onSave}>{saving ? 'Saving…' : draft.id ? 'Save category' : 'Add category'}</Button>
        </>
      }
    >
      <div className="gr-stack">
        <Refusal message={refused} />
        <Field label="Name">
          {(id) => (
            <input
              id={id}
              className={INPUT}
              maxLength={80}
              value={draft.name}
              onChange={(e) => set({ name: e.target.value, slug: draft.slugTouched ? draft.slug : slugFrom(e.target.value) })}
            />
          )}
        </Field>
        <Field
          label="Web address part"
          hint="Lower-case letters, numbers and single hyphens."
          error={movesAddress ? 'Changing it moves the category page to a new address; links to the old one stop working.' : null}
        >
          {(id) => <input id={id} className={INPUT} maxLength={80} value={draft.slug} onChange={(e) => set({ slug: e.target.value, slugTouched: true })} />}
        </Field>
        <Field label="Description (optional)" hint="A line or two shown on the category's page.">
          {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={500} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <Field label="Who it is for" hint="Readers of this audience see it first. Every reader can still open it.">
          {(id) => (
            <select id={id} className={INPUT} value={draft.audience} onChange={(e) => set({ audience: e.target.value })}>
              <option value="">Every reader</option>
              {audiences.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
              {draft.audience !== '' && !audiences.some(([key]) => key === draft.audience) ? <option value={draft.audience}>{draft.audience}</option> : null}
            </select>
          )}
        </Field>
        <Field label="Order" hint="Lower numbers come first in lists. Categories with the same number are sorted by name.">
          {(id) => <input id={id} className={INPUT} type="number" min={0} max={65535} step={1} value={draft.sort} onChange={(e) => set({ sort: e.target.value })} />}
        </Field>
        <label className="gr-check">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
          <span>In use (new posts can pick it)</span>
        </label>
      </div>
    </Dialog>
  );
}
