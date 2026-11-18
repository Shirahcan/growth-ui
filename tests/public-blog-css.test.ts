import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * A designed post's design is drawn INSIDE the public article (owner 2026-11-18: render the post exactly as designed).
 * A reset written at .gr-blog's weight ("`.gr-blog p { margin: 0 }`") beat the design's own spacing classes, so a call
 * to action's paragraph sat off-centre and a design's lists lost their bullets. Every reset on a bare element must
 * carry no specificity (:where), so a class on the element always wins.
 */
const css = readFileSync(resolve(__dirname, '../src/public/blog.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the public blog stylesheet', () => {
  it('never styles a bare element under .gr-blog at a weight that beats a design class', () => {
    const selectors = css.split('}').map((rule) => rule.split('{')[0]?.trim() ?? '').filter(Boolean);
    const bare = selectors.flatMap((s) => s.split(',').map((one) => one.trim())).filter((one) => /^\.gr-blog\s+[a-z]/.test(one));

    expect(bare).toEqual([]);
    expect(css).toContain(':where(.gr-blog) :where(h1, h2, p, ul, dl, dd) { margin: 0; }');
  });
});
