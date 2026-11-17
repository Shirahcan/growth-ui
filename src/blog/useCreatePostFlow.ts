import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { BlogPostDetail } from './types';

/** A post layout the create flow offers (the service's `GET layouts?kind=post`). */
export interface PostTemplate {
  key: string;
  name: string;
  /** How many parts the structure has, so the choice says how much it holds. */
  parts: number;
}

/**
 * What a template starts as, for the picker's preview card (owner 2026-11-17: "preview cards (similar to what MS Word
 * does) so the user can see what to expect"): the service's `GET layouts/{key}?starter=1`. `tree` is the starter drawn
 * as a new post from it (sample words in the header); `nodes` its structure, for a picture drawn without the host.
 */
export interface TemplatePreview {
  nodes: unknown[];
  tree: unknown[] | null;
  /**
   * An EMAIL template's starter drawn as the email itself (blog on growth-service N1e): the card shows it in a
   * sandboxed frame, so no host renderer is needed. Absent for posts.
   */
  html?: string | null;
}

/** What the create flow decides. Kept as the host wizard's draft, so an interrupted pick is resumed (files are not). */
export interface CreatePostDraft {
  layout_key: string | null;
  /** "document": the assistant prepares the post from a file; "template": it opens with the template's guidance. */
  start: 'document' | 'template';
}

export interface CreatePostFlow {
  draft: CreatePostDraft;
  patch: (p: Partial<CreatePostDraft>) => void;
  /** The post's source document, while "start" is "document" (a File never goes into the saved draft). */
  document: File | null;
  setDocument: (file: File | null) => void;
  /** An optional cover photo. */
  cover: File | null;
  setCover: (file: File | null) => void;
  /** null while loading. */
  templates: PostTemplate[] | null;
  /** Each template's preview by key: undefined while loading, null when it could not be drawn (the card shows none). */
  previews: Record<string, TemplatePreview | null>;
  loadError: string | null;
  reload: () => void;
  creating: boolean;
  /** The service's refusal, in its words, drawn on the step. */
  refusal: string | null;
  /** Creates the post from the picked template; null when refused (the step says why). */
  create: () => Promise<BlogPostDetail | null>;
}

export interface CreatePostFlowOptions {
  /** The template picked before the author chooses (the product's default, e.g. Portify's "Classic"); else the first. */
  defaultTemplate?: string;
}

/**
 * Creating a post (blog on growth-service F1): pick a template, and the post starts as its structure, opened in the
 * host's designer. The service makes the post (`POST blog/posts` with `layout_key`); this hook holds the choice.
 */
export function useCreatePostFlow(options: CreatePostFlowOptions = {}): CreatePostFlow {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<CreatePostDraft>({ layout_key: null, start: 'template' });
  const [document, setDocument] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [templates, setTemplates] = useState<PostTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TemplatePreview | null>>({});
  const { defaultTemplate } = options;

  const patch = useCallback((p: Partial<CreatePostDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  useEffect(() => {
    let live = true;
    request<Envelope<{ layouts: PostTemplate[] }>>('GET', 'layouts?kind=post')
      .then((res) => {
        if (!live) return;
        const list = unwrap(res).layouts.map((l) => ({ key: l.key, name: l.name, parts: l.parts ?? 0 }));
        setTemplates(list);
        setLoadError(null);
        // Preselect the product's default (or the first) unless a resumed draft already holds a template still offered.
        setDraft((d) => (d.layout_key && list.some((t) => t.key === d.layout_key)
          ? d
          : { ...d, layout_key: (list.find((t) => t.key === defaultTemplate) ?? list[0])?.key ?? null }));
      })
      .catch((e) => {
        if (!live) return;
        setLoadError(e instanceof Error ? e.message : 'The templates could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, defaultTemplate, reloadKey]);

  // Each template's preview, once the list is in (a few templates; one read each). A preview that cannot be drawn is
  // only a missing picture: the choice still works, so nothing is reported to the person.
  useEffect(() => {
    if (!templates) return;
    let live = true;
    templates.forEach((t) => {
      request<Envelope<{ starter: TemplatePreview }>>('GET', `layouts/${encodeURIComponent(t.key)}?starter=1`)
        .then((res) => {
          const starter = unwrap(res).starter;
          if (live) setPreviews((p) => ({ ...p, [t.key]: { nodes: starter?.nodes ?? [], tree: starter?.tree ?? null } }));
        })
        .catch(() => {
          if (live) setPreviews((p) => ({ ...p, [t.key]: null }));
        });
    });

    return () => {
      live = false;
    };
  }, [request, templates]);

  const create = useCallback(async (): Promise<BlogPostDetail | null> => {
    if (!draft.layout_key) return null;
    setCreating(true);
    setRefusal(null);
    try {
      const res = await request<Envelope<{ post: BlogPostDetail }>>('POST', 'blog/posts', { layout_key: draft.layout_key });

      return unwrap(res).post;
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefusal(field);
      else onError(e);

      return null;
    } finally {
      setCreating(false);
    }
  }, [request, onError, draft.layout_key]);

  return { draft, patch, document, setDocument, cover, setCover, templates, previews, loadError, reload: () => setReloadKey((k) => k + 1), creating, refusal, create };
}
