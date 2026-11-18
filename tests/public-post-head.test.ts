import { describe, expect, it } from 'vitest';
import { postHead, postJsonLd, type PostHeadSource } from '../src/public';

const site = { origin: 'https://portify.example/', name: 'Portify', orgId: 'https://portify.example/#org', logoUrl: 'https://portify.example/logo.png', language: 'en-CA' };

const post: PostHeadSource = {
  slug: 'express-entry-2026',
  title: 'Canada Express Entry 2026',
  answer: 'Who can apply, how the score works and what it costs.',
  meta_title: 'Express Entry 2026: Eligibility, CRS and Draws | Portify',
  meta_description: 'Express Entry 2026 explained: who is eligible and the latest draws.',
  author_name: 'Ada Okafor',
  published_at: '2026-11-16T15:00:00Z',
  updated_at: '2026-11-18T10:00:00Z',
  category: { slug: 'express-entry', name: 'Express Entry' },
  cover: { media: 'https://portify.example/c.jpg', alt: 'Toronto at dusk' },
  reader_questions: [{ q: 'Do I need a job offer?', a: 'No.' }, { q: 'Unanswered', a: '' }],
};

/** One builder for a post's head and structured data: the live page and the designer's search panel both call it. */
describe('a post’s head and structured data', () => {
  it('uses the search words, credits the post’s own address, and is listed and followed by default', () => {
    const head = postHead(post, site);

    expect(head.title).toBe('Express Entry 2026: Eligibility, CRS and Draws'); // the site's suffix comes off; the host adds it once
    expect(head.description).toBe('Express Entry 2026 explained: who is eligible and the latest draws.');
    expect(head.url).toBe('https://portify.example/blog/express-entry-2026');
    expect(head.canonical).toBe(head.url);
    expect(head.robots).toEqual({ index: true, follow: true });
    expect(head.social).toEqual({ title: head.title, description: head.description, image: 'https://portify.example/c.jpg', imageAlt: 'Toronto at dusk' });
  });

  it('honours the post’s own settings: out of search, a canonical elsewhere, its own share words', () => {
    const head = postHead({ ...post, robots: { index: false, follow: false }, canonical_url: 'https://elsewhere.example/original', social: { title: 'Share title', description: 'Share words' } }, site);

    expect(head.robots).toEqual({ index: false, follow: false });
    expect(head.canonical).toBe('https://elsewhere.example/original');
    expect(head.social.title).toBe('Share title');
    expect(head.social.description).toBe('Share words');
  });

  it('falls back to the title and summary, and has no picture without a cover', () => {
    const head = postHead({ ...post, meta_title: '', meta_description: null, cover: null }, site);

    expect(head.title).toBe('Canada Express Entry 2026');
    expect(head.description).toBe('Who can apply, how the score works and what it costs.');
    expect(head.social.image).toBeNull();
  });

  it('emits Article, BreadcrumbList and an FAQPage of only the answered questions', () => {
    const [article, crumbs, faq] = postJsonLd(post, site) as [Record<string, unknown>, Record<string, unknown>, Record<string, unknown>];

    expect(article['@type']).toBe('Article');
    expect(article.author).toEqual({ '@type': 'Person', name: 'Ada Okafor' });
    expect(article.datePublished).toBe('2026-11-16T15:00:00Z');
    expect(article.dateModified).toBe('2026-11-18T10:00:00Z');
    expect(article.mainEntityOfPage).toBe('https://portify.example/blog/express-entry-2026');
    expect(article.inLanguage).toBe('en-CA');
    expect((crumbs.itemListElement as Array<{ name: string; item: string }>).map((c) => c.name)).toEqual(['Home', 'Blog', 'Express Entry', 'Canada Express Entry 2026']);
    expect((crumbs.itemListElement as Array<{ item: string }>)[2]!.item).toBe('https://portify.example/blog/category/express-entry');
    expect(faq['@type']).toBe('FAQPage');
    expect((faq.mainEntity as unknown[]).length).toBe(1);
  });

  it('has no FAQPage when nothing is answered, and the host’s card stands in for a missing cover', () => {
    const ld = postJsonLd({ ...post, cover: null, reader_questions: [] }, site, 'https://portify.example/og/card.png');

    expect(ld).toHaveLength(2);
    expect(ld[0]!.image).toBe('https://portify.example/og/card.png');
  });
});
