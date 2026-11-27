import type { ReactNode } from 'react';
import { FilePick } from '../blog/CreatePostSteps';
import { TemplateCards } from '../blog/TemplateCards';
import { Field, INPUT, LoadError, Loading, Notice, OptionCards, Refusal } from '../ui/primitives';
import { KIND_OPTIONS } from './choices';
import { SUBJECT_GUIDE, type CreateCampaignFlow } from './useCreateCampaignFlow';

/**
 * Creating a newsletter or an alert (blog on growth-service N1e), as steps for the HOST's wizard shell, as
 * `createPostSteps` are: one decision per step, each teaching what it decides. The owner's rule (2026-11-17) is that
 * the designer is the object's only surface, so the flow ends by opening the campaign there; who it goes to, when it
 * goes and the send itself are the designer's panels.
 */
export interface CreateCampaignStep {
  id: 'kind' | 'template' | 'start' | 'subject';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface CreateCampaignStepsOptions {
  /**
   * Offer "Start from a document" (0.24.0, N1h-5): the file kinds the host reads, its upload limit in MB and the
   * assistant's name. The host stores the file and hands it to the designer's console, which prepares the newsletter
   * inside its template (owner 2026-11-17: "When a doc/file is uploaded, the Porter console itself should be used!").
   * Absent: no such step.
   */
  documents?: { accept: string; maxMb: number; assistant: string };
}

function StartStep({ flow, documents }: { flow: CreateCampaignFlow; documents: NonNullable<CreateCampaignStepsOptions['documents']> }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">Do you have it written somewhere already?</p>
      <p className="gr-hint">Nothing is sent until you press Send.</p>
      <OptionCards<'document' | 'template'>
        label="How to start"
        value={flow.draft.start ?? 'template'}
        options={[
          {
            value: 'document',
            label: 'Start from a document',
            hint: `Your notes, a draft, an announcement: ${documents.assistant} reads it in the designer and fills every part, plus the preview text and the current figures; anything it does not say is marked for a person to check.`,
          },
          { value: 'template', label: 'Start with the template’s guidance', hint: 'The designer opens with every part in place, each saying what goes there.' },
        ]}
        onChange={(start) => flow.patch({ start })}
      />
      {flow.draft.start === 'document' ? (
        <FilePick
          label="The document"
          hint={`A PDF, a Word document, or a text or Markdown file, up to ${documents.maxMb} MB.`}
          kinds="a PDF, a Word document, or a text or Markdown file"
          accept={documents.accept}
          file={flow.document}
          onPick={flow.setDocument}
          maxMb={documents.maxMb}
        />
      ) : null}
    </div>
  );
}

function KindStep({ flow }: { flow: CreateCampaignFlow }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">What are you sending?</p>
      <p className="gr-hint">You can change this until it goes out.</p>
      <OptionCards<'regular' | 'alert'>
        label="Kind"
        value={flow.draft.kind}
        options={KIND_OPTIONS}
        onChange={(kind) => flow.patch({ kind })}
      />
    </div>
  );
}

function TemplateStep({ flow }: { flow: CreateCampaignFlow }) {
  if (flow.loadError) return <LoadError message="The templates could not be loaded." onRetry={flow.reload} />;
  if (flow.templates === null) return <Loading label="Loading the templates…" />;
  if (flow.templates.length === 0) {
    return <Notice>No email templates are set up yet, so a new newsletter has no structure to start from. Ask whoever set up the newsletter to add one.</Notice>;
  }

  const picked = flow.templates.find((t) => t.key === flow.draft.layout_key) ?? null;

  return (
    <div className="gr-stack">
      <p className="gr-row-title">Which structure should it start from?</p>
      <p className="gr-hint">
        A template is the email&rsquo;s structure: its parts, in order, each saying what goes in it. It opens in the designer with every part in
        place, styled the way every email from you is styled, so you only write the words.
      </p>
      {/* The same preview cards a post's template step uses (owner 2026-11-17: "like MS Word"); an email is drawn as itself. */}
      <TemplateCards templates={flow.templates} previews={flow.previews} value={flow.draft.layout_key} onChange={(key) => flow.patch({ layout_key: key })} />
      {picked ? <p className="gr-hint">{picked.name}: {picked.parts} {picked.parts === 1 ? 'part' : 'parts'}.</p> : null}
    </div>
  );
}

