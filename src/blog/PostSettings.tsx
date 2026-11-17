import { useGrowth } from '../GrowthProvider';
import { Button, Card, Field, INPUT, LoadError, Loading, Notice, Pill, Refusal } from '../ui/primitives';
import { FactsField, ReaderQuestionsField } from './PostListFields';
import type { BlogCtaKind, BlogPageWidth, BlogPostDetail } from './types';
import { usePostFields } from './usePostFields';

/** Neutral words for how a post ends; the product passes its own (S6: Portify's). */
const DEFAULT_CTA_WORDS: Record<BlogCtaKind, string> = {
  none: 'Nothing',
  subscribe: 'Subscribe to updates',
  service: 'A service',
  booking: 'Book a consultation',
};

const PAGE_WIDTHS: Array<{ value: BlogPageWidth; label: string; hint: string }> = [
  { value: 'page', label: 'Page width', hint: 'Fills the site’s page column, lined up with the header and footer.' },
  { value: 'wide', label: 'Wide', hint: 'A wide centred column, for posts with tables or large images.' },
  { value: 'normal', label: 'Normal', hint: 'A medium centred column.' },
  { value: 'reading', label: 'Reading column', hint: 'The narrow column long text is easiest to read in.' },
];

export interface PostSettingsProps {
  uuid: string;
  /** The product's words for each way a post can end. */
  ctaWords?: Partial<Record<BlogCtaKind, string>>;
  /** What a "service" ending's reference is, in the product's words. */
  serviceRefHint?: string;
}

/**
 * A post's own fields (blog on growth-service S5, step 2), autosaved. Parity with the product's editor before the move:
 * title, summary, category, audience, author, page width (written posts), facts with their review dates, search title
 * and description, reader questions, how the post ends, and the knowledge switch, beside the readiness checks. The web
 * address part is the service's and shown, not edited. A copy older than what is stored is never saved over it: the
 * author keeps theirs or loads the latest.
 */
