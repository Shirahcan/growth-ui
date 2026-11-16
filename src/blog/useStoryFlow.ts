import { useCallback, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { ConsentMethod, Story } from './types';

/** What the guided add holds (post-and-newsletter-layouts B6) until it saves the story. */
export interface StoryDraft {
  case_type: string;
  challenge: string;
  strategy: string;
  outcome: string;
  how_found: string;
  consent_method: ConsentMethod | null;
  /** yyyy-mm-dd, the day the client agreed. */
  consent_on: string;
  /** The host's reference for the consent proof it keeps (never the file itself). */
  evidence_ref: string | null;
  /** Save it ready for a check (needs consent) or as a draft to finish later. */
  ready: boolean;
}

export const EMPTY_STORY: StoryDraft = {
  case_type: '', challenge: '', strategy: '', outcome: '', how_found: '',
  consent_method: null, consent_on: '', evidence_ref: null, ready: true,
};

export interface StoryFlow {
  draft: StoryDraft;
  patch: (p: Partial<StoryDraft>) => void;
  hasConsent: boolean;
  saving: boolean;
  refusal: string | null;
  saved: Story | null;
  save: () => Promise<Story | null>;
}

/** The viewer's own today, as yyyy-mm-dd (what a date input holds), never the UTC day. */
export function localToday(): string {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * The day the client agreed, as the instant the service stores. Today is sent as NOW: noon UTC of today can still be
 * in the future (a morning in Lagos, an evening in Vancouver is already tomorrow in UTC) and the service refuses a
 * consent dated after now. An earlier day is sent at noon UTC, which stays that day in every zone from UTC-11 to +11.
 */
export function consentAt(day: string): string | null {
  if (day === '') return null;

  return day === localToday() ? new Date().toISOString() : `${day}T12:00:00Z`;
}

/** The guided add's state and its one call: create the story (growth-service keeps "ready needs consent"). */
export function useStoryFlow(): StoryFlow {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<StoryDraft>(EMPTY_STORY);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saved, setSaved] = useState<Story | null>(null);

  const patch = useCallback((p: Partial<StoryDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const hasConsent = draft.consent_method !== null && draft.consent_on !== '';

  const save = useCallback(async (): Promise<Story | null> => {
    setSaving(true);
    setRefusal(null);
    const text = (v: string) => (v.trim() === '' ? null : v.trim());
    try {
      const res = await request<Envelope<{ story: Story }>>('POST', 'stories', {
        case_type: draft.case_type.trim(),
        challenge: draft.challenge.trim(),
        strategy: draft.strategy.trim(),
        outcome: draft.outcome.trim(),
        how_found: text(draft.how_found),
        consent_method: draft.consent_method,
        consent_at: consentAt(draft.consent_on),
        consent_evidence_media_id: draft.evidence_ref,
        status: draft.ready && hasConsent ? 'ready' : 'draft',
      });
      const story = unwrap(res).story;
      setSaved(story);

      return story;
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefusal(field);
      else onError(e);

      return null;
    } finally {
      setSaving(false);
    }
  }, [request, onError, draft, hasConsent]);

  return { draft, patch, hasConsent, saving, refusal, saved, save };
}
