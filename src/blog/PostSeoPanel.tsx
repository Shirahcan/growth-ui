import { useCallback, useEffect, useState } from 'react';

import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import type { PostHeadSite, PostHeadSource } from '../public/postHead';
import { Button, INPUT } from '../ui/primitives';
import { SeoChecksList } from './seo/SeoChecksList';
import { MeteredField, SearchResultPreview } from './seo/SeoPieces';
import { SeoAdvancedTab, SeoSchemaTab, SeoSocialTab, type SeoFieldsAccess } from './seo/SeoTabs';

/** One search check: what it looks at, whether it passes, and where to fix it (a part of the design OR a field). */
export interface SeoItem {
  label: string;
  ok: boolean;
  weight: number;
  part?: string;
  field?: string;
}

export interface SeoGroup {
  name: string;
  errors: number;
  items: SeoItem[];
}

/** growth-service `GET blog/posts/{uuid}/document/seo`. The thresholds are the product's own setting (blog.seo). */
export interface SeoResult {
  score: number;
  pass: number;
  groups: SeoGroup[];
  serp: { url: string; title: string; description: string };
  /** The product's own length limits, for the meters (absent from an older service: no meters). */
  limits?: { title_max: number; meta_min: number; meta_max: number; url_max: number };
  /** The draft as the public page will receive it, for the Schema and Social tabs (the page's own builders). */
  preview?: PostHeadSource & { url: string | null };
}

/** Where a check is fixed: a part of the design (scroll to it) or one of the post's fields (open it). */
export type SeoJump = { part: string } | { field: string };

/** The score's colour, as the reference studio shows it: good, fair, poor. */
export function seoScoreColor(score: number): string {
  return score >= 81 ? '#15803D' : score >= 51 ? '#C27803' : '#C62828';
}

/**
 * A post's search checks, read from growth-service and read again whenever `refreshKey` changes (the host bumps it
 * after each save, so the score moves as the author works). Deterministic: no model call.
 */
export function usePostSeo(uuid: string, refreshKey: unknown): { seo: SeoResult | null; failed: boolean; reload: () => void } {
  const { request, onError } = useGrowth();
  const [seo, setSeo] = useState<SeoResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let alive = true;

    request<Envelope<SeoResult>>('GET', `blog/posts/${uuid}/document/seo`)
      .then((res) => {
        if (!alive) return;
        setSeo(unwrap(res));
        setFailed(false);
      })
      .catch((e) => {
        if (!alive) return;
        setFailed(true);
        onError(e);
      });

    return () => {
      alive = false;
    };
  }, [request, onError, uuid, refreshKey, reads]);

  return { seo, failed, reload: useCallback(() => setReads((n) => n + 1), []) };
}

