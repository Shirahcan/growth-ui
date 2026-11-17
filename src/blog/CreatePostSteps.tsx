import type { ReactNode } from 'react';
import { ChoiceGroup, LoadError, Loading, Notice, Refusal } from '../ui/primitives';
import type { CreatePostFlow } from './useCreatePostFlow';

/**
 * Creating a post (blog on growth-service F1), as steps for the HOST's wizard shell (as `storySteps` is): one decision
 * per step, each teaching what it decides. The host's submit calls `flow.create()` and opens its designer on the new post.
 *
 * Today one decision: the template. Starting from a document (the assistant prepares the post from it) joins as a second
 * step when that flow ships; a step with nothing to choose would only be a click in the way.
 */
export interface CreatePostStep {
  id: 'template';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
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

export function createPostSteps(flow: CreatePostFlow): CreatePostStep[] {
  return [
    {
      id: 'template',
      title: 'Pick a template',
      validate: () => (flow.draft.layout_key ? null : 'Pick a template to start from.'),
      render: () => <TemplateStep flow={flow} />,
    },
  ];
}
