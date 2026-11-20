import { useCallback, useEffect, useRef, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import type { TemplatePreview } from '../blog/useCreatePostFlow';
import { unwrap, type Envelope } from '../plan/types';

/** One template as the Templates page lists it (growth-service `GET layouts`). */
export interface TemplateRow {
  key: string;
  kind: 'post' | 'email';
  name: string;
  version: number;
  status: 'active' | 'retired';
  parts: number;
  edited?: boolean;
  updated_at?: string;
  /** What it was made from, when an admin made it from a post or a newsletter. */
  source?: { kind: 'post' | 'newsletter'; uuid: string; title: string; words: 'keep' | 'guidance' } | null;
}

export type TemplateFilter = 'all' | 'post' | 'email' | 'retired';

export interface TemplatesOptions {
  /** The address of a page that draws a blog template as a reader sees it (the host's preview link). */
  framePreview?: (key: string) => Promise<string | null>;
}

/**
 * The Templates page's data (growth templates D1, owner 2026-11-20: "admins should be able to manage (CRUD) templates";
 * "retire, never erase"): the list by kind or retired, a name search, each template's reader thumbnail, and the actions
 * (copy, retire, restore). Every change goes to growth-service; a refusal comes back in its own words.
 */
export function useTemplates(options: TemplatesOptions = {}) {
  const { request, onError } = useGrowth();
  const { framePreview } = options;
  const [filter, setFilter] = useState<TemplateFilter>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TemplateRow[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TemplatePreview | null>>({});
  const [reloadKey, setReloadKey] = useState(0);
  // Each thumbnail is asked for once per template version; an answer arriving never cancels another in flight.
  const asked = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams();
    if (filter === 'post' || filter === 'email') params.set('kind', filter);
    if (filter === 'retired') params.set('status', 'retired');
    if (q.trim() !== '') params.set('q', q.trim());
    const query = params.toString();
    request<Envelope<{ layouts: TemplateRow[] }>>('GET', `layouts${query ? `?${query}` : ''}`)
      .then((res) => {
        if (!live) return;
        setRows(unwrap(res).layouts);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The templates could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, filter, q, reloadKey]);

  // Each template's thumbnail, once: a blog template as its reader page, a newsletter as the email an inbox shows.
  useEffect(() => {
    if (!rows) return;
    rows.forEach((t) => {
      const id = `${t.key}@${t.version}`;
      if (asked.current.has(id)) return;
      asked.current.add(id);
      const done = (p: TemplatePreview | null) => {
        if (mounted.current) setPreviews((all) => ({ ...all, [id]: p }));
      };
      if (t.kind === 'post' && framePreview) {
        framePreview(t.key).then((frame) => done(frame ? { nodes: [], tree: null, frame } : null)).catch(() => done(null));
      } else {
        request<Envelope<{ preview: { kind: string; html?: string } }>>('GET', `layouts/${encodeURIComponent(t.key)}/reader-preview`)
          .then((res) => done({ nodes: [], tree: null, html: unwrap(res).preview?.html ?? null }))
          .catch(() => done(null));
      }
    });
  }, [rows, framePreview, request]);

  const act = useCallback(async (method: 'POST', path: string, body?: Record<string, unknown>) => {
    const res = await request<Envelope<{ layout: TemplateRow }>>(method, path, body);
    reload();

    return unwrap(res).layout;
  }, [request, reload]);

  return {
    filter, setFilter, q, setQ, rows, failed, reload,
    previewOf: (t: TemplateRow) => previews[`${t.key}@${t.version}`],
    duplicate: (t: TemplateRow, name: string) => act('POST', 'layouts', { kind: t.kind, name, from: t.key }),
    retire: (t: TemplateRow) => act('POST', `layouts/${encodeURIComponent(t.key)}/retire`),
    restore: (t: TemplateRow) => act('POST', `layouts/${encodeURIComponent(t.key)}/restore`),
  };
}
