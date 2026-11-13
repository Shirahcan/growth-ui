/** The service's Plan and Radar shapes (growth-service PlanController, G3a/G3d3/G3e2). */

export type SkipReason = 'already_covered' | 'not_our_audience' | 'wrong_timing' | 'other';

export interface PlanIdea {
  uuid: string;
  title: string;
  audience: string;
  formats: string[];
  why: string;
  status: 'idea' | 'accepted' | 'skipped' | 'drafted' | 'published';
  skip_reason: SkipReason | null;
  planned_for: string | null;
  post_uuid: string | null;
}

export interface PlanIdeas {
  month: string;
  plan_due: string;
  accepted: number;
  ideas: PlanIdea[];
  /** Plain sentences saying why a batch is thinner than usual (no AI key, the product unreachable). */
  notices?: string[];
}

export interface PlanCalendarItem {
  kind: 'idea' | 'post' | 'campaign' | 'signal';
  date: string | null;
  at: string | null;
  title: string;
  /** Relative to the Growth area ("blog/<uuid>", "plan?tab=radar") or already the host's own href. */
  href: string;
}

export interface RadarSignal {
  id: number;
  title: string;
  detail: string;
  audience: string;
  status: 'new' | 'drafted';
  source_name: string | null;
  source_url: string | null;
  observed_at: string | null;
  post_by: string | null;
  post_uuid: string | null;
  campaign_uuid: string | null;
}

export interface RadarStalePost {
  uuid: string;
  title: string;
  stale_reason: string;
}

/**
 * The service answers `{success, message, data}` (its BaseController), and the host's request returns
 * that body as it came through the proxy. The screens read `data`; a body without it is a fault.
 */
export interface Envelope<T> {
  success?: boolean;
  message?: string;
  data: T;
}

export function unwrap<T>(body: Envelope<T>): T {
  if (body === null || typeof body !== 'object' || !('data' in body)) {
    throw new Error('growth-service answered without its data.');
  }

  return body.data;
}
