import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { TemplateRow } from './useTemplates';

export type NewTemplateKind = 'post' | 'email';
export type NewTemplateStart = 'blank' | 'copy' | 'item';
export type NewTemplateWords = 'keep' | 'guidance';

/** What the new-template flow decides. Kept as the host wizard's draft, so an interrupted flow is resumed. */
export interface NewTemplateDraft {
  kind: NewTemplateKind | null;
  start: NewTemplateStart | null;
  /** The template copied (`copy`), or the post or newsletter it is made from (`item`, its uuid). */
  from: string | null;
  fromTitle: string | null;
  words: NewTemplateWords | null;
  name: string;
}

/** A post or newsletter offered as the source of a template. */
export interface TemplateSourceItem {
  uuid: string;
  title: string;
  /** Tells apart two with the same title: its state and its date ("Draft, edited 20 Nov"). */
  hint: string;
}

const day = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

function postHint(p: { status?: string; live?: boolean; updated_at?: string | null; published_at?: string | null }): string {
  const when = day(p.live ? p.published_at : p.updated_at);

  return p.live ? `Live${when ? `, published ${when}` : ''}` : `${p.status === 'scheduled' ? 'Scheduled' : 'Draft'}${when ? `, edited ${when}` : ''}`;
}

function campaignHint(c: { status?: string; sent_at?: string | null }): string {
  const when = day(c.sent_at);

  return c.status === 'sent' ? `Sent${when ? ` ${when}` : ''}` : c.status === 'scheduled' ? 'Scheduled' : 'Draft';
}

/**
 * Making a template (growth templates D2, owner 2026-11-20: admins manage templates; "templates could be created from a
 * post"; the admin chooses each time whether the words stay as examples or become guidance). One decision per step:
 * kind, how it starts (blank, a copy of a template, or a post or newsletter), which one, what happens to the words, its
 * name. `create()` asks growth-service and returns the new template, which the host opens in its designer.
 */
export function useNewTemplateFlow(initial: Partial<NewTemplateDraft> = {}) {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<NewTemplateDraft>({ kind: null, start: null, from: null, fromTitle: null, words: null, name: '', ...initial });
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [items, setItems] = useState<TemplateSourceItem[] | null>(null);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const patch = useCallback((p: Partial<NewTemplateDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  // The templates to copy, of the chosen kind.
  useEffect(() => {
    if (draft.kind === null || draft.start !== 'copy') return;
    let live = true;
    request<Envelope<{ layouts: TemplateRow[] }>>('GET', `layouts?kind=${draft.kind}`)
      .then((res) => live && setTemplates(unwrap(res).layouts))
      .catch((e) => {
        if (live) setTemplates([]);
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, draft.kind, draft.start]);

  // The posts or newsletters to make it from, searched by a word in the title.
  useEffect(() => {
    if (draft.kind === null || draft.start !== 'item') return;
    let live = true;
    const query = q.trim() !== '' ? `?q=${encodeURIComponent(q.trim())}` : '';
    const read = draft.kind === 'post'
      ? request<Envelope<{ posts: Array<{ uuid: string; title: string; status?: string; live?: boolean; updated_at?: string | null; published_at?: string | null }> }>>('GET', `blog/posts${query}`)
        .then((res) => unwrap(res).posts.map((p) => ({ uuid: p.uuid, title: p.title || 'Untitled post', hint: postHint(p) })))
      : request<Envelope<{ campaigns: Array<{ uuid: string; subject: string; status?: string; sent_at?: string | null }> }>>('GET', 'campaigns').then((res) => unwrap(res).campaigns
        .filter((c) => q.trim() === '' || (c.subject ?? '').toLowerCase().includes(q.trim().toLowerCase()))
        .map((c) => ({ uuid: c.uuid, title: c.subject || 'Untitled newsletter', hint: campaignHint(c) })));
    read
      .then((list) => live && setItems(list.slice(0, 50)))
      .catch((e) => {
        if (live) setItems([]);
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, draft.kind, draft.start, q]);

  const create = useCallback(async (): Promise<TemplateRow | null> => {
    if (draft.kind === null || draft.start === null || draft.name.trim() === '') return null;
    setCreating(true);
    setRefusal(null);
    try {
      const name = draft.name.trim();
      const res = draft.start === 'item' && draft.from
        ? await request<Envelope<{ layout: TemplateRow }>>('POST', `layouts/${draft.kind === 'post' ? 'from-post' : 'from-campaign'}/${encodeURIComponent(draft.from)}`, { name, words: draft.words ?? 'guidance' })
        : await request<Envelope<{ layout: TemplateRow }>>('POST', 'layouts', { kind: draft.kind, name, ...(draft.start === 'copy' && draft.from ? { from: draft.from } : {}) });

      return unwrap(res).layout;
    } catch (e) {
      // The service's own words (a name in use, a written newsletter, an empty post) stay on the last step; anything
      // else is the host's to report. Never both.
      const field = fieldError(e);
      if (field) setRefusal(field);
      else onError(e);

      return null;
    } finally {
      setCreating(false);
    }
  }, [request, onError, draft]);

  return { draft, patch, templates, items, q, setQ, create, creating, refusal };
}

export type NewTemplateFlow = ReturnType<typeof useNewTemplateFlow>;
