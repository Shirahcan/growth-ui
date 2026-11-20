import type { ReactNode } from 'react';
import { Field, INPUT, Loading, Notice, OptionCards, Refusal } from '../ui/primitives';
import type { NewTemplateFlow, NewTemplateKind, NewTemplateStart, NewTemplateWords } from './useNewTemplateFlow';

/**
 * Making a template (growth templates D2) as steps for the HOST's wizard shell, as `createPostSteps` is: one decision per
 * step, each saying what it decides. The host's submit calls `flow.create()` and opens the new template in its designer.
 */
export interface NewTemplateStep {
  id: 'kind' | 'start' | 'source' | 'words' | 'name';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

const KINDS: Array<{ value: NewTemplateKind; label: string; hint: string }> = [
  { value: 'post', label: 'A blog post template', hint: 'What new blog posts start from, shown as the post page readers get.' },
  { value: 'email', label: 'A newsletter template', hint: 'What new newsletters start from, shown as the email an inbox gets.' },
];

function wordsFor(what: string, title: string | null): Array<{ value: NewTemplateWords; label: string; hint: string }> {
  return [
    { value: 'guidance', label: 'Turn its words into guidance', hint: `Each part says what goes there instead, so every new ${what} starts clean.` },
    { value: 'keep', label: 'Keep its words as example text', hint: `${title ? `"${title}"` : 'Its'} words stay for writers to rewrite.` },
  ];
}

function startsFor(kind: NewTemplateKind | null): Array<{ value: NewTemplateStart; label: string; hint: string }> {
  const what = kind === 'email' ? 'newsletter' : 'post';

  return [
    { value: 'blank', label: 'A blank template', hint: 'One part to build on in the designer.' },
    { value: 'copy', label: 'A copy of a template', hint: 'Another template’s parts, rules and words, to change as you need.' },
    { value: 'item', label: kind === 'email' ? 'A newsletter you made' : 'A post you wrote', hint: `That ${what}’s structure, styling and notes; next you choose what happens to its words.` },
  ];
}

function List({ items, value, onPick, empty }: { items: Array<{ id: string; title: string; hint?: string }> | null; value: string | null; onPick: (id: string, title: string) => void; empty: string }) {
  if (items === null) return <Loading />;
  if (items.length === 0) return <Notice>{empty}</Notice>;

  return (
    <div role="radiogroup" aria-label="Choose one" className="gr-choices gr-choices-list">
      {items.map((i) => (
        <button key={i.id} type="button" role="radio" aria-checked={value === i.id} onClick={() => onPick(i.id, i.title)} className={`gr-choice${value === i.id ? ' gr-choice-on' : ''}`}>
          <span className="gr-choice-title">{i.title}</span>
          {i.hint ? <span className="gr-choice-hint">{i.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function newTemplateSteps(flow: NewTemplateFlow): NewTemplateStep[] {
  const { draft, patch } = flow;
  const what = draft.kind === 'email' ? 'newsletter' : 'post';
  const steps: NewTemplateStep[] = [
    {
      id: 'kind',
      title: 'What it is for',
      validate: () => (draft.kind ? null : 'Choose whether it is for blog posts or newsletters.'),
      render: () => (
        <div className="gr-stack">
          <p className="gr-hint">A template is the structure new posts or newsletters start from: its parts, in order, each saying what goes in it.</p>
          <OptionCards<NewTemplateKind> label="What it is for" value={draft.kind} options={KINDS} onChange={(kind) => patch({ kind, from: null, fromTitle: null })} />
        </div>
      ),
    },
    {
      id: 'start',
      title: 'Where it starts',
      validate: () => (draft.start ? null : 'Choose where the template starts.'),
      render: () => (
        <OptionCards<NewTemplateStart> label="Where it starts" value={draft.start} options={startsFor(draft.kind)} onChange={(start) => patch({ start, from: null, fromTitle: null, words: start === 'item' ? 'guidance' : null })} />
      ),
    },
  ];

  if (draft.start === 'copy') {
    steps.push({
      id: 'source',
      title: 'Which template',
      validate: () => (draft.from ? null : 'Choose the template to copy.'),
      render: () => (
        <List
          items={flow.templates === null ? null : flow.templates.map((t) => ({ id: t.key, title: t.name, hint: `${t.parts} parts, version ${t.version}` }))}
          value={draft.from}
          onPick={(from, fromTitle) => patch({ from, fromTitle, name: draft.name || `${fromTitle} copy` })}
          empty={`There is no ${what} template to copy yet. Start from a blank template instead.`}
        />
      ),
    });
  }

  if (draft.start === 'item') {
    steps.push({
      id: 'source',
      title: `Which ${what}`,
      validate: () => (draft.from ? null : `Choose the ${what} to make the template from.`),
      render: () => (
        <div className="gr-stack">
          <Field label={`Search ${what}s`}>{(id) => <input id={id} type="search" className={INPUT} value={flow.q} onChange={(e) => flow.setQ(e.target.value)} placeholder="A word in the title" />}</Field>
          <List
            items={flow.items === null ? null : flow.items.map((i) => ({ id: i.uuid, title: i.title, hint: i.hint }))}
            value={draft.from}
            onPick={(from, fromTitle) => patch({ from, fromTitle })}
            empty={`No ${what} matches. Try another word, or start from a blank template.`}
          />
        </div>
      ),
    });
    steps.push({
      id: 'words',
      title: 'Its words',
      validate: () => (draft.words ? null : 'Choose what happens to its words.'),
      render: () => (
        <div className="gr-stack">
          <p className="gr-hint">Its structure, styling, part order and notes always carry over.</p>
          <OptionCards<NewTemplateWords> label="Its words" value={draft.words} options={wordsFor(what, draft.fromTitle)} onChange={(words) => patch({ words })} />
        </div>
      ),
    });
  }

  steps.push({
    id: 'name',
    title: 'Name it',
    validate: () => (draft.name.trim() !== '' ? null : 'Give the template a name people will recognise.'),
    render: () => (
      <div className="gr-stack">
        <Field label="Template name" hint={`What people choose when they start a ${what}. You can rename it later.`}>
          {(id) => <input id={id} className={INPUT} value={draft.name} onChange={(e) => patch({ name: e.target.value })} maxLength={120} placeholder={draft.kind === 'email' ? 'Monthly update' : 'Step-by-step guide'} />}
        </Field>
        <Refusal message={flow.refusal} />
      </div>
    ),
  });

  return steps;
}
