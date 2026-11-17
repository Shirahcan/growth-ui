import type { PublicBlogCard } from './types';

/**
 * Dates on the public blog. UTC on purpose: the page is rendered on a server, so the reader's zone is not known,
 * and a date that moved by a day between the server and the browser would read as an error.
 */
export function blogDate(iso: string | null | undefined, locale = 'en-CA'): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

/**
 * The card's date: the later day readers saw a change ("Updated ..."), else the first publish. `updated` is a word
 * function so a product says it in its own language.
 */
export function blogDateLine(
  post: Pick<PublicBlogCard, 'published_at' | 'updated_at'>,
  updated: (date: string) => string = (d) => `Updated ${d}`,
  locale = 'en-CA',
): string {
  const published = blogDate(post.published_at, locale);
  const changed = blogDate(post.updated_at, locale);
  if (changed && changed !== published) return updated(changed);
  return published;
}

/** The page number from `?page=`, or 1 when it is absent or not a whole number above one. */
export function blogPageParam(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 1 ? value : 1;
}

/** Page 1 is the bare address, so it never has two addresses (one canonical URL per page). */
export function blogPageHref(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}
