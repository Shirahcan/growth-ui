import { useCallback, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { LandingPage } from './types';

/**
 * The state of one landing page being made or edited (shared program G7b5b; source: Portify's landing wizard), for
 * `landingSteps()`. Nothing is saved until the last step's verb: the page is saved on the service, the PDF (if one was
 * chosen) goes through the HOST's server (`uploadFile`: a file never travels through the browser's JSON proxy), and a
 * new fixed-form page is published when the person chose "Publish now". A retry after a refusal updates the SAME page.
 */
export interface LandingDraft {
  layout: 'form' | 'pml';
  name: string;
  slug: string;
  /** The person typed an address: it stops following the name. */
  slugTouched: boolean;
  audience: string;
  headline: string;
  intro: string;
  question: string;
  button: string;
  deliverable: LandingPage['deliverable_kind'];
  bookingUrl: string;
  createsLead: boolean;
  /** The page already has a file (editing): choosing another is optional. */
  hasFile: boolean;
  consent: string;
  /** Comma separated, as typed. */
  tags: string;
  /** Empty until chosen: a new page must say who can find it. */
  exposure: LandingPage['search_exposure'] | '';
  publish: 'now' | 'draft';
  /** A designed page's format, picked in the host's own picker; null lets the assistant decide. */
  template: string | null;
}

export interface LandingFlow {
  draft: LandingDraft;
  set: (patch: Partial<LandingDraft>) => void;
  /** The PDF chosen in this visit (a file cannot live in a saved draft). */
  file: File | null;
  setFile: (file: File | null) => void;
  editing: boolean;
  submitting: boolean;
  /** A refusal from the service, said on the review step (never only in a toast). */
  refusal: string | null;
  done: LandingPage | null;
  submit: () => Promise<LandingPage | null>;
}

export interface LandingFlowOptions {
  /** The page being edited; absent for a new page. */
  page?: LandingPage | null;
  /** The host's starting words (its consent line, its first audience). */
  start?: Partial<LandingDraft>;
  /** Sends the chosen PDF from the host's server to `landing-pages/{uuid}/file`; refusals come back as thrown errors. */
  uploadFile?: (pageUuid: string, file: File) => Promise<unknown>;
}

export const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

const BLANK: LandingDraft = {
  layout: 'form', name: '', slug: '', slugTouched: false, audience: '', headline: '', intro: '', question: '', button: 'Send it to me',
  deliverable: 'none', bookingUrl: '', createsLead: false, hasFile: false, consent: '', tags: '', exposure: '', publish: 'now', template: null,
};

export function draftFrom(page: LandingPage): LandingDraft {
  return {
    layout: page.layout, name: page.name, slug: page.slug, slugTouched: true, audience: page.audience, headline: page.headline,
    intro: page.intro ?? '', question: page.question_label ?? '', button: page.button_label, deliverable: page.deliverable_kind,
    bookingUrl: page.booking_url ?? '', createsLead: page.creates_lead, hasFile: page.has_file, consent: page.consent_label,
    tags: page.tags.join(', '), exposure: page.search_exposure, publish: 'draft', template: null,
  };
}

/** What the service's create and update take. */
export function inputFrom(d: LandingDraft, editing: boolean): Record<string, unknown> {
  return {
    name: d.name.trim(), slug: d.slug, headline: d.headline.trim(), intro: d.intro.trim() || null, question_label: d.question.trim() || null,
    button_label: d.button.trim(), consent_label: d.consent.trim(), audience: d.audience,
    tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
    deliverable_kind: d.deliverable, booking_url: d.deliverable === 'booking_link' ? d.bookingUrl.trim() : null, creates_lead: d.createsLead,
    search_exposure: d.exposure || 'search',
    ...(editing ? {} : { layout: d.layout }),
  };
}

export function useLandingFlow({ page = null, start = {}, uploadFile }: LandingFlowOptions = {}): LandingFlow {
  const { request, onError } = useGrowth();
  const editing = page !== null;
  const [draft, setDraft] = useState<LandingDraft>(() => (page ? draftFrom(page) : { ...BLANK, ...start }));
  const [file, setFileState] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<LandingPage | null>(null);
  const [savedUuid, setSavedUuid] = useState<string | null>(page?.uuid ?? null);

  const set = useCallback((patch: Partial<LandingDraft>) => {
    setRefusal(null);
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setFile = useCallback((next: File | null) => {
    setRefusal(null);
    setFileState(next);
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setRefusal(null);
    try {
      const body = inputFrom(draft, savedUuid !== null);
      let saved: LandingPage;
      if (savedUuid === null) {
        saved = unwrap(await request<Envelope<{ page: LandingPage }>>('POST', 'landing-pages', body)).page;
        setSavedUuid(saved.uuid);
      } else {
        saved = unwrap(await request<Envelope<{ page: LandingPage }>>('PUT', `landing-pages/${savedUuid}`, body)).page;
      }
      if (draft.deliverable === 'file' && file !== null) {
        if (!uploadFile) throw new Error('Files cannot be sent from here yet: this site has not connected file uploads.');
        await uploadFile(saved.uuid, file);
        // The page has its file now: a later check (the host's shell re-validates every step) must not ask for it again.
        setFileState(null);
        setDraft((d) => ({ ...d, hasFile: true }));
        saved = { ...saved, has_file: true };
      }
      if (!editing && draft.layout === 'form' && draft.publish === 'now') {
        saved = unwrap(await request<Envelope<{ page: LandingPage }>>('POST', `landing-pages/${saved.uuid}/publish`, {})).page;
      }
      setDone(saved);

      return saved;
    } catch (e) {
      const message = fieldError(e);
      if (message) setRefusal(message);
      else onError(e);

      return null;
    } finally {
      setSubmitting(false);
    }
  }, [request, onError, draft, file, savedUuid, editing, uploadFile]);

  return { draft, set, file, setFile, editing, submitting, refusal, done, submit };
}
