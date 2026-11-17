import type { ReactNode } from 'react';
import { ChoiceGroup, Field, LoadError, Loading, Notice, Refusal } from '../ui/primitives';
import type { CreatePostFlow } from './useCreatePostFlow';

/**
 * Creating a post (blog on growth-service F1 + F3), as steps for the HOST's wizard shell (as `storySteps` is): one
 * decision per step, each teaching what it decides. Owner 2026-11-17: "templates screen, with the classic (the default)
 * selected -> choice to proceed with a post doc/file and optional cover photo, or proceed directly -> the designer".
 *
 * The host's submit creates the post (`flow.create()`), and when a document was chosen, reads it and asks the service to
 * prepare the post inside its template (the host owns files: it reads them and keeps the cover photo in its own media).
 */
export interface CreatePostStep {
  id: 'template' | 'start';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface CreatePostStepsOptions {
  /** Offer "Start from a document": the file kinds the host reads, and its upload limit in MB. Absent: no such step. */
  documents?: { accept: string; maxMb: number; assistant: string };
}

function TemplateStep({ flow }: { flow: CreatePostFlow }) {
  if (flow.loadError) return <LoadError message="The templates could not be loaded." onRetry={flow.reload} />;
  if (flow.templates === null) return <Loading label="Loading the templates…" />;
  if (flow.templates.length === 0) {
    return <Notice>This blog has no post templates set up yet, so a new post has no structure to start from. Ask whoever set up the blog to add one.</Notice>;
  }

  const picked = flow.templates.find((t) => t.key === flow.draft.layout_key) ?? null;

  return (
    <div className="gr-stack">
      <p className="gr-row-title">Which structure should the post start from?</p>
      <p className="gr-hint">
        A template is the post&rsquo;s structure: its parts, in order, each saying what goes in it. The post opens in the designer with every
        part in place, and the checks before publishing make sure none is left out.
      </p>
      <ChoiceGroup
        label="Template"
        value={flow.draft.layout_key}
        options={flow.templates.map((t) => ({ value: t.key, label: t.name }))}
        onChange={(key) => flow.patch({ layout_key: key })}
      />
      {picked ? <p className="gr-hint">{picked.name}: {picked.parts} {picked.parts === 1 ? 'part' : 'parts'}.</p> : null}
      <Refusal message={flow.refusal} />
    </div>
  );
}

function FilePick({ label, hint, accept, file, onPick, maxMb }: { label: string; hint: string; accept: string; file: File | null; onPick: (f: File | null) => void; maxMb: number }) {
  const tooBig = file !== null && file.size > maxMb * 1024 * 1024;

  return (
    <Field label={label} hint={hint} error={tooBig ? `The file is larger than ${maxMb} MB. Save a smaller copy and choose it again.` : null}>
      {(id) => (
        <>
          <input id={id} type="file" accept={accept} onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
          {file ? <span className="gr-hint">{file.name}</span> : null}
        </>
      )}
    </Field>
  );
}

function StartStep({ flow, documents }: { flow: CreatePostFlow; documents: NonNullable<CreatePostStepsOptions['documents']> }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">Do you have the post written somewhere already?</p>
      <p className="gr-hint">
        With a document, {documents.assistant} reads it and fills every part of the template with its words, plus the title, summary and search
        details. Anything the document does not say is marked for a person to check, so nothing is published unchecked. You see all of it in
        the designer before anything goes live.
      </p>
      <ChoiceGroup
        label="How to start"
        value={flow.draft.start}
        options={[
          { value: 'document', label: 'Start from a document' },
          { value: 'template', label: 'Start with the template’s guidance' },
        ]}
        onChange={(start) => flow.patch({ start })}
      />
      {flow.draft.start === 'document' ? (
        <>
          <FilePick
            label="The document"
            hint={`A PDF, a Word document, or a text or Markdown file, up to ${documents.maxMb} MB.`}
            accept={documents.accept}
            file={flow.document}
            onPick={flow.setDocument}
            maxMb={documents.maxMb}
          />
          <FilePick
            label="A cover photo (optional)"
            hint={`A JPG, PNG or WebP, up to ${documents.maxMb} MB. You can add or change it later in the designer.`}
            accept=".jpg,.jpeg,.png,.webp"
            file={flow.cover}
            onPick={flow.setCover}
            maxMb={documents.maxMb}
          />
        </>
      ) : null}
      <Refusal message={flow.refusal} />
    </div>
  );
}

export function createPostSteps(flow: CreatePostFlow, options: CreatePostStepsOptions = {}): CreatePostStep[] {
  const steps: CreatePostStep[] = [
    {
      id: 'template',
      title: 'Pick a template',
      validate: () => (flow.draft.layout_key ? null : 'Pick a template to start from.'),
      render: () => <TemplateStep flow={flow} />,
    },
  ];

  const { documents } = options;
  if (documents) {
    const tooBig = (f: File | null) => f !== null && f.size > documents.maxMb * 1024 * 1024;
    steps.push({
      id: 'start',
      title: 'How to start',
      validate: () => {
        if (flow.draft.start !== 'document') return null;
        if (!flow.document) return 'Choose the document, or start with the template’s guidance.';
        if (tooBig(flow.document) || tooBig(flow.cover)) return `A file is larger than ${documents.maxMb} MB.`;

        return null;
      },
      render: () => <StartStep flow={flow} documents={documents} />,
    });
  }

  return steps;
}
