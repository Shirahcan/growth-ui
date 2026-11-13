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