function SubjectStep({ flow, assistant }: { flow: CreateCampaignFlow; assistant: string }) {
  const length = flow.draft.subject.trim().length;
  const fromDocument = flow.draft.start === 'document' && flow.document !== null;
  const over = length > SUBJECT_GUIDE;

  return (
    <div className="gr-stack">
      <p className="gr-row-title">What is the subject line?</p>
      <p className="gr-hint">
        It is what people see in their inbox before they open it, and it names the draft in your list. Example: Express Entry draw: 2,500
        invitations at CRS 520. You can change it in the designer until it goes out. Nothing is sent from here.
      </p>
      {fromDocument && flow.document ? (
        <p className="gr-hint">
          {assistant} keeps your subject as you write it, and writes the preview text from {flow.document.name} with the rest.
        </p>
      ) : null}
      <Field
        label="Subject"
        hint={`${length} of ${SUBJECT_GUIDE} characters${over ? ': most inboxes cut off the rest, so lead with what matters.' : '.'}`}
      >
        {(id) => <input id={id} className={INPUT} maxLength={255} value={flow.draft.subject} onChange={(e) => flow.patch({ subject: e.target.value })} />}
      </Field>
      {flow.draft.kind === 'alert' ? null : (
        <label className="gr-hint" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={flow.draft.testSubjects === true} onChange={(e) => flow.patch({ testSubjects: e.target.checked })} />
          <span>Test two subjects. Each goes to a small share of the audience first; after a few hours, the one more people click goes to everyone else. Nobody gets both. It needs a large enough audience, or the send waits and says why.</span>
        </label>
      )}
      {flow.draft.kind !== 'alert' && flow.draft.testSubjects ? (
        <Field label="Second subject" hint="Change one thing, so the result tells you something: the opening words, a number, a question. You can change it in the designer's Details.">
          {(id) => <input id={id} className={INPUT} maxLength={255} value={flow.draft.subjectB ?? ''} onChange={(e) => flow.patch({ subjectB: e.target.value })} />}
        </Field>
      ) : null}
      <Refusal message={flow.refusal} />
    </div>
  );
}

export function createCampaignSteps(flow: CreateCampaignFlow, options: CreateCampaignStepsOptions = {}): CreateCampaignStep[] {
  const { documents } = options;
  const steps: CreateCampaignStep[] = [
    { id: 'kind', title: 'What you are sending', validate: () => null, render: () => <KindStep flow={flow} /> },
    {
      id: 'template',
      title: 'Pick a template',
      validate: () => (flow.draft.layout_key ? null : 'Pick a template to start from.'),
      render: () => <TemplateStep flow={flow} />,
    },
  ];

  if (documents) {
    const tooBig = (f: File | null) => f !== null && f.size > documents.maxMb * 1024 * 1024;
    steps.push({
      id: 'start',
      title: 'How to start',
      validate: () => {
        if (flow.draft.start !== 'document') return null;
        if (!flow.document) return 'Choose the document, or start with the template’s guidance.';
        if (tooBig(flow.document)) return `The file is larger than ${documents.maxMb} MB.`;

        return null;
      },
      render: () => <StartStep flow={flow} documents={documents} />,
    });
  }

  steps.push({
    id: 'subject',
    title: 'The subject line',
    validate: () => {
      if (flow.draft.subject.trim() === '') return 'Write a subject line.';
      if (flow.draft.kind === 'alert' || !flow.draft.testSubjects) return null;
      const b = (flow.draft.subjectB ?? '').trim();
      if (b === '') return 'Write the second subject, or turn the test off.';

      return b.toLowerCase() === flow.draft.subject.trim().toLowerCase() ? 'The two subjects are the same. Change one, or turn the test off.' : null;
    },
    render: () => <SubjectStep flow={flow} assistant={documents?.assistant ?? 'The assistant'} />,
  });

  return steps;
}