export function PostSettings({ uuid, ctaWords, serviceRefHint }: PostSettingsProps) {
  const { canEdit, words } = useGrowth();
  const f = usePostFields(uuid);

  if (f.loadError) return <Card><LoadError message="The post could not be opened." onRetry={f.reload} /></Card>;
  if (!f.post || !f.draft) return <Card><Loading /></Card>;

  const { post, draft, set } = f;
  const cta = { ...DEFAULT_CTA_WORDS, ...ctaWords };
  const audiences = Object.entries(words.audiences);
  const width = PAGE_WIDTHS.find((w) => w.value === draft.page_width);
  const categories = f.categories.some((c) => c.id === draft.category_id) || draft.category_id === null || !post.category
    ? f.categories
    : [...f.categories, { id: post.category.id, name: `${post.category.name} (switched off)`, slug: '' }];

  return (
    <div className="gr-stack">
      <Card>
        <div className="gr-stack">
          <div className="gr-row-between">
            <h2 className="gr-section-title">Post details</h2>
            <span className="gr-hint" role="status">{f.saving ? 'Saving…' : f.dirty ? 'Unsaved changes' : 'Saved'}</span>
          </div>

          {f.conflict ? (
            <Notice>
              <span>
                Someone{f.conflict.updatedBy ? ` (${f.conflict.updatedBy})` : ''} saved this post after you opened it. Keep your version, or load theirs and lose
                your last changes.
              </span>
              <span className="gr-pills">
                <Button onClick={f.keepMine}>Keep mine</Button>
                <Button onClick={f.loadLatest}>Load the latest</Button>
              </span>
            </Notice>
          ) : null}
          <Refusal message={f.refused} />

          <fieldset className="gr-stack" disabled={!canEdit}>
            <Field label="Title">
              {(id) => <input id={id} className={INPUT} maxLength={200} value={draft.title} onChange={(e) => set({ title: e.target.value })} />}
            </Field>
            <Field label="Web address part" hint="Set by the blog from the title when the post is first saved.">
              {(id) => <input id={id} className={INPUT} readOnly value={post.slug ? `/${post.slug}` : 'Not set yet'} />}
            </Field>
            <Field label="Summary" hint="The short answer the post gives, shown first and used for search results.">
              {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={draft.answer} onChange={(e) => set({ answer: e.target.value })} />}
            </Field>
            <div className="gr-filters">
              <Field label="Category">
                {(id) => (
                  <select id={id} className={INPUT} value={draft.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value === '' ? null : Number(e.target.value) })}>
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Who it is for">
                {(id) => (
                  <select id={id} className={INPUT} value={draft.audience} onChange={(e) => set({ audience: e.target.value })}>
                    <option value="">Every reader</option>
                    {audiences.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <Field label="Author">
              {(id) => <input id={id} className={INPUT} maxLength={120} value={draft.author_name} onChange={(e) => set({ author_name: e.target.value })} />}
            </Field>
            {post.body_format === 'html' ? (
              // A designed post's blocks carry their own widths, so this is for written posts only.
              <Field label="Page width" hint={`${width?.hint ?? ''} On a phone every width fills the screen.`}>
                {(id) => (
                  <select id={id} className={INPUT} value={draft.page_width} onChange={(e) => set({ page_width: e.target.value as BlogPageWidth })}>
                    {PAGE_WIDTHS.map((w) => (
                      <option key={w.value} value={w.value}>{w.label}</option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}

            <FactsField facts={draft.facts} onChange={(facts) => set({ facts })} />

            <Field label="Search title (optional)" hint="Shown by search engines; the title is used when this is empty.">
              {(id) => <input id={id} className={INPUT} maxLength={200} value={draft.meta_title} onChange={(e) => set({ meta_title: e.target.value })} />}
            </Field>
            <Field label="Search description" hint={`${draft.meta_description.length}/200`}>
              {(id) => <textarea id={id} className={INPUT} rows={2} maxLength={200} value={draft.meta_description} onChange={(e) => set({ meta_description: e.target.value })} />}
            </Field>

            <ReaderQuestionsField questions={draft.reader_questions} onChange={(reader_questions) => set({ reader_questions })} />

            <Field label="Ends with">
              {(id) => (
                <select id={id} className={INPUT} value={draft.cta_kind} onChange={(e) => set({ cta_kind: e.target.value as BlogCtaKind })}>
                  {(Object.keys(DEFAULT_CTA_WORDS) as BlogCtaKind[]).map((k) => (
                    <option key={k} value={k}>{cta[k]}</option>
                  ))}
                </select>
              )}
            </Field>
            {draft.cta_kind === 'service' ? (
              <Field label="Which service" hint={serviceRefHint ?? 'The reference of the service the post points to.'}>
                {(id) => <input id={id} className={INPUT} maxLength={160} value={draft.cta_ref} onChange={(e) => set({ cta_ref: e.target.value })} />}
              </Field>
            ) : null}

            <label className="gr-check">
              <input type="checkbox" checked={draft.add_to_knowledge} onChange={(e) => set({ add_to_knowledge: e.target.checked })} />
              <span>Add this post&apos;s summary and reader questions to {words.assistant}&apos;s knowledge once published, so it can answer the same questions.</span>
            </label>
          </fieldset>
        </div>
      </Card>

      <PostReadiness post={post} />
    </div>
  );
}

/** What still stops the post from being published, as the service checks it after every save. */
export function PostReadiness({ post }: { post: BlogPostDetail }) {
  const r = post.readiness;
  const missing = r.checks.filter((c) => c.required && !c.ok);

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <h3 className="gr-section-title">Ready to publish?</h3>
          <Pill tone={r.ready ? 'good' : 'bad'}>{r.ready ? 'Ready' : missing.length === 1 ? '1 thing left' : `${missing.length} things left`}</Pill>
        </div>
        <ul className="gr-list" aria-label="Readiness checks">
          {r.checks.map((c) => (
            <li key={c.key} className="gr-list-row">
              <div className="gr-grow">
                <p className="gr-row-title">{c.ok ? '✓' : '✗'} {c.label}{c.required ? '' : ' (optional)'}</p>
                {!c.ok && c.hint ? <p className="gr-hint">{c.hint}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
