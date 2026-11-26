/** A landing page as growth-service's admin API returns it (shared program G7b1). */
export interface LandingPage {
  uuid: string;
  slug: string;
  name: string;
  headline: string;
  intro: string | null;
  question_label: string | null;
  button_label: string;
  consent_label: string;
  audience: string;
  tags: string[];
  deliverable_kind: 'none' | 'file' | 'booking_link';
  deliverable_media_id: string | null;
  has_file: boolean;
  booking_url: string | null;
  creates_lead: boolean;
  status: 'draft' | 'live' | 'paused';
  search_exposure: 'search' | 'link_only';
  layout: 'form' | 'pml';
  has_design: boolean;
  /** Null while the product has not set where its landing pages live: the page has no address yet. */
  public_url: string | null;
  signups: number;
  confirmed: number;
  updated_at: string | null;
}

/** A keyword people comment and the landing page link the reply carries (G7b1). */
export interface KeywordLink {
  uuid: string;
  keyword: string;
  src: string;
  page_name: string | null;
  page_uuid: string | null;
  url: string | null;
  signups: number;
}
