import type { ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Field, INPUT, Notice, OptionCards } from '../ui/primitives';
import { slugify, slugTyping, type LandingDraft, type LandingFlow } from './useLandingFlow';

/**
 * A landing page's steps (shared program G7b5b; source: Portify's landing wizard), for the HOST's wizard shell, as
 * `announcementSteps()` is: one decision per step, each saying what it decides, the consequence and the way out, the
 * real verb on the last. The product's own pieces arrive as slots and words: its assistant box on the words step, its
 * format picker for a designed page, where its landing pages live, and the size limit in its own words.
 */
export interface LandingStep {
  id: 'kind' | 'format' | 'basics' | 'content' | 'deliverable' | 'consent' | 'exposure' | 'review';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface LandingStepsOptions {
  /** The product's page designer is available, so a new page may be designed instead of a fixed form. */
  designerAvailable?: boolean;
  /** The host's format picker for a new designed page (its console templates); the step is skipped without it. */
  formatPicker?: ReactNode;
  /** The host's "describe it to the assistant" box, drawn above the words. */
  assistantBox?: ReactNode;
  /** Where the product's landing pages live ("https://portify.co/go"); null while it is not set. */
  baseUrl: string | null;
  /** The upload limit in the product's words ("Up to 5 MB."). */
  limitWords?: string;
  /** The product's host for booking links (its own site); booking links elsewhere are refused. */
  bookingHost?: string | null;
  onPreview?: () => void;
  /** The page's status when editing ('live' says changes show at once); absent for a new page. */
  pageStatus?: string;
  /** The host's shell carries the verb in its own footer; the last step then draws no button. */
  hostSubmits?: boolean;
}

const SENDS: Record<LandingDraft['deliverable'], string> = { none: 'Nothing', file: 'A PDF', booking_link: 'A booking link' };
const EXPOSURE: Record<'search' | 'link_only', string> = { search: 'Search engines and AI assistants', link_only: 'Only people with the link' };
/** Below this, a page rarely ranks; said gently, never enforced. */
const SEARCH_WORDS_HINT = 150;
const wordCount = (...parts: string[]) => parts.join(' ').trim().split(/\s+/).filter(Boolean).length;

function Lead({ decides, consequence, wayOut }: { decides: string; consequence: string; wayOut?: string }) {
  return (
    <div className="gr-stack-tight">
      <p className="gr-row-title">{decides}</p>
      <p className="gr-hint">{consequence}</p>
      {wayOut ? <p className="gr-hint">{wayOut}</p> : null}
    </div>
  );
}

function bookingProblem(url: string, host: string | null | undefined): string | null {
  if (!url.trim()) return 'Paste the booking link.';
  try {
    const parsed = new URL(url);
    return !host || parsed.hostname === host ? null : 'Use a booking link on your own site: it goes into an email you send.';
  } catch {
    return 'That does not look like a full link. It should start with https://';
  }
}

export function landingVerb(flow: LandingFlow): string {
  if (flow.editing) return 'Save changes';
  if (flow.draft.layout === 'pml') return 'Save and design the page';

  return flow.draft.publish === 'now' ? 'Publish the page' : 'Save as a draft';
}

export function landingSteps(flow: LandingFlow, options: LandingStepsOptions): LandingStep[] {
  const d = flow.draft;
  const address = (slug: string) => `${options.baseUrl ?? ''}/${slug || 'your-address'}`;

  const steps: LandingStep[] = [
    {
      id: 'kind',
      title: 'How it should look',
      validate: () => null,
      render: () => (
        <div className="gr-stack">
          <Lead
            decides="How should this page look?"
            consequence="The fixed form is live in minutes. A designed page takes longer: you build it in the designer, add the sign-up form, and publish it when it is ready."
            wayOut="This cannot be changed later, so start with the fixed form if you are unsure."
          />
          <OptionCards<LandingDraft['layout']>
            label="How the page looks"
            value={d.layout}
            onChange={(layout) => flow.set({ layout })}
            options={[
              { value: 'form', label: 'Fixed sign-up form', hint: 'A headline, a short introduction and the form. The quickest way to replace a third-party form.' },
              { value: 'pml', label: 'Design it yourself', hint: 'Sections, images and your own layout. You set up the sign-up details here first.' },
            ]}
          />
        </div>
      ),
    },
    {
      id: 'format',
      title: 'What kind of page',
      validate: () => null,
      render: () => (
        <div className="gr-stack">
          <Lead decides="What kind of page is it?" consequence="The format sets its sections, how each looks, and its length." wayOut="You can switch it later in the designer." />
          {options.formatPicker}
        </div>
      ),
    },
    {
      id: 'basics',
      title: 'Name and address',
      validate: () => (!d.name.trim() ? 'Give the page a name you will recognise.' : !d.slug ? 'Choose the address visitors will open.' : !d.audience ? 'Choose who these people are.' : null),
      render: () => <Basics flow={flow} address={address} />,
    },
    {
      id: 'content',
      title: 'What visitors read',
      validate: () => (!d.headline.trim() ? 'Write the headline visitors see first.' : d.layout === 'form' && !d.button.trim() ? 'Write the words on the button.' : null),
      render: () => (
        <div className="gr-stack">
          <Lead
            decides={d.layout === 'pml' ? 'Write the headline used in search results and link previews. You design the rest.' : 'Write the headline, a short introduction, and any question you want answered.'}
            consequence="Say what they get in the words they would use. Visitors decide in a few seconds, mostly on a phone."
            wayOut="You can change the words at any time, even after the page is live."
          />
          {options.assistantBox}
          <Field label="Headline">
            {(id) => <input id={id} className={INPUT} maxLength={200} value={d.headline} placeholder="Your document checklist" onChange={(e) => flow.set({ headline: e.target.value })} />}
          </Field>
          {d.layout === 'form' ? (
            <div className="gr-grid-2">
              <Field label="Short introduction (optional)">
                {(id) => <textarea id={id} rows={3} maxLength={2000} className={INPUT} value={d.intro} onChange={(e) => flow.set({ intro: e.target.value })} />}
              </Field>
              <div className="gr-stack">
                <Field label="A question for them (optional)">
                  {(id) => <input id={id} className={INPUT} maxLength={200} value={d.question} placeholder="Where are you in the process?" onChange={(e) => flow.set({ question: e.target.value })} />}
                </Field>
                <Field label="Words on the button">
                  {(id) => <input id={id} className={INPUT} maxLength={60} value={d.button} onChange={(e) => flow.set({ button: e.target.value })} />}
                </Field>
              </div>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'deliverable',
      title: 'What they get',
      validate: () => {
        if (d.deliverable === 'booking_link') return bookingProblem(d.bookingUrl, options.bookingHost);
        if (d.deliverable === 'file' && flow.file && flow.file.type && flow.file.type !== 'application/pdf') return 'Only a PDF can be offered for download. Save the file as a PDF and choose it again.';
        if (d.deliverable === 'file' && !flow.file && !d.hasFile) return 'Choose the PDF to send. A file picked before you left needs choosing again.';
        return null;
      },
      render: () => <Deliverable flow={flow} limitWords={options.limitWords} />,
    },
    {
      id: 'consent',
      title: 'What they agree to',
      validate: () => (d.consent.trim() ? null : 'Write the line beside the updates box.'),
      render: () => (
        <div className="gr-stack">
          <Lead
            decides="What are they agreeing to? The updates box always starts unticked."
            consequence="Anti-spam law needs a real yes. The exact words, the date and the page are kept as proof, and they get a confirmation email before any updates."
            wayOut="Say who is writing and what about. Changing the words later only affects new sign-ups."
          />
          <Field label="Line beside the updates box">
            {(id) => <textarea id={id} rows={2} maxLength={300} className={INPUT} value={d.consent} onChange={(e) => flow.set({ consent: e.target.value })} />}
          </Field>
          <Field label="Tags for these people (optional)" hint="Separate tags with commas. Campaigns can target them later.">
            {(id) => <input id={id} className={INPUT} value={d.tags} placeholder="checklist, express entry" onChange={(e) => flow.set({ tags: e.target.value })} />}
          </Field>
        </div>
      ),
    },
    {
      id: 'exposure',
      title: 'Who can find it',
      validate: () => (d.exposure ? null : 'Choose who can find this page.'),
      render: () => {
        const words = wordCount(d.headline, d.intro);

        return (
          <div className="gr-stack">
            <Lead
              decides="Who can find this page?"
              consequence="Search pages go in the sitemap and the list AI assistants read. Link-only pages tell search engines not to list them, but anyone with the link can still open them."
              wayOut="You can change this at any time; search engines are told straight away."
            />
            <OptionCards<'search' | 'link_only'>
              label="Who can find it"
              value={d.exposure || null}
              onChange={(exposure) => flow.set({ exposure })}
              options={[
                { value: 'search', label: EXPOSURE.search, hint: 'Google, Bing and AI assistants can show it. Best for a page with real content.' },
                { value: 'link_only', label: EXPOSURE.link_only, hint: 'For a bio link, an auto-reply, ads and email. Search engines are told not to list it.' },
              ]}
            />
            {d.exposure === 'search' && d.layout === 'form' && words < SEARCH_WORDS_HINT ? (
              <p className="gr-warning">This page has {words} {words === 1 ? 'word' : 'words'}. Pages this short rarely rank: say what people get and why to trust it, or design the page yourself.</p>
            ) : null}
          </div>
        );
      },
    },
    { id: 'review', title: flow.editing ? 'Check and save' : 'Check and finish', validate: () => null, render: () => <Review flow={flow} options={options} address={address} /> },
  ];

  return steps.filter((s) => {
    if (s.id === 'kind') return Boolean(options.designerAvailable) && !flow.editing;
    if (s.id === 'format') return !flow.editing && d.layout === 'pml' && Boolean(options.formatPicker);
    return true;
  });
}

function Basics({ flow, address }: { flow: LandingFlow; address: (slug: string) => string }) {
  const { words } = useGrowth();
  const d = flow.draft;
  const audiences = Object.entries(words.audiences).map(([value, label]) => ({ value, label }));

  return (
    <div className="gr-stack">
      <Lead
        decides="What is this page, and who is it for?"
        consequence="Everyone who signs up joins that audience, so they only get the updates meant for them."
        wayOut="You can change all of this until the page is live. After that, the address stays: links and search results point at it."
      />
      <div className="gr-grid-2">
        <Field label="Name (only your team sees this)">
          {(id) => <input id={id} className={INPUT} value={d.name} placeholder="PR checklist" onChange={(e) => flow.set(d.slugTouched ? { name: e.target.value } : { name: e.target.value, slug: slugify(e.target.value) })} />}
        </Field>
        <Field label="Address" hint={`Visitors open ${address(d.slug)}`}>
          {(id) => <input id={id} className={INPUT} value={d.slug} placeholder="pr-checklist" onChange={(e) => flow.set({ slug: slugTyping(e.target.value), slugTouched: true })} onBlur={() => flow.set({ slug: slugify(d.slug) })} />}
        </Field>
      </div>
      <OptionCards label="Who these people are" value={d.audience || null} onChange={(audience) => flow.set({ audience })} options={audiences} />
    </div>
  );
}

function Deliverable({ flow, limitWords }: { flow: LandingFlow; limitWords?: string }) {
  const { words } = useGrowth();
  const d = flow.draft;

  return (
    <div className="gr-stack">
      <Lead
        decides="What do they get for signing up?"
        consequence={`${words.product} emails it to them whether or not they tick the updates box: straight away if they do not, or once they confirm their email if they do. Asking for a file never depends on agreeing to marketing.`}
        wayOut="You can change this later. People who already signed up keep what they were sent."
      />
      <OptionCards<LandingDraft['deliverable']>
        label="What they get"
        value={d.deliverable}
        onChange={(deliverable) => flow.set({ deliverable })}
        options={[
          { value: 'none', label: 'Nothing to send', hint: 'They only join your list, or become a lead.' },
          { value: 'file', label: 'A PDF', hint: `A checklist or guide, sent as a download link in an email. ${limitWords ?? ''}`.trim() },
          { value: 'booking_link', label: 'A booking link', hint: 'A link to book a call on your own site.' },
        ]}
      />
      {d.deliverable === 'file' ? (
        <Field label={d.hasFile ? 'Replace the PDF (optional)' : 'The PDF'} hint={flow.file ? `Chosen: ${flow.file.name}` : undefined}>
          {(id) => <input id={id} type="file" accept="application/pdf,.pdf" className={INPUT} onChange={(e) => flow.setFile(e.target.files?.[0] ?? null)} />}
        </Field>
      ) : null}
      {d.deliverable === 'booking_link' ? (
        <Field label="Booking link on your own site">
          {(id) => <input id={id} className={INPUT} value={d.bookingUrl} placeholder="https://..." onChange={(e) => flow.set({ bookingUrl: e.target.value })} />}
        </Field>
      ) : null}
      <label className="gr-check">
        <input type="checkbox" checked={d.createsLead} onChange={(e) => flow.set({ createsLead: e.target.checked })} />
        <span>Also record each request as a lead, so someone follows up.</span>
      </label>
    </div>
  );
}

function Review({ flow, options, address }: { flow: LandingFlow; options: LandingStepsOptions; address: (slug: string) => string }) {
  const { words } = useGrowth();
  const d = flow.draft;

  return (
    <div className="gr-stack">
      <p className="gr-row-title">{flow.editing ? 'Check your changes' : 'Check your page'}</p>
      <p className="gr-hint">
        {d.layout === 'pml'
          ? 'This saves the sign-up details and opens the designer. Add the sign-up form there, then publish it from Landing pages.'
          : flow.editing
            ? options.pageStatus === 'live'
              ? 'Changes to a live page show as soon as you save.'
              : 'It stays as it is now (not live) until you publish it from Landing pages.'
            : `Anyone with the link can open ${address(d.slug)} once it is published.`}
      </p>
      {options.baseUrl === null ? <p className="gr-warning">Your landing pages have no address yet. Set where they live in Growth settings before publishing.</p> : null}
      {options.onPreview && d.layout === 'form' ? (
        <div>
          <Button onClick={options.onPreview}>Preview the page</Button>
        </div>
      ) : null}
      {!flow.editing && d.layout === 'form' ? (
        <OptionCards<LandingDraft['publish']>
          label="When it goes live"
          value={d.publish}
          onChange={(publish) => flow.set({ publish })}
          options={[
            { value: 'now', label: 'Publish now', hint: 'The link works straight away.' },
            { value: 'draft', label: 'Keep as a draft', hint: 'Publish it from Landing pages when you are ready.' },
          ]}
        />
      ) : null}
      <ul className="gr-list">
        <li className="gr-hint">Address: {address(d.slug)}</li>
        <li className="gr-hint">Adds people to: {words.audiences[d.audience] ?? d.audience}</li>
        <li className="gr-hint">Headline: {d.headline}</li>
        <li className="gr-hint">They get: {SENDS[d.deliverable]}{d.createsLead ? ', and a lead is recorded' : ''}</li>
        <li className="gr-hint">Consent line: {d.consent}</li>
        <li className="gr-hint">Who can find it: {d.exposure ? EXPOSURE[d.exposure] : 'Not chosen'}</li>
      </ul>
      {flow.refusal ? <Notice>{flow.refusal}</Notice> : null}
      {flow.done ? (
        <p className="gr-row-title" role="status">
          {flow.done.status === 'live' ? `Published. Anyone with the link can open ${address(flow.done.slug)}.` : flow.editing ? 'Saved.' : 'Saved as a draft. Publish it from Landing pages when you are ready.'}
        </p>
      ) : null}
      {options.hostSubmits || flow.done ? null : (
        <div>
          <Button tone="primary" disabled={flow.submitting} onClick={() => void flow.submit()}>{flow.submitting ? 'Working…' : landingVerb(flow)}</Button>
        </div>
      )}
    </div>
  );
}
