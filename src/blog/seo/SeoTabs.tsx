import { useState } from 'react';
import { postHead, postJsonLd, type PostHeadSite, type PostHeadSource } from '../../public/postHead';
import { MeteredField, SettingSwitch, SharePreviewCard } from './SeoPieces';
import { ShareCardPanel } from '../../cards/ShareCardPanel';

/** The panel's view of a post's saved settings, and its one way to save one (the guarded fields save). */
export interface SeoFieldsAccess {
  values: Record<string, unknown>;
  /** Saves one field; answers the reason it was refused (a field's own error), or null when saved. */
  save: (name: string, value: string | boolean) => Promise<string | null>;
  canEdit: boolean;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Advanced: whether search engines list the post and follow its links, and the address it is credited to. */
export function SeoAdvancedTab({ access }: { access: SeoFieldsAccess }) {
  const { values, save, canEdit } = access;
  const listed = values.robots_index !== false;
  const [canonical, setCanonical] = useState(text(values.canonical_url));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="gr-stack">
      <section className="gr-stack" aria-labelledby="gr-seo-robots" style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: 12 }}>
        <h3 id="gr-seo-robots" className="gr-section-title">Search engines</h3>
        <SettingSwitch
          label="Show this post in search results"
          detail="Off keeps it out of Google and other search engines, and out of the blog's sitemap. Readers with the link still see it."
          checked={listed}
          disabled={!canEdit}
          onChange={(on) => void save('robots_index', on)}
        />
        {!listed ? <p role="status" className="gr-notice">This post will not appear in search results once it is published.</p> : null}
        <SettingSwitch
          label="Let search engines follow its links"
          detail="Off asks them not to follow the links in this post to other pages."
          checked={values.robots_follow !== false}
          disabled={!canEdit}
          onChange={(on) => void save('robots_follow', on)}
        />
      </section>

      <MeteredField
        name="canonical_url"
        label="Canonical address"
        value={canonical}
        onChange={(v) => {
          setCanonical(v);
          setError(null);
        }}
        onCommit={(v) => {
          if (v === text(values.canonical_url)) return;
          void save('canonical_url', v).then(setError);
        }}
        disabled={!canEdit}
        placeholder="Leave empty: the post is credited to its own address"
        error={error}
        hint="Only when this post repeats a page that lives at another address: search engines then credit that page, and this post will not rank on its own. A full https address."
      />

      <section className="gr-stack" aria-labelledby="gr-seo-address" style={{ background: '#F7F7FB', borderRadius: 8, padding: 12 }}>
        <h3 id="gr-seo-address" className="gr-section-title">The post&apos;s address</h3>
        <p className="gr-hint" style={{ margin: 0 }}>
          The address follows the title until the post is first published. From then on it never changes, so links already
          shared keep working and no redirect is ever needed.
        </p>
      </section>
    </div>
  );
}

/** Schema: the structured data the page emits, from the SAME builder the live page uses. */
export function SeoSchemaTab({ preview, site, fallbackImage }: { preview: PostHeadSource; site: PostHeadSite; fallbackImage?: string | null }) {
  const graph = postJsonLd(preview, site, fallbackImage);
  const faq = graph.find((g) => g['@type'] === 'FAQPage') as { mainEntity?: unknown[] } | undefined;

  return (
    <div className="gr-stack">
      <section className="gr-stack" aria-labelledby="gr-seo-schema" style={{ border: '1px solid #E4E4EF', borderRadius: 8, padding: 12 }}>
        <h3 id="gr-seo-schema" className="gr-section-title">Structured data on the page</h3>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13 }}>
          <li>Article, with {preview.author_name ? `its author (${preview.author_name})` : 'the site as its author (no author named yet)'} and its dates</li>
          <li>Breadcrumb: home, blog{preview.category ? `, ${preview.category.name}` : ''}, the post</li>
          <li>{faq ? `FAQ, built from the ${faq.mainEntity?.length ?? 0} questions the post answers` : 'No FAQ: the post answers no questions yet (add an FAQ or question sections to the design)'}</li>
        </ul>
        <p className="gr-hint" style={{ margin: 0 }}>Built from the post itself, so the markup always says what the page says.</p>
      </section>
      <pre
        aria-label="The structured data, as the page emits it"
        style={{ margin: 0, maxHeight: 280, overflow: 'auto', background: '#050351', color: '#E4E4FF', fontSize: 11, lineHeight: 1.55, padding: 12, borderRadius: 8 }}
      >
        {JSON.stringify(graph, null, 2)}
      </pre>
    </div>
  );
}

/** Social: the card a shared link shows, and the two words that can differ from the search ones. */
export function SeoSocialTab({ access, preview, site, fallbackImage, postUuid }: { access: SeoFieldsAccess; preview: PostHeadSource; site: PostHeadSite; fallbackImage?: string | null; postUuid?: string }) {
  const { values, save, canEdit } = access;
  const [title, setTitle] = useState(text(values.social_title));
  const [description, setDescription] = useState(text(values.social_description));
  const head = postHead({ ...preview, social: { title: title.trim() || null, description: description.trim() || null } }, site);
  let domain = site.origin;
  try {
    domain = new URL(site.origin).host;
  } catch {
    /* an origin the URL parser refuses: show it as given */
  }

  return (
    <div className="gr-stack">
      <SharePreviewCard domain={domain} title={head.social.title} description={head.social.description} image={head.social.image ?? fallbackImage ?? null} imageAlt={head.social.imageAlt} />
      <p className="gr-hint" style={{ margin: 0 }}>
        Facebook, LinkedIn and X use the search title, the search description and the cover picture, unless you change the words here.
      </p>
      {postUuid ? <ShareCardPanel kind="post" uuid={postUuid} /> : null}
      <MeteredField
        name="social_title"
        label="Title when shared"
        value={title}
        onChange={setTitle}
        onCommit={(v) => v !== text(values.social_title) && void save('social_title', v)}
        disabled={!canEdit}
        placeholder={head.title}
      />
      <MeteredField
        name="social_description"
        label="Description when shared"
        value={description}
        onChange={setDescription}
        onCommit={(v) => v !== text(values.social_description) && void save('social_description', v)}
        disabled={!canEdit}
        rows={3}
        placeholder={postHead(preview, site).description}
      />
    </div>
  );
}
