import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Dialog, Empty, Field, INPUT, Kebab, LoadError, Loading, copyText } from '../ui/primitives';
import type { KeywordLink, LandingPage } from './types';

/**
 * Growth > Landing pages > Keyword links (shared program G7b5a; source: Portify's keyword links): someone comments a
 * keyword, an auto-reply sends this link, and each sign-up records which keyword brought them. The service makes and
 * counts the link; the person pastes it into their auto-reply tool.
 */
export interface KeywordLinksViewProps {
  onViewSignups?: (source: string, label: string) => void;
  /** The auto-reply tool the product's people use, named in the copy ("ManyChat"); generic when absent. */
  replyTool?: string;
}

type Editing = { link: KeywordLink | null; keyword: string; page: string; src: string };

/** A src from the keyword: lowercase letters, digits and hyphens, as the service requires. */
const srcFrom = (keyword: string) => keyword.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export function KeywordLinksView({ onViewSignups, replyTool }: KeywordLinksViewProps) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [links, setLinks] = useState<KeywordLink[] | null>(null);
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<KeywordLink | null>(null);
  const tool = replyTool ?? 'your auto-reply tool';

  useEffect(() => {
    let live = true;
    Promise.all([
      request<Envelope<{ keywords: KeywordLink[] }>>('GET', 'keyword-links'),
      request<Envelope<{ pages: LandingPage[] }>>('GET', 'landing-pages'),
    ])
      .then(([k, p]) => {
        if (!live) return;
        setLinks(unwrap(k).keywords);
        setPages(unwrap(p).pages);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The keyword links could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function save() {
    if (!editing) return;
    setRefused(null);
    const body = { keyword: editing.keyword.trim(), landing_page_uuid: editing.page, src: editing.src.trim() };
    try {
      if (editing.link) await request('PUT', `keyword-links/${editing.link.uuid}`, body);
      else await request('POST', 'keyword-links', body);
      notify(editing.link ? 'Keyword link saved.' : `Keyword link saved. Paste the link into ${tool}.`);
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    }
  }

  async function remove(link: KeywordLink) {
    try {
      await request('DELETE', `keyword-links/${link.uuid}`, {});
      notify('Keyword link deleted.');
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function copy(url: string | null) {
    if (url === null) {
      onError(new Error('This link has no address yet: set where landing pages live first.'));
      return;
    }
    if (await copyText(url)) notify('Link copied.');
    else onError(new Error('Copying was blocked by the browser. Select the link and copy it instead.'));
  }

  const ready = editing !== null && editing.keyword.trim() !== '' && editing.page !== '' && /^[a-z0-9-]{1,60}$/.test(editing.src.trim());

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <p className="gr-hint">
            Someone comments a keyword, {tool} replies with this link, and each sign-up records which keyword brought them.
          </p>
          {canEdit ? (
            <Button tone="primary" disabled={pages.length === 0} onClick={() => { setRefused(null); setEditing({ link: null, keyword: '', page: pages[0]?.uuid ?? '', src: '' }); }}>
              New keyword link
            </Button>
          ) : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : links === null ? (
          <Loading label="Loading the keyword links…" />
        ) : links.length === 0 ? (
          <Empty>{pages.length ? 'No keyword links yet.' : 'Make a landing page first, then link a keyword to it.'}</Empty>
        ) : (
          <ul className="gr-list">
            {links.map((k) => (
              <li key={k.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{k.keyword}</p>
                  <p className="gr-hint">
                    {k.page_name ?? 'A deleted page'}, {k.signups} {k.signups === 1 ? 'sign-up' : 'sign-ups'}
                  </p>
                  <code className="gr-code-line">{k.url ?? 'No address yet'}</code>
                </div>
                <Kebab
                  label={`Actions for ${k.keyword}`}
                  items={[
                    { label: 'Copy link', onSelect: () => void copy(k.url) },
                    { label: 'Edit', hidden: !canEdit, onSelect: () => { setRefused(null); setEditing({ link: k, keyword: k.keyword, page: k.page_uuid ?? '', src: k.src }); } },
                    { label: 'View sign-ups', hidden: !onViewSignups, onSelect: () => onViewSignups?.(k.src, k.keyword) },
                    { label: 'Delete', danger: true, hidden: !canEdit, onSelect: () => setDeleting(k) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <Dialog
          title={editing.link ? 'Edit keyword link' : 'New keyword link'}
          description={`The keyword people comment, and the page ${tool} sends them to.`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button tone="primary" disabled={!ready} onClick={save}>Save keyword link</Button>
            </>
          }
        >
          <div className="gr-stack">
            <Field label="Keyword" hint="What people comment, for example CHECKLIST." error={refused}>
              {(id) => (
                <input
                  id={id}
                  className={INPUT}
                  maxLength={40}
                  value={editing.keyword}
                  onChange={(e) => {
                    const keyword = e.target.value;
                    // The src follows the keyword until the person edits it themselves.
                    const follows = editing.src === '' || editing.src === srcFrom(editing.keyword);
                    setEditing({ ...editing, keyword, src: follows ? srcFrom(keyword) : editing.src });
                  }}
                />
              )}
            </Field>
            <Field label="Landing page">
              {(id) => (
                <select id={id} className={INPUT} value={editing.page} onChange={(e) => setEditing({ ...editing, page: e.target.value })}>
                  {pages.map((p) => (
                    <option key={p.uuid} value={p.uuid}>{p.name}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Link tag" hint="Added to the link so each sign-up records this keyword. Lowercase letters, digits and hyphens.">
              {(id) => <input id={id} className={INPUT} maxLength={60} value={editing.src} onChange={(e) => setEditing({ ...editing, src: e.target.value.toLowerCase() })} />}
            </Field>
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <Dialog
          title={`Delete the ${deleting.keyword} keyword?`}
          description={`This removes it here. Anyone who already has the link can still open the page, and ${tool} keeps sending it until you change it there.`}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button tone="danger" onClick={() => { const link = deleting; setDeleting(null); void remove(link); }}>Delete</Button>
            </>
          }
        >
          <span />
        </Dialog>
      ) : null}
    </Card>
  );
}
