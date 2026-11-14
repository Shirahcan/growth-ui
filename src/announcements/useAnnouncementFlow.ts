import { useCallback, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import type { Target } from '../audience/TargetPicker';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { Announcement } from './AnnouncementsView';

/**
 * The state of one announcement being written (G5c3d), for `announcementSteps()`. Nothing is saved until the last
 * step's verb: then the draft is created on the service and published or scheduled in the same go, so an admin never
 * leaves a half-made draft behind by walking away from the wizard.
 */
export interface AnnouncementDraft {
  target: Target;
  subject: string;
  /** Plain words; each blank line starts a new paragraph. */
  body: string;
  surfaces: string[];
  inbox: boolean;
  theme: string | null;
  requiresAck: boolean;
  ctaLabel: string;
  ctaUrl: string;
  when: 'now' | 'later';
  /** `datetime-local` values, in the admin's own time. */
  at: string;
  ends: string;
}

export interface AnnouncementFlow {
  draft: AnnouncementDraft;
  set: (patch: Partial<AnnouncementDraft>) => void;
  submitting: boolean;
  /** A refusal from the service, said on the review step (never only in a toast). */
  refusal: string | null;
  done: Announcement | null;
  submit: () => Promise<Announcement | null>;
}

const BLANK: AnnouncementDraft = {
  target: { mode: 'all', include: [], exclude: [] }, subject: '', body: '', surfaces: [], inbox: false, theme: null,
  requiresAck: false, ctaLabel: '', ctaUrl: '', when: 'now', at: '', ends: '',
};

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The words as paragraphs, each escaped: an admin's text is never read as markup. */
export function bodyHtml(body: string): string {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('');
}

export function useAnnouncementFlow(start: Partial<AnnouncementDraft> = {}): AnnouncementFlow {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<AnnouncementDraft>({ ...BLANK, ...start });
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<Announcement | null>(null);
  // Saved but not yet published (the publish was refused): a retry updates THIS draft, never makes a second one.
  const [savedUuid, setSavedUuid] = useState<string | null>(null);

  const set = useCallback((patch: Partial<AnnouncementDraft>) => {
    setRefusal(null);
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setRefusal(null);
    try {
      const body = {
        subject: draft.subject.trim(),
        body_html: bodyHtml(draft.body),
        target: draft.target,
        presentation: {
          surfaces: draft.surfaces, theme: draft.theme, requires_ack: draft.requiresAck,
          cta_label: draft.ctaLabel.trim() || null, cta_url: draft.ctaUrl.trim() || null,
          channels: { inbox: draft.inbox, email: false },
        },
        expires_at: draft.ends ? new Date(draft.ends).toISOString() : null,
      };
      let uuid = savedUuid;
      if (uuid === null) {
        uuid = unwrap(await request<Envelope<{ announcement: Announcement }>>('POST', 'announcements', body)).announcement.uuid;
        setSavedUuid(uuid);
      } else {
        await request('PUT', `announcements/${uuid}`, body);
      }
      const res = draft.when === 'now'
        ? await request<Envelope<{ announcement: Announcement }>>('POST', `announcements/${uuid}/publish`, {})
        : await request<Envelope<{ announcement: Announcement }>>('POST', `announcements/${uuid}/schedule`, { scheduled_at: new Date(draft.at).toISOString() });
      const out = unwrap(res).announcement;
      setDone(out);

      return out;
    } catch (e) {
      const message = fieldError(e);
      if (message) setRefusal(message);
      else onError(e);

      return null;
    } finally {
      setSubmitting(false);
    }
  }, [request, onError, draft, savedUuid]);

  return { draft, set, submitting, refusal, done, submit };
}
