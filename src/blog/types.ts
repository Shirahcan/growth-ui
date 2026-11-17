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

export type BlogPostStatus = 'draft' | 'scheduled' | 'published' | 'unpublished';

/** A post in the blog list as growth-service answers it (blog on growth-service S2b, v0.39.0; public_url from v0.40.0). */
export interface BlogPostSummary {
  uuid: string;
  id: number;
  title: string | null;
  slug: string | null;
  status: BlogPostStatus;
  body_format: 'pml' | 'html';
  category: { id: number; name: string } | null;
  audience: string | null;
  /** Why the post's facts need a look (a figure it quotes changed), or null. */
  stale_reason: string | null;
  live: boolean;
  has_unpublished_changes: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  updated_at: string | null;
  /** The post's address on the product's blog; null while the product has not set its blog address. Never assembled here. */
  public_url?: string | null;
}

/** A post's reach as the PRODUCT measures it (Portify's growth results), passed in by the host per post uuid. */
export interface BlogPostReach {
  readers: number;
  subscribers: number;
}

export type BlogPageWidth = 'page' | 'wide' | 'normal' | 'reading';
export type BlogCtaKind = 'none' | 'service' | 'booking' | 'subscribe';

/** A figure a post quotes, with the date it should be checked again (what marks a post "Facts need a look"). */
export interface PostFact {
  text: string;
  review_by: string | null;
  source_key: string | null;
}

export interface ReaderQuestion {
  q: string;
  a: string;
}

/** One readiness check (S2b/S2c): the post may be published when every required one is ok. */
export interface PostReadinessCheck {
  key: string;
  label: string;
  hint: string | null;
  ok: boolean;
  required: boolean;
  weight: number;
}

/** A post with its own fields, as growth-service answers it (S2b v0.40.0). */
export interface BlogPostDetail extends BlogPostSummary {
  dek: string | null;
  answer: string | null;
  body_html: string | null;
  page_width: BlogPageWidth | null;
  layout_key: string | null;
  layout_version: number | null;
  category_id: number | null;
  tags: string[];
  author_name: string | null;
  cover: { media: string; alt: string | null; caption: string | null } | null;
  story_id: number | null;
  facts: PostFact[];
  meta_title: string | null;
  meta_description: string | null;
  reader_questions: ReaderQuestion[];
  cta_kind: BlogCtaKind | null;
  cta_ref: string | null;
  add_to_knowledge: boolean;
  linkedin_text: string | null;
  readiness: { score: number; ready: boolean; checks: PostReadinessCheck[] };
  /** +1 on every fields save; a save names the one it was made from, so an older copy never overwrites a newer one. */
  fields_version: number;
}

/** The fields the settings form edits (parity with the product's editor before the move). */
export interface PostFieldsDraft {
  title: string;
  answer: string;
  category_id: number | null;
  audience: string;
  author_name: string;
  page_width: BlogPageWidth;
  facts: PostFact[];
  meta_title: string;
  meta_description: string;
  reader_questions: ReaderQuestion[];
  cta_kind: BlogCtaKind;
  cta_ref: string;
  add_to_knowledge: boolean;
}
