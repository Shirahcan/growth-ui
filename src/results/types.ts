/** Growth results for a period (growth-service G6a1, read through the kit's `results` row). */
export type ResultsPeriod = '30d' | 'month' | 'quarter';

export interface ResultsData {
  period: ResultsPeriod;
  from: string;
  new_subscribers: { label: string; kind: string; total: number; ref?: string }[];
  reader_sources: { source: string; total: number }[];
  /** `booked` and `rate` are null when the product could not say who became a customer: unknown, never 0. */
  reader_to_booking: { slug: string; title: string; readers: number; subscribed: number; booked: number | null; rate: number | null }[];
  /** False when the product could not answer for conversions this time. */
  conversions_known?: boolean;
}