/** The score chip for the host's bar ("74/100"), opening the panel. */
export function PostSeoScore({ score, onOpen }: { score: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Search score ${score} out of 100. Open the search checks.`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #E4E4EF', borderRadius: 7, padding: '4px 10px 4px 5px', fontWeight: 700, fontSize: 12, background: '#fff', whiteSpace: 'nowrap', outline: 'none', cursor: 'pointer' }}
    >
      <span style={{ borderRadius: 5, padding: '2px 6px', color: '#fff', background: seoScoreColor(score), fontVariantNumeric: 'tabular-nums' }}>{score}</span>/100
    </button>
  );
}

interface FieldsRead {
  values: Record<string, unknown>;
  revision: number | string;
}

export interface PostSeoPanelProps {
  uuid: string;
  /** Changes after each save of the design, so the checks are read again. */
  refreshKey?: unknown;
  /** Where a check is fixed: the host scrolls to the part or opens the field. */
  onJump?: (to: SeoJump) => void;
  /** A setting was saved here: the host reads the score again wherever else it shows it (its bar's chip). */
  onSaved?: () => void;
  /** The site the post lives on, for the Schema and Social tabs. Absent: those tabs say the site's details are not set. */
  site?: PostHeadSite;
  /** The host's own share picture for a post with no cover (Portify's generated brand card), from the post as it stands. */
  shareImage?: (post: PostHeadSource) => string | null;
  /**
   * Asks the host's assistant (its designer console) to write the search title and description from the post. The
   * console drafts and the person applies, as with every detail it drafts; absent, the button is not offered.
   */
  onDraftSnippet?: () => void;
}

type SeoTab = 'general' | 'advanced' | 'schema' | 'social';

const TABS: Array<{ key: SeoTab; label: string }> = [
  { key: 'general', label: 'General' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'schema', label: 'Schema' },
  { key: 'social', label: 'Social' },
];

/** A refused save's own reason (a field's validation message), else the error's message. */
function refusal(e: unknown): string {
  const body = (e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } })?.response?.data;
  const first = body?.errors ? Object.values(body.errors).flat()[0] : undefined;

  return first ?? body?.message ?? (e instanceof Error ? e.message : 'It could not be saved.');
}

/**
 * The post's search panel, BARE CONTENT for the host's slide-in panel (owner 2026-11-17 T2 and 2026-11-18: "all SEO and
 * meta surfaces, options, and config", as the reference studio's Rank Math sidebar): the score against the pass mark,
 * then four tabs. General: the search result (desktop and phone), the snippet (search title, address, search
 * description, each against the product's own limits), the keywords and the checks, each opening where it is fixed.
 * Advanced: listing, following links, the canonical address. Schema: the structured data the page will emit. Social:
 * the share card. Every setting is the post's own field, saved through the guarded fields save with its revision.
 */
export function PostSeoPanel({ uuid, refreshKey, onJump, onSaved, site, shareImage, onDraftSnippet }: PostSeoPanelProps) {
  const { request, onError, canEdit } = useGrowth();
  const [saves, setSaves] = useState(0);
  const { seo, failed, reload } = usePostSeo(uuid, `${String(refreshKey)}:${saves}`);
  const [tab, setTab] = useState<SeoTab>('general');
  const [mobile, setMobile] = useState(false);
  const [fields, setFields] = useState<FieldsRead | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [conflict, setConflict] = useState(false);

  const readFields = useCallback(() => {
    request<Envelope<FieldsRead>>('GET', `blog/posts/${uuid}/document/fields`)
      .then((res) => {
        setFields(unwrap(res));
        setEdits({});
        setConflict(false);
      })
      .catch(onError);
  }, [request, onError, uuid]);

  useEffect(() => {
    readFields();
  }, [readFields]);

  /** One field through the guarded save; a changed-elsewhere copy says so and is never overwritten. */
  const save = useCallback(
    async (name: string, value: string | boolean): Promise<string | null> => {
      if (!fields || fields.values[name] === value) return null;
      try {
        const res = await request<Envelope<{ revision: number | string }>>('PUT', `blog/posts/${uuid}/document/fields/${name}`, { value, revision: String(fields.revision), session: `growth-seo:${uuid}` });
        const saved = unwrap(res);
        setFields((was) => (was ? { values: { ...was.values, [name]: value }, revision: saved.revision } : was));
        setSaves((n) => n + 1);
        onSaved?.();

        return null;
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          setConflict(true);

          return null;
        }
        // A field's own refusal (422) stays on the field; anything else goes to the host's error surface too.
        if (status !== 422) onError(e);

        return refusal(e);
      }
    },
    [fields, request, uuid, onSaved, onError],
  );

  if (failed && !seo) {
    return (
      <div role="alert" className="gr-notice">
        <p>The search checks could not be read.</p>
        <div>
          <Button onClick={reload}>Try again</Button>
        </div>
      </div>
    );
  }
  if (!seo) return <p className="gr-hint">Reading the search checks…</p>;

  const value = (name: string): string => edits[name] ?? String(fields?.values[name] ?? '');
  const edit = (name: string) => (v: string) => {
    setEdits((was) => ({ ...was, [name]: v }));
    setErrors((was) => ({ ...was, [name]: null }));
  };
  const commit = (name: string) => (v: string) => {
    void save(name, v).then((err) => setErrors((was) => ({ ...was, [name]: err })));
  };
  const access: SeoFieldsAccess | null = fields ? { values: fields.values, save, canEdit } : null;
  const chips = value('secondary_keywords').split(',').map((k) => k.trim()).filter(Boolean);
  const focus = value('focus_keyword').trim();
  const limits = seo.limits;
  const preview = seo.preview;

  return (
    <div className="gr-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, borderRadius: 6, padding: '3px 9px', color: '#fff', background: seoScoreColor(seo.score), fontVariantNumeric: 'tabular-nums' }}>{seo.score}/100</span>
        <span className="gr-hint">{seo.score >= seo.pass ? `At or above the pass mark (${seo.pass}).` : `The pass mark is ${seo.pass}.`}</span>
      </div>

      {conflict ? (
        <p role="alert" className="gr-notice">
          These settings were changed somewhere else after you opened this.{' '}
          <Button onClick={readFields}>Load the latest</Button>
        </p>
      ) : null}

      <div role="tablist" aria-label="Search settings" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E4E4EF' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`gr-seo-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`gr-seo-pane-${t.key}`}
            onClick={() => setTab(t.key)}
            style={{ border: 0, background: 'none', padding: '7px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', outline: 'none', color: tab === t.key ? 'var(--gr-accent, #4361ee)' : '#5A5A80', borderBottom: `2px solid ${tab === t.key ? 'var(--gr-accent, #4361ee)' : 'transparent'}` }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`gr-seo-pane-${tab}`} aria-labelledby={`gr-seo-tab-${tab}`} className="gr-stack">
        {tab === 'general' ? (
          <>
            <section className="gr-stack" aria-labelledby="gr-seo-serp">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h3 id="gr-seo-serp" className="gr-section-title">In search results</h3>
                <div role="group" aria-label="Preview size" style={{ display: 'flex', gap: 4 }}>
                  {(['Desktop', 'Mobile'] as const).map((label) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={(label === 'Mobile') === mobile}
                      onClick={() => setMobile(label === 'Mobile')}
                      style={{ borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, border: '1px solid #E4E4EF', background: (label === 'Mobile') === mobile ? '#EEEEFF' : '#fff', color: '#0B0A33', outline: 'none', cursor: 'pointer' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <SearchResultPreview url={seo.serp.url} title={seo.serp.title} description={seo.serp.description} mobile={mobile} />
            </section>

            <details open style={{ border: '1px solid #E4E4EF', borderRadius: 8 }}>
              <summary style={{ padding: '10px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Edit snippet</summary>
              <div className="gr-stack" style={{ padding: '0 12px 12px' }}>
                <MeteredField name="meta_title" label="Search title" value={value('meta_title')} onChange={edit('meta_title')} onCommit={commit('meta_title')} max={limits?.title_max} disabled={!canEdit || !fields} error={errors.meta_title} placeholder={String(fields?.values.title ?? '')} hint="Empty uses the post's title. The site's name is added after it." />
                <div className="gr-stack" style={{ gap: 4 }}>
                  <span className="gr-row-title" style={{ fontSize: 13 }}>Address</span>
                  <code style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{String(fields?.values.slug ?? '')}</code>
                  <p className="gr-hint" style={{ margin: 0 }}>Follows the title until the post is first published, then never changes, so shared links keep working.</p>
                </div>
                <MeteredField name="meta_description" label="Search description" value={value('meta_description')} onChange={edit('meta_description')} onCommit={commit('meta_description')} rows={4} min={limits?.meta_min} max={limits?.meta_max} disabled={!canEdit || !fields} error={errors.meta_description} />
                {onDraftSnippet && canEdit ? (
                  <div>
                    <Button onClick={onDraftSnippet}>Draft the title and description with the assistant</Button>
                  </div>
                ) : null}
              </div>
            </details>

            <section className="gr-stack" aria-labelledby="gr-seo-keywords">
              <h3 id="gr-seo-keywords" className="gr-section-title">Keywords</h3>
              <label className="gr-stack">
                <span className="gr-row-title">Focus keyword</span>
                <input name="focus_keyword" className={INPUT} value={value('focus_keyword')} disabled={!canEdit || !fields} onChange={(e) => edit('focus_keyword')(e.target.value)} onBlur={(e) => commit('focus_keyword')(e.target.value.trim())} placeholder="The phrase readers search for" />
              </label>
              <label className="gr-stack">
                <span className="gr-row-title">Secondary keywords</span>
                <input name="secondary_keywords" className={INPUT} value={value('secondary_keywords')} disabled={!canEdit || !fields} onChange={(e) => edit('secondary_keywords')(e.target.value)} onBlur={(e) => commit('secondary_keywords')(e.target.value.trim())} placeholder="Separated by commas" />
              </label>
              {focus || chips.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="Keywords in use">
                  {focus ? <span style={{ background: 'var(--gr-accent, #4361ee)', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>{focus}</span> : null}
                  {chips.map((k) => (
                    <span key={k} style={{ background: '#EEEEFF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>{k}</span>
                  ))}
                </div>
              ) : null}
            </section>

            <SeoChecksList groups={seo.groups} onJump={onJump} />
          </>
        ) : tab === 'advanced' ? (
          access ? <SeoAdvancedTab key={`adv-${String(fields?.revision)}`} access={access} /> : <p className="gr-hint">Reading the post&apos;s settings…</p>
        ) : !site || !preview ? (
          <p className="gr-notice">This tab needs the site&apos;s own details, which this page has not passed in.</p>
        ) : tab === 'schema' ? (
          <SeoSchemaTab preview={preview} site={site} fallbackImage={shareImage?.(preview) ?? null} />
        ) : access ? (
          <SeoSocialTab key={`soc-${String(fields?.revision)}`} access={access} preview={preview} site={site} fallbackImage={shareImage?.(preview) ?? null} />
        ) : (
          <p className="gr-hint">Reading the post&apos;s settings…</p>
        )}
      </div>
    </div>
  );
}
