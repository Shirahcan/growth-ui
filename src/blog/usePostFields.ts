import { useCallback, useEffect, useRef, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { BlogPostDetail, PostFieldsDraft } from './types';

/** The categories a post may be filed under (active ones), as the service returns them with the post. */
export interface PostCategoryOption {
  id: number;
  name: string;
  slug: string;
}

/** The editable fields of a post, as the settings form holds them. */
export function postDraftFrom(post: BlogPostDetail): PostFieldsDraft {
  return {
    title: post.title ?? '',
    answer: post.answer ?? '',
    category_id: post.category_id ?? null,
    audience: post.audience ?? '',
    author_name: post.author_name ?? '',
    page_width: post.page_width ?? 'page',
    facts: (post.facts ?? []).map((f) => ({ text: f.text ?? '', review_by: f.review_by ?? null, source_key: f.source_key ?? null })),
    meta_title: post.meta_title ?? '',
    meta_description: post.meta_description ?? '',
    reader_questions: (post.reader_questions ?? []).map((q) => ({ q: q.q ?? '', a: q.a ?? '' })),
    cta_kind: post.cta_kind ?? 'none',
    cta_ref: post.cta_ref ?? '',
    add_to_knowledge: Boolean(post.add_to_knowledge),
  };
}

/** The PUT body (S2b): empty words go as null; an empty fact or question row is dropped, not stored. */
export function postFieldsBody(d: PostFieldsDraft): Record<string, unknown> {
  const words = (v: string) => (v.trim() === '' ? null : v.trim());

  return {
    title: words(d.title),
    answer: words(d.answer),
    category_id: d.category_id,
    audience: d.audience || null,
    author_name: words(d.author_name),
    page_width: d.page_width,
    facts: d.facts.filter((f) => f.text.trim() !== '').map((f) => ({ text: f.text.trim(), review_by: f.review_by || null, source_key: f.source_key })),
    meta_title: words(d.meta_title),
    meta_description: words(d.meta_description),
    reader_questions: d.reader_questions.filter((q) => q.q.trim() !== '').map((q) => ({ q: q.q.trim(), a: q.a.trim() })),
    cta_kind: d.cta_kind,
    cta_ref: d.cta_kind === 'service' ? words(d.cta_ref) : null,
    add_to_knowledge: d.add_to_knowledge,
  };
}

/** Who saved the newer copy, and the version to save over it from ("Keep mine"). */
export interface FieldsConflict {
  fieldsVersion: number;
  updatedBy: string | null;
}

function conflictOf(e: unknown): FieldsConflict | null {
  const res = (e as { response?: { status?: number; data?: { errors?: { conflict?: { fields_version?: number; updated_by?: string | null } } } } })?.response;
  const c = res?.status === 409 ? res.data?.errors?.conflict : undefined;

  return c && typeof c.fields_version === 'number' ? { fieldsVersion: c.fields_version, updatedBy: c.updated_by ?? null } : null;
}

const SAVE_AFTER_MS = 800;

/**
 * A post's own fields, autosaved (blog on growth-service S5, step 2). Every save names the `fields_version` it was made
 * from, so a copy older than what is stored is refused (409) instead of overwriting someone's newer words: the author
 * then keeps theirs or loads the latest. Saves run one after another, each from the version the last one returned, and
 * "nothing waiting" means only that what was stored is still what is on screen.
 */
export function usePostFields(uuid: string) {
  const { request, onError } = useGrowth();
  const [post, setPost] = useState<BlogPostDetail | null>(null);
  const [categories, setCategories] = useState<PostCategoryOption[]>([]);
  const [draft, setDraft] = useState<PostFieldsDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<FieldsConflict | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The fields_version this editor last saw, PER POST, so a save answered after the editor moved on records its own.
  const versions = useRef(new Map<string, number>());
  const latest = useRef<PostFieldsDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const dirtyRef = useRef(false);

  const markDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setDirty(v);
  }, []);

  const take = useCallback((p: BlogPostDetail) => {
    versions.current.set(p.uuid, p.fields_version);
    latest.current = postDraftFrom(p);
    setPost(p);
    setDraft(latest.current);
  }, []);

  useEffect(() => {
    let live = true;
    const gen = ++generation.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    request<Envelope<{ post: BlogPostDetail; categories?: PostCategoryOption[] }>>('GET', `blog/posts/${uuid}`)
      .then((res) => {
        if (!live || gen !== generation.current) return;
        const data = unwrap(res);
        take(data.post);
        setCategories(data.categories ?? []);
        setLoadError(null);
        setConflict(null);
        markDirty(false);
      })
      .catch((e) => {
        if (!live) return;
        setLoadError(e);
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, uuid, reloadKey, take, markDirty]);

  /** `leaving`: the editor is closing or moving to another post; send anyway, to the post the change belongs to. */
  const persist = useCallback((next: PostFieldsDraft, leaving = false): Promise<boolean> => {
    const gen = generation.current;
    const forUuid = uuid;
    const run = chain.current.then(async () => {
      const seen = versions.current.get(forUuid);
      // Never save a post this editor could not load, nor a copy the author has since replaced.
      if (seen === undefined || (!leaving && gen !== generation.current)) return false;
      setSaving(true);
      setRefused(null);

      try {
        const res = await request<Envelope<{ post: BlogPostDetail }>>('PUT', `blog/posts/${forUuid}`, { ...postFieldsBody(next), if_fields_version: seen });
        const saved = unwrap(res).post;
        versions.current.set(forUuid, saved.fields_version);
        if (gen !== generation.current) return true;
        setPost(saved); // readiness and the server's view follow each save
        setConflict(null);
        markDirty(latest.current !== next);

        return true;
      } catch (e) {
        if (gen !== generation.current) {
          // The editor has moved on, so no conflict can be offered: say the change did not land.
          onError(conflictOf(e) ? new Error('Your last change to that post was not saved: someone saved it just before you left. Open it again and redo the change.') : e);

          return false;
        }
        const c = conflictOf(e);
        markDirty(true);
        if (c) setConflict(c);
        else {
          const field = fieldError(e);
          if (field) setRefused(field);
          else onError(e);
        }

        return false;
      } finally {
        setSaving(false);
      }
    });
    chain.current = run.catch(() => undefined);

    return run;
  }, [request, onError, uuid, markDirty]);

  /** Change some fields; they are saved a moment after the last change. */
  const set = useCallback((patch: Partial<PostFieldsDraft>) => {
    if (latest.current === null) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setDraft(next);
    markDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist(next);
    }, SAVE_AFTER_MS);
  }, [persist, markDirty]);

  /** Send a waiting change now (before publishing, before leaving). False when it was not stored. */
  const flush = useCallback(async (): Promise<boolean> => {
    const waiting = timer.current !== null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;

    return waiting || dirtyRef.current ? (latest.current ? persist(latest.current) : false) : true;
  }, [persist]);

  /** "Keep mine": save this copy over the newer one, now that the author has chosen to. */
  const keepMine = useCallback(() => {
    if (!conflict || latest.current === null) return;
    versions.current.set(uuid, conflict.fieldsVersion);
    void persist(latest.current);
  }, [conflict, persist, uuid]);

  /** Take the post as another action returned it (a publish): its fields version too, so the next save is not a false conflict. */
  const adopt = useCallback((p: BlogPostDetail) => {
    versions.current.set(p.uuid, p.fields_version);
    setPost(p);
  }, []);

  /** "Load the latest": drop this copy and show what was saved. Nothing waiting is sent. */
  const loadLatest = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setReloadKey((k) => k + 1);
  }, []);

  // Leaving the screen (or opening another post) with a change still waiting SENDS it, from its own version and to its
  // own post: this cleanup belongs to the render that scheduled it.
  useEffect(
    () => () => {
      if (timer.current === null) return;
      clearTimeout(timer.current);
      timer.current = null;
      if (latest.current) void persist(latest.current, true);
    },
    [persist],
  );

  // Closing the tab runs no React cleanup: the browser asks before a change that is not stored is lost.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);

    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return { post, adopt, categories, draft, set, flush, saving, dirty, conflict, keepMine, loadLatest, refused, loadError, reload: loadLatest };
}
