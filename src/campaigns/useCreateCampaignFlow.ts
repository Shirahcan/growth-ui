import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import type { TemplatePreview } from '../blog/useCreatePostFlow';
import type { Campaign } from './NewsletterView';

/** An email layout the create flow offers (the service's `GET layouts?kind=email`). */
export interface CampaignTemplate {
  key: string;
  name: string;
  /** How many parts the structure has, so the choice says how much it holds. */
  parts: number;
}

/** What the create flow decides. Kept as the host wizard's draft, so an interrupted pick is resumed. */
export interface CreateCampaignDraft {
  kind: 'regular' | 'alert';
  layout_key: string | null;
  subject: string;
  /**
   * "document": the assistant prepares the newsletter from a file in the designer's console (0.24.0, N1h-5); "template":
   * it opens with the template's guidance. A draft saved before 0.24.0 has none, which reads as "template".
   */
  start?: 'document' | 'template';
}

/** A campaign as the service answers its creation: the list's shape plus how it is written. */
export type CreatedCampaign = Campaign & { body_format?: string; layout_key?: string | null };

export interface CreateCampaignFlow {
  draft: CreateCampaignDraft;
  patch: (p: Partial<CreateCampaignDraft>) => void;
  /** The newsletter's source document, while "start" is "document" (a File never goes into the saved draft). */
  document: File | null;
  setDocument: (file: File | null) => void;
  /** null while loading. */
  templates: CampaignTemplate[] | null;
  /** Each template's preview by key: undefined while loading, null when it could not be drawn (the card shows its shape). */
  previews: Record<string, TemplatePreview | null>;
  loadError: string | null;
  reload: () => void;
  creating: boolean;
  /** The service's refusal, in its words, drawn on the step. */
  refusal: string | null;
  /** Creates the campaign from the picked template, as a draft; null when refused (the step says why). */
  create: () => Promise<CreatedCampaign | null>;
}

export interface CreateCampaignFlowOptions {
  /** The template picked before the author chooses (the product's default, e.g. Portify's "Portify Weekly"); else the first. */
  defaultTemplate?: string;
}

/** Inbox guidance, as the service's field labels say it: longer still saves, but gets cut off in most inboxes. */
export const SUBJECT_GUIDE = 45;

/**
 * Creating a newsletter or an alert (blog on growth-service N1e): pick the kind, an email template and the subject, and
 * the campaign starts as the template's structure, opened in the host's email designer. The service makes the draft
 * (`POST campaigns` with `layout_key`; a designed campaign has no hand-written body); this hook holds the choices.
 * Nothing is sent from here: sending is the designer's Send, which asks first.
 */
export function useCreateCampaignFlow(options: CreateCampaignFlowOptions = {}): CreateCampaignFlow {
  const { request, onError } = useGrowth();
  const [draft, setDraft] = useState<CreateCampaignDraft>({ kind: 'regular', layout_key: null, subject: '', start: 'template' });
  const [document, setDocument] = useState<File | null>(null);
  const [templates, setTemplates] = useState<CampaignTemplate[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, TemplatePreview | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { defaultTemplate } = options;

  const patch = useCallback((p: Partial<CreateCampaignDraft>) => setDraft((d) => ({ ...d, ...p })), []);

  useEffect(() => {
    let live = true;
    request<Envelope<{ layouts: CampaignTemplate[] }>>('GET', 'layouts?kind=email')
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

  // Each template's preview, once the list is in (a few templates; one read each). An email template comes back as the
  // email itself (`html`), drawn in a sandboxed frame. A preview that cannot be drawn is only a missing picture.
  useEffect(() => {
    if (!templates) return;
    let live = true;
    templates.forEach((t) => {
      request<Envelope<{ starter: TemplatePreview }>>('GET', `layouts/${encodeURIComponent(t.key)}?starter=1`)
        .then((res) => {
          const starter = unwrap(res).starter;
          if (live) setPreviews((p) => ({ ...p, [t.key]: { nodes: starter?.nodes ?? [], tree: starter?.tree ?? null, html: p[t.key]?.html ?? starter?.html ?? null } }));
        })
        .catch(() => {
          if (live) setPreviews((p) => ({ ...p, [t.key]: null }));
        });
      // The email as a reader's inbox shows it (growth templates D3): sample words and a sample picture instead of the
      // guidance brackets and a grey box. A service without it keeps the starter's email.
      request<Envelope<{ preview: { kind: string; html?: string } }>>('GET', `layouts/${encodeURIComponent(t.key)}/reader-preview`)
        .then((res) => {
          const html = unwrap(res).preview?.html;
          if (live && html) setPreviews((p) => ({ ...p, [t.key]: { nodes: p[t.key]?.nodes ?? [], tree: p[t.key]?.tree ?? null, html } }));
        })
        .catch(() => undefined);
    });

    return () => {
      live = false;
    };
  }, [request, templates]);

  // The person's subject, always: the assistant keeps a team's own subject when it prepares from a document (it only
  // writes an empty one), so a placeholder here would block it and a typed one is never overwritten (0.24.1).
  const subject = draft.subject.trim();

  const create = useCallback(async (): Promise<CreatedCampaign | null> => {
    if (!draft.layout_key || subject === '') return null;
    setCreating(true);
    setRefusal(null);
    try {
      const res = await request<Envelope<{ campaign: CreatedCampaign }>>('POST', 'campaigns', {
        kind: draft.kind,
        subject,
        layout_key: draft.layout_key,
      });

      return unwrap(res).campaign;
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefusal(field);
      else onError(e);

      return null;
    } finally {
      setCreating(false);
    }
  }, [request, onError, draft.kind, subject, draft.layout_key]);

  return { draft, patch, document, setDocument, templates, previews, loadError, reload: () => setReloadKey((k) => k + 1), creating, refusal, create };
}
