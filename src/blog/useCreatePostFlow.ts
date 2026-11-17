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

/** What the create flow decides. Kept as the host wizard's draft, so an interrupted pick is resumed. */
export interface CreatePostDraft {
  layout_key: string | null;
}

export interface CreatePostFlow {
  draft: CreatePostDraft;
  patch: (p: Partial<CreatePostDraft>) => void;
  /** null while loading. */
  templates: PostTemplate[] | null;
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
  const [draft, setDraft] = useState<CreatePostDraft>({ layout_key: null });
  const [templates, setTemplates] = useState<PostTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
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

  return { draft, patch, templates, loadError, reload: () => setReloadKey((k) => k + 1), creating, refusal, create };
}
