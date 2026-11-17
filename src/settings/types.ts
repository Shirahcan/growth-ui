/** The service's watched-source and radar-settings shapes (growth-service G3a/G3b/G3e5). */

export interface WatchedSource {
  id: number;
  name: string;
  kind: string;
  url: string;
  public_url: string;
  audience: string;
  section_heading: string | null;
  check_every_minutes: number;
  is_active: boolean;
  is_built_in: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  needs_attention: boolean;
}

export interface RadarSettings {
  enabled: boolean;
  tracked_countries: string[];
  min_change_days: number;
  post_within_hours: number;
  plan_cadence_days: number;
}

/** A country the host offers for the processing-times scope (the product's own reference data). */
export interface RadarCountry {
  code: string;
  name: string;
}

/** The brand kit's colours (G2e), each #rrggbb or unset. */
export interface BrandKitColours {
  accent: string | null;
  on_accent: string | null;
  surface: string | null;
  text: string | null;
  /** The emphasis colour (the decision button); unset falls back to `text`. */
  strong: string | null;
  on_strong: string | null;
}

/** A product's brand kit on growth-service (G2e): unset is null and listed in `missing`, never defaulted. */
export interface BrandKit {
  name: string | null;
  logo_url: string | null;
  colours: BrandKitColours;
  fonts: { heading: string | null; body: string | null };
  legal: { privacy_url: string | null; terms_url: string | null };
  /** Shown, never edited here: the product sets it where it sends from. */
  sender: { from_name: string | null; from_address: string | null; reply_to: string | null; mailing_address: string | null };
  missing: string[];
}
