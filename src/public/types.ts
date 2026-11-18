import type { ComponentType, ReactNode } from 'react';

/**
 * The public blog's reader-facing shapes (blog on growth-service S8b-1). They are what a product's public blog API
 * answers (Portify's `/api/v1/public/blog/*`, which reads growth-service's S8a public API behind its gate), so the
 * same post draws the same page whichever source answered.
 */
export interface PublicBlogCategory {
  slug: string;
  name: string;
}

export interface PublicBlogCard {
  slug: string;
  title: string;
  /** The one-paragraph answer a reader gets first (the post's summary). */
  answer: string;
  category: PublicBlogCategory | null;
  audience?: string | null;
  author_name: string | null;
  published_at: string | null;
  updated_at: string | null;
}

export interface BlogListMeta {
  current_page: number;
  last_page: number;
  total?: number;
}

export interface PublicBlogSource {
  label: string;
  url: string;
}

export interface PublicReaderQuestion {
  q: string;
  a: string;
}

/** A call to action: `subscribe` draws the host's signup form, any other kind is a link with the host's words. */
export interface PublicBlogCta {
  kind: string;
  /** The host's words for it; a call to action with none is not drawn. */
  label: string | null;
  url?: string | null;
}

/**
 * What a designed post's design draws itself (growth-service's PostDesignAnswers), so the article never draws it a second
 * time around the design: a full guide draws its own title, breadcrumbs and byline, its FAQ, its disclaimer and its
 * calls to action. Absent (a written post, or an older payload): the article draws all of it, as before.
 */
export interface PublicDesignDraws {
  header?: boolean;
  questions?: boolean;
  disclaimer?: boolean;
  cta?: boolean;
  /** The design's own Sources block (the official pages, linked): the footer's list is not drawn too. */
  sources?: boolean;
}

export interface PublicBlogPost extends PublicBlogCard {
  body_format: 'html' | 'pml' | string;
  /** Sanitised when it was saved; drawn as it is, never re-cleaned into a different shape. */
  body_html: string | null;
  /** The questions the post answers: a designed post's own (its FAQ and question sections), else the questions field. */
  reader_questions: PublicReaderQuestion[];
  design_draws?: PublicDesignDraws | null;
  sources?: PublicBlogSource[];
  cta?: PublicBlogCta | null;
  meta_description?: string;
}

/** The host's link (Next's `Link` in a Next app). The default is a plain anchor. */
export type PublicLink = ComponentType<{
  href: string;
  className?: string;
  children?: ReactNode;
  rel?: string;
  'aria-current'?: 'page' | undefined;
}>;

/**
 * Every word the public blog shows, with neutral defaults. A product passes its own (Portify passes its disclaimer).
 * Functions where a number goes in the sentence.
 */
export interface PublicBlogWords {
  home: string;
  blog: string;
  allPosts: string;
  categoriesLabel: string;
  breadcrumbLabel: string;
  pagerLabel: string;
  newer: string;
  older: string;
  pageOf: (page: number, last: number) => string;
  /** On a card the reader already opened (the host's read markers set `data-read="true"`). */
  read: string;
  by: (name: string) => string;
  published: (date: string) => string;
  updated: (date: string) => string;
  sources: string;
  questions: string;
  disclaimer: string;
}

export const DEFAULT_PUBLIC_WORDS: PublicBlogWords = {
  home: 'Home',
  blog: 'Blog',
  allPosts: 'All posts',
  categoriesLabel: 'Blog categories',
  breadcrumbLabel: 'Breadcrumb',
  pagerLabel: 'More posts',
  newer: 'Newer posts',
  older: 'Older posts',
  pageOf: (page, last) => `Page ${page} of ${last}`,
  read: 'Read',
  by: (name) => `By ${name}`,
  published: (date) => `Published ${date}`,
  updated: (date) => `Updated ${date}`,
  sources: 'Sources',
  questions: 'Questions readers ask',
  disclaimer: 'General information, not professional advice. Your situation may differ.',
};

/** Where the blog lives on the host's site. Post and category addresses hang off `blog`. */
export interface PublicBlogPaths {
  home: string;
  blog: string;
}

export const DEFAULT_PUBLIC_PATHS: PublicBlogPaths = { home: '/', blog: '/blog' };

export function postPath(paths: PublicBlogPaths, slug: string): string {
  return `${paths.blog}/${slug}`;
}

export function categoryPath(paths: PublicBlogPaths, slug: string): string {
  return `${paths.blog}/category/${slug}`;
}
