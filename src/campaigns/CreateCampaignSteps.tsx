import type { ReactNode } from 'react';
import { TemplateCards } from '../blog/TemplateCards';
import { ChoiceGroup, Field, INPUT, LoadError, Loading, Notice, Refusal } from '../ui/primitives';
import { SUBJECT_GUIDE, type CreateCampaignFlow } from './useCreateCampaignFlow';

/**
 * Creating a newsletter or an alert (blog on growth-service N1e), as steps for the HOST's wizard shell, as
 * `createPostSteps` are: one decision per step, each teaching what it decides. The owner's rule (2026-11-17) is that
 * the designer is the object's only surface, so the flow ends by opening the campaign there; who it goes to, when it
 * goes and the send itself are the designer's panels.
 */
export interface CreateCampaignStep {
  id: 'kind' | 'template' | 'subject';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

function KindStep({ flow }: { flow: CreateCampaignFlow }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">What are you sending?</p>
      <p className="gr-hint">
        A newsletter respects each person&apos;s pace: someone who chose every 2 weeks is not mailed twice inside that time. An alert goes the
        same day, only to people who asked for every update. You can change this until it goes out.
      </p>
      <ChoiceGroup<'regular' | 'alert'>
        label="Kind"
        value={flow.draft.kind}
        options={[{ value: 'regular', label: 'Newsletter' }, { value: 'alert', label: 'Alert' }]}
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

function SubjectStep({ flow }: { flow: CreateCampaignFlow }) {
  const length = flow.draft.subject.trim().length;
  const over = length > SUBJECT_GUIDE;

  return (
    <div className="gr-stack">
      <p className="gr-row-title">What is the subject line?</p>
      <p className="gr-hint">
        It is what people see in their inbox before they open it, and it names the draft in your list. Example: Express Entry draw: 2,500
        invitations at CRS 520. You can change it in the designer until it goes out. Nothing is sent from here.
      </p>
      <Field
        label="Subject"
        hint={`${length} of ${SUBJECT_GUIDE} characters${over ? ': most inboxes cut off the rest, so lead with what matters.' : '.'}`}
      >
        {(id) => <input id={id} className={INPUT} maxLength={255} value={flow.draft.subject} onChange={(e) => flow.patch({ subject: e.target.value })} />}
      </Field>
      <Refusal message={flow.refusal} />
    </div>
  );
}

export function createCampaignSteps(flow: CreateCampaignFlow): CreateCampaignStep[] {
  return [
    { id: 'kind', title: 'What you are sending', validate: () => null, render: () => <KindStep flow={flow} /> },
    {
      id: 'template',
      title: 'Pick a template',
      validate: () => (flow.draft.layout_key ? null : 'Pick a template to start from.'),
      render: () => <TemplateStep flow={flow} />,
    },
    {
      id: 'subject',
      title: 'The subject line',
      validate: () => (flow.draft.subject.trim() === '' ? 'Write a subject line.' : null),
      render: () => <SubjectStep flow={flow} />,
    },
  ];
}
