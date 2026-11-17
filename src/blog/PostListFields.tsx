import { Button, INPUT } from '../ui/primitives';
import type { PostFact, ReaderQuestion } from './types';

/**
 * The figures a post quotes, each with the date it should be checked again (blog on growth-service S5). A fact past its
 * date, or one whose source changed, is what marks a post "Facts need a look" on the list.
 */
export function FactsField({ facts, onChange, disabled }: { facts: PostFact[]; onChange: (next: PostFact[]) => void; disabled?: boolean }) {
  const at = (i: number, patch: Partial<PostFact>) => onChange(facts.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <fieldset className="gr-stack" disabled={disabled}>
      <legend className="gr-label">Facts this post quotes</legend>
      <p className="gr-hint">Each figure with the date to check it again. A fact past its date marks the post "Facts need a look".</p>
      {facts.length === 0 ? <p className="gr-hint">No facts yet.</p> : null}
      {facts.map((fact, i) => (
        <div key={i} className="gr-filters">
          <label className="gr-grow">
            <span className="gr-sr-only">Fact {i + 1}</span>
            <input className={INPUT} maxLength={300} value={fact.text} placeholder="You usually have 30 days to respond" onChange={(e) => at(i, { text: e.target.value })} />
          </label>
          <label>
            <span className="gr-sr-only">Review fact {i + 1} by</span>
            <input className={INPUT} type="date" value={fact.review_by ?? ''} onChange={(e) => at(i, { review_by: e.target.value || null })} />
          </label>
          <Button aria-label={`Remove fact ${i + 1}`} onClick={() => onChange(facts.filter((_, j) => j !== i))}>Remove</Button>
        </div>
      ))}
      {facts.length < 30 ? (
        <div>
          <Button onClick={() => onChange([...facts, { text: '', review_by: null, source_key: null }])}>Add a fact</Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/** The questions readers ask, with their answers (they can be added to the assistant's knowledge on publishing). */
export function ReaderQuestionsField({ questions, onChange, disabled }: { questions: ReaderQuestion[]; onChange: (next: ReaderQuestion[]) => void; disabled?: boolean }) {
  const at = (i: number, patch: Partial<ReaderQuestion>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  return (
    <fieldset className="gr-stack" disabled={disabled}>
      <legend className="gr-label">Reader questions</legend>
      <p className="gr-hint">The questions a reader of this post would ask, each with a short answer.</p>
      {questions.length === 0 ? <p className="gr-hint">No questions yet.</p> : null}
      {questions.map((item, i) => (
        <div key={i} className="gr-stack">
          <div className="gr-filters">
            <label className="gr-grow">
              <span className="gr-sr-only">Question {i + 1}</span>
              <input className={INPUT} maxLength={300} value={item.q} placeholder="How long do I have to respond?" onChange={(e) => at(i, { q: e.target.value })} />
            </label>
            <Button aria-label={`Remove question ${i + 1}`} onClick={() => onChange(questions.filter((_, j) => j !== i))}>Remove</Button>
          </div>
          <label>
            <span className="gr-sr-only">Answer {i + 1}</span>
            <textarea className={INPUT} rows={2} maxLength={2000} value={item.a} placeholder="The answer" onChange={(e) => at(i, { a: e.target.value })} />
          </label>
        </div>
      ))}
      {questions.length < 20 ? (
        <div>
          <Button onClick={() => onChange([...questions, { q: '', a: '' }])}>Add a question</Button>
        </div>
      ) : null}
    </fieldset>
  );
}
