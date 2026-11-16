import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import type { Target } from '../audience/TargetPicker';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { Campaign } from './NewsletterView';

/**
 * The state of one newsletter or alert being written on the service (G5d4c), for `campaignSteps()`.
 *
 * ⚠ RESUMABLE: the draft is SAVED on the service as soon as it has a subject and a body (the checks need a saved
 * campaign, and "Continue later" needs something to come back to); every later save updates THAT draft, never makes a
 * second one. "Continue editing" from the list passes its uuid and the draft is read back as it was left.
 */
export interface CampaignDraft {
  kind: 'regular' | 'alert';
  target: Target;
  /** The one topic it is about ('' = none): only people who chose it, or chose none, receive it. */
  topic: string;
  subject: string;
  preheader: string;
  bodyHtml: string;
  when: 'now' | 'later';
  /** A `datetime-local` value, in the admin's own time. */
  at: string;
}

export interface CampaignCheck { key: string; label: string; pass: boolean; blocking: boolean; detail: string }

export interface CampaignFlow {
  draft: CampaignDraft;
  set: (patch: Partial<CampaignDraft>) => void;
  /** The saved draft's id, once it has one. */
  uuid: string | null;
  /** Reading a draft back ("Continue editing"); the steps wait for it. */
  loading: boolean;
  loadError: string | null;
  topics: Array<{ key: string; label: string }>;
  /** Who it reaches today by the sender's own rules (target, kind, topic, pace, consent); null while counting. */
  reach: number | null;
  reachError: string | null;
  saving: boolean;
  /** Saves (creates or updates) and returns the uuid; null with `refusal` set when it cannot be kept yet. */
  save: () => Promise<string | null>;
  checks: CampaignCheck[] | null;
  /** Saves first (the checks read the stored campaign), then reads its checks. */
  loadChecks: () => Promise<void>;
  submitting: boolean;
  /** A refusal from the service, said on the step that caused it (never only in a toast). */
  refusal: string | null;
  done: Campaign | null;
  submit: () => Promise<Campaign | null>;
}

const BLANK: CampaignDraft = {
  kind: 'regular', target: { mode: 'all', include: [], exclude: [] }, topic: '', subject: '', preheader: '', bodyHtml: '', when: 'now', at: '',
};

interface Stored extends Campaign { body_html?: string; target?: Target | null }

export function useCampaignFlow(uuid: string | null = null): CampaignFlow {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<CampaignDraft>(BLANK);
  const [saved, setSaved] = useState<string | null>(uuid);
  const [loading, setLoading] = useState(uuid !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [topics, setTopics] = useState<Array<{ key: string; label: string }>>([]);
  const [reach, setReach] = useState<number | null>(null);
  const [reachError, setReachError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<CampaignCheck[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<Campaign | null>(null);

  // A draft read back as it was left, and the topics people can choose (the product's own words).
  useEffect(() => {
    let live = true;
    request<Envelope<{ audience: { topics?: Array<{ key: string; label: string }> } }>>('GET', 'settings/audience')
      .then((res) => live && setTopics(unwrap(res).audience.topics ?? []))
      .catch(() => undefined); // no topics shown is the honest fallback; the reach and the send do not depend on it
    if (uuid !== null) {
      request<Envelope<{ campaign: Stored }>>('GET', `campaigns/${uuid}`)
        .then((res) => {
          if (!live) return;
          const c = unwrap(res).campaign;
          setDraft({ ...BLANK, kind: c.kind, subject: c.subject ?? '', preheader: c.preheader ?? '', bodyHtml: c.body_html ?? '', topic: c.topic ?? '', target: c.target ?? BLANK.target });
          setLoading(false);
        })
        .catch((e) => {
          if (!live) return;
          setLoadError(e instanceof Error ? e.message : 'The draft could not be read.');
          setLoading(false);
          onError(e);
        });
    }

    return () => {
      live = false;
    };
  }, [request, onError, uuid]);

  // The reach, recounted a moment after the picks settle (typing a subject keeps the same target object, so it does
  // not recount).
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      request<Envelope<{ reach: number }>>('POST', 'campaigns/estimate', { kind: draft.kind, topic: draft.topic || null, target: draft.target })
        .then((res) => {
          if (!live) return;
          setReach(unwrap(res).reach);
          setReachError(null);
        })
        .catch((e) => live && setReachError(e instanceof Error ? e.message : 'It could not be counted.'));
    }, 400);

    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [request, draft.kind, draft.topic, draft.target]);

  const set = useCallback((patch: Partial<CampaignDraft>) => {
    setRefusal(null);
    if ('kind' in patch || 'topic' in patch || 'target' in patch) setReach(null);
    if ('kind' in patch || 'topic' in patch || 'target' in patch || 'subject' in patch || 'bodyHtml' in patch) setChecks(null);
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const save = useCallback(async (): Promise<string | null> => {
    if (draft.subject.trim() === '' || draft.bodyHtml.replace(/<[^>]+>/g, '').trim() === '') {
      setRefusal('Write a subject and the email first; then the draft is kept.');

      return null;
    }
    setSaving(true);
    try {
      const body = {
        kind: draft.kind, subject: draft.subject.trim(), preheader: draft.preheader.trim() || null, body_html: draft.bodyHtml,
        topic: draft.topic || null, target: draft.target,
      };
      if (saved === null) {
        const created = unwrap(await request<Envelope<{ campaign: Campaign }>>('POST', 'campaigns', body)).campaign.uuid;
        setSaved(created);

        return created;
      }
      await request('PUT', `campaigns/${saved}`, body);

      return saved;
    } catch (e) {
      const why = fieldError(e);
      if (why) setRefusal(why);
      else onError(e);

      return null;
    } finally {
      setSaving(false);
    }
  }, [request, onError, draft, saved]);

  const loadChecks = useCallback(async () => {
    setChecks(null);
    const id = await save();
    if (id === null) return;
    try {
      setChecks(unwrap(await request<Envelope<{ checks: CampaignCheck[] }>>('GET', `campaigns/${id}/checks`)).checks);
    } catch (e) {
      onError(e);
    }
  }, [request, onError, save]);

  const submit = useCallback(async (): Promise<Campaign | null> => {
    setSubmitting(true);
    setRefusal(null);
    try {
      const id = await save();
      if (id === null) return null;
      const res = draft.when === 'now'
        ? await request<Envelope<{ campaign: Campaign }>>('POST', `campaigns/${id}/send`, {})
        : await request<Envelope<{ campaign: Campaign }>>('POST', `campaigns/${id}/schedule`, { scheduled_at: new Date(draft.at).toISOString() });
      const out = unwrap(res).campaign;
      setDone(out);

      return out;
    } catch (e) {
      const why = fieldError(e);
      if (why) setRefusal(why);
      else onError(e);

      return null;
    } finally {
      setSubmitting(false);
    }
  }, [request, onError, draft, save]);

  return { draft, set, uuid: saved, loading, loadError, topics, reach, reachError, saving, save, checks, loadChecks, submitting, refusal, done, submit };
}
