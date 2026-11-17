import { useCallback, useEffect, useState } from 'react';

import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, INPUT } from '../ui/primitives';

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
}

/**
 * The post's search panel (owner 2026-11-17, T2: mirror the reference studio's Rank Math sidebar), BARE CONTENT for the
 * host's slide-in panel: the score against the pass mark, how the post shows in search (desktop and mobile), its focus
 * and secondary keywords (the post's own fields, saved on leaving the box with the fields' revision), and the checks in
 * their groups, each opening where it is fixed. The thresholds live in the product's settings on the service, so the
 * labels carry the numbers and this panel never restates them.
 */
export function PostSeoPanel({ uuid, refreshKey, onJump }: PostSeoPanelProps) {
  const { request, onError, canEdit } = useGrowth();
  const [saves, setSaves] = useState(0);
  const { seo, failed, reload } = usePostSeo(uuid, `${String(refreshKey)}:${saves}`);
  const [mobile, setMobile] = useState(false);
  const [fields, setFields] = useState<FieldsRead | null>(null);
  const [focus, setFocus] = useState('');
  const [secondary, setSecondary] = useState('');
  const [conflict, setConflict] = useState(false);

  const readFields = useCallback(() => {
    request<Envelope<FieldsRead>>('GET', `blog/posts/${uuid}/document/fields`)
      .then((res) => {
        const read = unwrap(res);
        setFields(read);
        setFocus(String(read.values.focus_keyword ?? ''));
        setSecondary(String(read.values.secondary_keywords ?? ''));
        setConflict(false);
      })
      .catch(onError);
  }, [request, onError, uuid]);

  useEffect(() => {
    readFields();
  }, [readFields]);

  async function save(name: 'focus_keyword' | 'secondary_keywords', value: string) {
    if (!fields || String(fields.values[name] ?? '') === value) return;
    try {
      const res = await request<Envelope<{ revision: number | string }>>('PUT', `blog/posts/${uuid}/document/fields/${name}`, { value, revision: String(fields.revision), session: `growth-seo:${uuid}` });
      const saved = unwrap(res);
      setFields({ values: { ...fields.values, [name]: value }, revision: saved.revision });
      setSaves((n) => n + 1);
    } catch (e) {
      // Changed somewhere else meanwhile: say so and offer the latest, never overwrite.
      if ((e as { response?: { status?: number } })?.response?.status === 409) setConflict(true);
      else onError(e);
    }
  }

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

  const chips = secondary.split(',').map((k) => k.trim()).filter(Boolean);

  return (
    <div className="gr-stack">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, borderRadius: 6, padding: '3px 9px', color: '#fff', background: seoScoreColor(seo.score), fontVariantNumeric: 'tabular-nums' }}>{seo.score}/100</span>
        <span className="gr-hint">{seo.score >= seo.pass ? `At or above the pass mark (${seo.pass}).` : `The pass mark is ${seo.pass}.`}</span>
      </div>

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
        <div style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: 12, display: 'grid', gap: 3, background: '#fff', maxWidth: mobile ? 300 : undefined }}>
          <span style={{ fontSize: 12, color: '#4D5156', overflowWrap: 'anywhere' }}>{seo.serp.url}</span>
          <span style={{ fontSize: mobile ? 16 : 18, color: '#1A0DAB', lineHeight: 1.3 }}>{seo.serp.title || 'The post’s search title'}</span>
          <span style={{ fontSize: 13, color: '#4D5156', lineHeight: 1.5 }}>{seo.serp.description || 'The post’s search description shows here.'}</span>
        </div>
      </section>

      <section className="gr-stack" aria-labelledby="gr-seo-keywords">
        <h3 id="gr-seo-keywords" className="gr-section-title">Keywords</h3>
        {conflict ? (
          <p role="alert" className="gr-notice">
            These keywords were changed somewhere else after you opened this.{' '}
            <Button onClick={readFields}>Load the latest</Button>
          </p>
        ) : null}
        <label className="gr-stack">
          <span className="gr-row-title">Focus keyword</span>
          <input className={INPUT} value={focus} disabled={!canEdit || !fields} onChange={(e) => setFocus(e.target.value)} onBlur={(e) => void save('focus_keyword', e.target.value.trim())} placeholder="The phrase readers search for" />
        </label>
        <label className="gr-stack">
          <span className="gr-row-title">Secondary keywords</span>
          <input className={INPUT} value={secondary} disabled={!canEdit || !fields} onChange={(e) => setSecondary(e.target.value)} onBlur={(e) => void save('secondary_keywords', e.target.value.trim())} placeholder="Separated by commas" />
        </label>
        {focus.trim() || chips.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label="Keywords in use">
            {focus.trim() ? <span style={{ background: '#625FFB', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>{focus.trim()}</span> : null}
            {chips.map((k) => (
              <span key={k} style={{ background: '#EEEEFF', color: '#4F46E5', borderRadius: 6, padding: '3px 8px', fontSize: 12, fontWeight: 600 }}>{k}</span>
            ))}
          </div>
        ) : null}
      </section>

      {seo.groups.map((group) => (
        <details key={group.name} open={group.errors > 0} style={{ border: '1px solid #E4E4EF', borderRadius: 8 }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
            {group.name}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 8px', background: group.errors > 0 ? '#FDECEC' : '#E7F6EC', color: group.errors > 0 ? '#C62828' : '#15803D' }}>
              {group.errors > 0 ? `${group.errors} to fix` : 'All passed'}
            </span>
          </summary>
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 12px 12px', display: 'grid', gap: 8 }}>
            {group.items.map((item) => {
              const to: SeoJump | null = item.part ? { part: item.part } : item.field ? { field: item.field } : null;

              return (
                <li key={item.label} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 8, fontSize: 12.5, lineHeight: 1.45 }}>
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#fff', marginTop: 1, background: item.ok ? '#15803D' : '#C62828' }}>
                    {item.ok ? '✓' : '✗'}
                  </span>
                  {to && onJump ? (
                    <button type="button" onClick={() => onJump(to)} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', outline: 'none' }}>
                      <span className="gr-sr-only">{item.ok ? 'Passed: ' : 'To fix: '}</span>
                      {item.label}
                    </button>
                  ) : (
                    <span>
                      <span className="gr-sr-only">{item.ok ? 'Passed: ' : 'To fix: '}</span>
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
