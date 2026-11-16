import { useState, type ReactNode } from 'react';
import { ChoiceGroup, Field, INPUT, Notice, Refusal } from '../ui/primitives';
import { CONSENT_METHODS } from './types';
import { localToday, type StoryFlow } from './useStoryFlow';

/**
 * Adding a client story (post-and-newsletter-layouts B6), as steps for the HOST's wizard shell (as `importSteps` is):
 * one decision per step, each teaching what it decides. A story is anonymised and needs the client's consent; it is
 * written by a person, never by the assistant, and checked by a person before posts can show it.
 */
export interface StoryStep {
  id: 'case' | 'story' | 'consent' | 'review';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface StoryStepsOptions {
  /**
   * The host keeps the consent proof (a signed form, an email) on its OWN private storage and returns a reference;
   * the shared service stores only that reference. Without it, the consent step records how and when only.
   */
  uploadEvidence?: (file: File) => Promise<string>;
  /** The largest proof file the host accepts, in MB (Portify: 5). */
  maxEvidenceMb?: number;
}

const IDENTIFYING = /([^\s@]+@[^\s@]+\.[^\s@]+)|((?:\+?\d[\s().-]*){9,})/;

function Lead({ decides, children }: { decides: string; children?: ReactNode }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">{decides}</p>
      {children}
    </div>
  );
}

function Evidence({ flow, options }: { flow: StoryFlow; options: StoryStepsOptions }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const max = options.maxEvidenceMb ?? 5;

  if (!options.uploadEvidence) return null;

  async function pick(file: File | undefined) {
    if (!file || !options.uploadEvidence) return;
    setProblem(null);
    if (file.size > max * 1024 * 1024) {
      setProblem(`The file is larger than ${max} MB. Save a smaller copy (a PDF or a photo of the signed page) and try again.`);
      return;
    }
    setBusy(true);
    try {
      flow.patch({ evidence_ref: await options.uploadEvidence(file) });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The proof could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label="The proof (optional)" hint={`The signed form or the client's email, up to ${max} MB. It is kept privately and never shown with the story.`} error={problem}>
      {(id) => (
        <div className="gr-stack">
          <input id={id} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.eml,.msg" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          {busy ? <p className="gr-hint">Uploading…</p> : flow.draft.evidence_ref ? <p className="gr-hint">Proof kept.</p> : null}
        </div>
      )}
    </Field>
  );
}

export function storySteps(flow: StoryFlow, options: StoryStepsOptions = {}): StoryStep[] {
  const d = flow.draft;
  const identifying = (v: string) => (IDENTIFYING.test(v) ? 'Take out the email address or phone number: a story never identifies the client.' : null);

  return [
    {
      id: 'case',
      title: 'The case',
      validate: () =>
        d.case_type.trim() === '' ? 'Say what kind of case it was.' : d.challenge.trim() === '' ? 'Say what made it hard.' : identifying(d.challenge),
      render: () => (
        <Lead decides="What kind of case was it, and what made it hard?">
          <Notice>No names, no employer or school names, no dates of birth, nothing a reader could use to find the client. Describe the situation, not the person.</Notice>
          <Field label="Kind of case" hint='For example "Express Entry, Canadian Experience Class".'>
            {(id) => <input id={id} className={INPUT} maxLength={120} value={d.case_type} onChange={(e) => flow.patch({ case_type: e.target.value })} />}
          </Field>
          <Field label="The challenge" hint='For example "A refused first application for missing proof of funds."'>
            {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={d.challenge} onChange={(e) => flow.patch({ challenge: e.target.value })} />}
          </Field>
        </Lead>
      ),
    },
    {
      id: 'story',
      title: 'What happened',
      validate: () =>
        d.strategy.trim() === '' ? 'Say what was done.' : d.outcome.trim() === '' ? 'Say how it turned out.' : identifying(d.strategy) ?? identifying(d.outcome) ?? identifying(d.how_found),
      render: () => (
        <Lead decides="What was done, and how did it turn out?">
          <p className="gr-hint">Only what really happened. Posts show these words as written; the assistant may tidy the wording when you ask, never add facts.</p>
          <Field label="What was done">
            {(id) => <textarea id={id} className={INPUT} rows={3} maxLength={2000} value={d.strategy} onChange={(e) => flow.patch({ strategy: e.target.value })} />}
          </Field>
          <Field label="The outcome">
            {(id) => <textarea id={id} className={INPUT} rows={2} maxLength={2000} value={d.outcome} onChange={(e) => flow.patch({ outcome: e.target.value })} />}
          </Field>
          <Field label="How they found their consultant (optional)">
            {(id) => <input id={id} className={INPUT} maxLength={1000} value={d.how_found} onChange={(e) => flow.patch({ how_found: e.target.value })} />}
          </Field>
        </Lead>
      ),
    },
    {
      id: 'consent',
      title: 'Consent',
      validate: () => (d.consent_method !== null && d.consent_on === '' ? 'Say the day the client agreed.' : null),
      render: () => (
        <Lead decides="Did the client agree to their story being told?">
          <p className="gr-hint">A story can only be shown with the client&apos;s consent on record. Without it you can still save a draft and add the consent later.</p>
          <Field label="How they agreed">
            {() => <ChoiceGroup label="Consent" value={d.consent_method} options={CONSENT_METHODS} onChange={(consent_method) => flow.patch({ consent_method })} />}
          </Field>
          {d.consent_method ? (
            <>
              <Field label="The day they agreed">
                {(id) => <input id={id} type="date" className={INPUT} max={localToday()} value={d.consent_on} onChange={(e) => flow.patch({ consent_on: e.target.value })} />}
              </Field>
              <Evidence flow={flow} options={options} />
            </>
          ) : null}
        </Lead>
      ),
    },
    {
      id: 'review',
      title: 'Review',
      validate: () => null,
      render: () => (
        <Lead decides="Check it, then save.">
          <ul className="gr-list">
            <li className="gr-hint"><strong>{d.case_type}</strong></li>
            <li className="gr-hint">Challenge: {d.challenge}</li>
            <li className="gr-hint">Outcome: {d.outcome}</li>
            <li className="gr-hint">Consent: {flow.hasConsent ? `${CONSENT_METHODS.find((m) => m.value === d.consent_method)?.label}, ${d.consent_on}` : 'not recorded yet'}</li>
          </ul>
          {flow.hasConsent ? (
            <label className="gr-check">
              <input type="checkbox" checked={d.ready} onChange={(e) => flow.patch({ ready: e.target.checked })} />
              It is ready: someone can check it now so posts can show it
            </label>
          ) : (
            <Notice>It is saved as a draft. Posts can show it once the consent is recorded, it is marked ready, and someone has checked it.</Notice>
          )}
          <Refusal message={flow.refusal} />
          {flow.saved ? <p className="gr-row-title">Saved. {flow.saved.status === 'ready' ? 'Check it from the list (Verify) so posts can show it.' : 'Finish it from the list when the consent is in.'}</p> : null}
        </Lead>
      ),
    },
  ];
}
