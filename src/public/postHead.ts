import { DEFAULT_PUBLIC_PATHS, DEFAULT_PUBLIC_WORDS, categoryPath, postPath, type PublicBlogPaths } from './types';

/**
 * A post's head and structured data, from ONE builder (2026-11-18, owner: "all SEO and meta surfaces, options, and
 * config"). The product's live page calls these with the public payload; the designer's search panel calls the SAME
 * functions with the service's draft preview (`document/seo` -> `preview`, the same shape), so the panel's Schema and
 * Social tabs show exactly what the page will emit. Pure functions: no provider, no React, safe in a server component.
 */

/** What a product's site knows about itself. */
export interface PostHeadSite {
  /** The site's own address, no trailing slash (e.g. https://portify.shirah.co). */
  origin: string;
  /** The site's name, as a search title ends ("... | Portify") and as the publisher. */
  name: string;
  /** The organisation's schema.org @id and its logo's absolute address, when the site has them. */
  orgId?: string;
  logoUrl?: string;
  /** The content's language (BCP 47, e.g. en-CA). */
  language?: string;
  paths?: PublicBlogPaths;
  /** The breadcrumb's first two words. */
  words?: { home: string; blog: string };
}

/** What a head reads from a post: a public payload and the draft preview both fit. */
export interface PostHeadSource {
  slug: string;
  title: string;
  answer: string;
  meta_title?: string | null;
  meta_description?: string | null;
  author_name: string | null;
  published_at: string | null;
  updated_at: string | null;
  category: { slug: string; name: string } | null;
  cover?: { media?: string | null; url?: string | null; alt?: string | null } | null;
  reader_questions: { q: string; a: string }[];
  /** Absent on a payload from before 2026-11-18: listed and followed. */
  robots?: { index: boolean; follow: boolean } | null;
  canonical_url?: string | null;
  social?: { title: string | null; description: string | null } | null;
  /** The drawn social card (G7e4), when growth-service has drawn one; absent or null before that. */
  share_card?: { url: string; width: number; height: number; alt: string } | null;
}

export interface PostHead {
  /** The search title WITHOUT the site's name, so the host adds its own suffix exactly once. */
  title: string;
  description: string;
  /** The post's own address. */
  url: string;
  /** Where search engines should credit it: the post's canonical address, else its own. */
  canonical: string;
  robots: { index: boolean; follow: boolean };
  /**
   * The share card: its own words, else the search words; its picture is the drawn card (G7e4), else the cover, else
   * none (the host's own card).
   */
  social: { title: string; description: string; image: string | null; imageAlt: string | null };
}

function joinUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** The post's title as search shows it, with a trailing " | {site}" taken off (some search titles carry it already). */
function searchTitle(post: PostHeadSource, site: PostHeadSite): string {
  const raw = (post.meta_title ?? '').trim() || post.title.trim();
  const suffix = new RegExp(`\\s*\\|\\s*${site.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');

  return raw.replace(suffix, '').trim() || raw;
}

export function postHead(post: PostHeadSource, site: PostHeadSite): PostHead {
  const paths = site.paths ?? DEFAULT_PUBLIC_PATHS;
  const url = joinUrl(site.origin, postPath(paths, post.slug));
  const title = searchTitle(post, site);
  const description = (post.meta_description ?? '').trim() || post.answer.trim();
  const cover = (post.cover?.media ?? post.cover?.url ?? '').trim();
  const drawn = (post.share_card?.url ?? '').trim();
  const picture = drawn !== '' ? drawn : cover;
  const pictureAlt = drawn !== '' ? (post.share_card?.alt ?? '').trim() : (post.cover?.alt ?? '').trim();

  return {
    title,
    description,
    url,
    canonical: (post.canonical_url ?? '').trim() || url,
    robots: { index: post.robots?.index !== false, follow: post.robots?.follow !== false },
    social: {
      title: (post.social?.title ?? '').trim() || title,
      description: (post.social?.description ?? '').trim() || description,
      image: picture !== '' ? picture : null,
      imageAlt: picture !== '' ? pictureAlt || null : null,
    },
  };
}

/**
 * The page's structured data: Article (author, dates, publisher), BreadcrumbList (home, blog, category, post) and, when
 * the post answers questions, FAQPage built from those same answers, so the FAQ markup never says what the page does not.
 * `image` is the share picture; a host with its own generated card passes it as `fallbackImage`.
 */
export function postJsonLd(post: PostHeadSource, site: PostHeadSite, fallbackImage?: string | null): Record<string, unknown>[] {
  const head = postHead(post, site);
  const paths = site.paths ?? DEFAULT_PUBLIC_PATHS;
  const words = site.words ?? { home: DEFAULT_PUBLIC_WORDS.home, blog: DEFAULT_PUBLIC_WORDS.blog };
  const publisher: Record<string, unknown> = {
    '@type': 'Organization',
    ...(site.orgId ? { '@id': site.orgId } : {}),
    name: site.name,
    url: joinUrl(site.origin, paths.home),
    ...(site.logoUrl ? { logo: { '@type': 'ImageObject', url: site.logoUrl } } : {}),
  };
  const image = head.social.image ?? fallbackImage ?? null;
  const crumbs: Array<{ name: string; item: string }> = [
    { name: words.home, item: joinUrl(site.origin, paths.home) },
    { name: words.blog, item: joinUrl(site.origin, paths.blog) },
    ...(post.category ? [{ name: post.category.name, item: joinUrl(site.origin, categoryPath(paths, post.category.slug)) }] : []),
    { name: post.title, item: head.url },
  ];
  const answered = post.reader_questions.filter((q) => q.q.trim() !== '' && q.a.trim() !== '');

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: head.description,
      ...(image ? { image } : {}),
      ...(post.published_at ? { datePublished: post.published_at } : {}),
      ...((post.updated_at ?? post.published_at) ? { dateModified: post.updated_at ?? post.published_at } : {}),
      author: post.author_name ? { '@type': 'Person', name: post.author_name } : publisher,
      publisher,
      ...(site.language ? { inLanguage: site.language } : {}),
      mainEntityOfPage: head.canonical,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
    },
    ...(answered.length > 0
      ? [{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: answered.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })),
        }]
      : []),
  ];
}
