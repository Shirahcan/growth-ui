/** The Audience tab's shapes, exactly as growth-service answers them (G4c-G4e4a). */

export type SubscriberStatus = 'pending' | 'subscribed' | 'unsubscribed';

/** One person in the list (`GET audience/subscribers`). The product's own admins see the full address. */
export interface Person {
  uuid: string;
  email: string;
  email_hash: string;
  audience: string | null;
  status: SubscriberStatus;
  topics: string[];
  frequency: string | null;
  paused_until: string | null;
  since: string | null;
  consent_basis: string | null;
  source_ref: string | null;
}

export interface PeoplePage {
  people: Person[];
  meta: { current_page: number; last_page: number; total: number };
}

/** One dated moment of consent evidence, newest first. */
export interface TrailEntry {
  at: string | null;
  what: string;
  basis: string | null;
  import_batch_ref: string | null;
}

/** The person sheet (`GET audience/subscribers/{uuid}`). */
export interface PersonSheet extends Person {
  consent: {
    basis: string | null;
    basis_words: string;
    current: boolean;
    expires_at: string | null;
    where: string | null;
    ip_recorded: boolean;
  };
  /** Why nobody may mail this address here ("unsubscribed", "bounced", ...), or null. */
  blocked: string | null;
  trail: TrailEntry[];
}

/** `GET audience/lapsing`: implied consent running out inside the product's warning window. */
export interface Lapsing {
  window_days: number;
  total: number;
  subscribed: number;
  pending: number;
  by_date: Array<{ date: string; subscribed: number; pending: number }>;
}

/** `GET/PUT settings/audience`. Every value but the warning window is null until the product sets it. */
export interface AudienceSettings {
  double_opt_in: boolean | null;
  topics: Array<{ key: string; label: string }> | null;
  regular_gap_days: number | null;
  import_purge_days: number | null;
  lapse_warning_days: number;
}
