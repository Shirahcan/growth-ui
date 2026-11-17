/**
 * The CTA library and the story bank as growth-service answers them (post-and-newsletter-layouts B1, B1b, B5).
 */

export type CtaStage = 'awareness' | 'consideration' | 'decision';
export type CtaVariant = 'inline' | 'rail' | 'ask' | 'banner';
export type CtaActionKind = 'subscribe' | 'link' | 'landing_form' | 'match';

export interface CtaItem {
  id: number;
  stage: CtaStage;
  variant: CtaVariant;
  category: string | null;
  eyebrow: string | null;
  headline: string;
  body: string | null;
  button_label: string;
  action_kind: CtaActionKind;
  action_ref: string | null;
  secondary: { label: string; action_kind: CtaActionKind; action_ref: string | null } | null;
  active: boolean;
  updated_at: string | null;
}

export type StoryStatus = 'draft' | 'ready' | 'archived';
export type ConsentMethod = 'written_form' | 'email' | 'recorded_call';

export interface Story {
  id: number;
  case_type: string;
  challenge: string;
  strategy: string;
  outcome: string;
  how_found: string | null;
  consent: { method: ConsentMethod | null; at: string | null; recorded_by: string | null; evidence_media_id: string | null };
  verified_at: string | null;
  verified_by: string | null;
  status: StoryStatus;
  pickable: boolean;
  updated_at: string | null;
}

export const CTA_STAGES: Array<{ value: CtaStage; label: string; hint: string }> = [
  { value: 'awareness', label: 'Awareness', hint: 'The reader is learning. Offer updates, not a sale.' },
  { value: 'consideration', label: 'Consideration', hint: 'The reader is comparing options. Offer a guide or a next read.' },
  { value: 'decision', label: 'Decision', hint: 'The reader is ready. Offer the next real step.' },
];

export const CTA_VARIANTS: Array<{ value: CtaVariant; label: string }> = [
  { value: 'inline', label: 'Inside the text' },
  { value: 'rail', label: 'Side card' },
  { value: 'ask', label: 'Small "ask us"' },
  { value: 'banner', label: 'Full-width banner' },
];

export const CTA_ACTIONS: Array<{ value: CtaActionKind; label: string; refHint: string | null }> = [
  { value: 'subscribe', label: 'Newsletter sign-up', refHint: null },
  { value: 'link', label: 'Open a page', refHint: 'A page inside the product ("/marketplace") or a full https address.' },
  { value: 'landing_form', label: 'A landing page form', refHint: "The landing page's short name (lower-case letters, numbers and hyphens)." },
  { value: 'match', label: 'Start matching', refHint: 'The page that starts matching ("/marketplace/intake").' },
];

export const CONSENT_METHODS: Array<{ value: ConsentMethod; label: string }> = [
  { value: 'written_form', label: 'A signed consent form' },
  { value: 'email', label: 'An email from the client saying yes' },
  { value: 'recorded_call', label: 'A recorded call where they agreed' },
];

/** A blog category as growth-service answers it (blog on growth-service S1, v0.37.0). `posts` arrives with S2a. */
export interface BlogCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  /** One of the product's audience keys (the host's `words.audiences`), or null for every reader. */
  audience: string | null;
  sort: number;
  is_active: boolean;
  /** How many posts use it (S2a); absent until the service counts them. */
  posts?: number;
  updated_at: string | null;
}
