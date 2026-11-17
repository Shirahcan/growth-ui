import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, INPUT, Pill, copyText } from '../ui/primitives';

/** One thing a writing check found: the words it is about, and what to do. */
export interface ProofreadIssue {
  kind: string;
  quote: string;
  say: string;
}

export interface PostHelpersProps {
  /** The post, by its service id; `linkedin_text` is the last version the service stored, if the host has it. */
  post: { uuid: string; linkedin_text?: string | null };
  /**
   * Store what is on screen first (the host's save), so the help is about the post as the author sees it. Resolves
   * false when it could not save; nothing is asked then. Absent: there is nothing waiting to save.
   */
  flush?: () => Promise<boolean>;
}

type Working = null | 'linkedin' | 'proofread';

/** A refusal the service explains (422 with its readiness list): shown here, never as an error. */
function refusalOf(e: unknown): { message: string; checks: string[] } | null {
  const res = (e as { response?: { status?: number; data?: { message?: string; errors?: { readiness?: string[] } } } })?.response;
  if (res?.status !== 422 || !res.data?.message) return null;

  return { message: res.data.message, checks: res.data.errors?.readiness ?? [] };
}

const nothingWaiting = async () => true;

/**
 * Help from the assistant on a post (blog on growth-service S5; the two panels the product's editor had): a LinkedIn
 * version to copy and post, and a check of the writing that lists what a reader would trip over.
 *
 * BARE CONTENT for the host's slide-in panel (the post's designer is its only surface, owner 2026-11-17), so the panel
 * owns the title ("Help from Porter") and the scrolling. Each button is ONE model call made because the author asked
 * (on demand, never on a timer); the service's own sentence is shown as it is, including when it could not use the
 * assistant and fell back. Checking the writing writes nothing. A stored LinkedIn version opens without a new call.
 */
export function PostHelpers({ post, flush = nothingWaiting }: PostHelpersProps) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [working, setWorking] = useState<Working>(null);
  const [linkedin, setLinkedin] = useState<{ text: string; message: string } | null>(post.linkedin_text ? { text: post.linkedin_text, message: '' } : null);
  const [check, setCheck] = useState<{ message: string; issues: ProofreadIssue[] } | null>(null);
  const [refusal, setRefusal] = useState<{ message: string; checks: string[] } | null>(null);

  async function ask(what: 'linkedin' | 'proofread') {
    setWorking(what);
    setRefusal(null);
    try {
      if (!(await flush())) {
        setRefusal({ message: 'Your last change is not saved yet. Save it, then ask again.', checks: [] });

        return;
      }
      if (what === 'linkedin') {
        const res = await request<Envelope<{ linkedin_text: string; ai_used: boolean }>>('POST', `blog/posts/${post.uuid}/linkedin`, {});
        setLinkedin({ text: unwrap(res).linkedin_text, message: res.message ?? '' });
      } else {
        const res = await request<Envelope<{ issues: ProofreadIssue[]; ai_used: boolean }>>('POST', `blog/posts/${post.uuid}/proofread`, {});
        setCheck({ message: res.message ?? '', issues: unwrap(res).issues ?? [] });
      }
    } catch (e) {
      const r = refusalOf(e);
      if (r) setRefusal(r);
      else onError(e);
    } finally {
      setWorking(null);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) notify('Copied. Paste it into a new LinkedIn post.');
    else onError(new Error('The text could not be copied. Select it in the box and copy it yourself.'));
  }

  if (!canEdit) return null;

  return (
    <div className="gr-stack">
      <p className="gr-hint">
        {working ? 'This can take up to a minute and a half. You can keep working meanwhile.' : 'Each asks once, about the post as it is on screen.'}
      </p>
      {refusal ? (
        <div role="alert" className="gr-notice">
          <p>{refusal.message}</p>
          {refusal.checks.length > 0 ? (
            <ul>
              {refusal.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="gr-stack" aria-labelledby="gr-helpers-linkedin">
        <h3 id="gr-helpers-linkedin" className="gr-section-title">LinkedIn version</h3>
        <p className="gr-hint">A short version of this post to share on LinkedIn, with a link back to it.</p>
        <div>
          <Button disabled={working !== null} onClick={() => void ask('linkedin')}>
            {working === 'linkedin' ? 'Writing…' : linkedin ? 'Prepare it again' : 'Prepare LinkedIn version'}
          </Button>
        </div>
        {linkedin ? (
          <>
            {linkedin.message ? <p className="gr-notice" role="status">{linkedin.message}</p> : null}
            <textarea className={INPUT} aria-label="LinkedIn version" readOnly rows={10} value={linkedin.text} />
            <div>
              <Button tone="primary" onClick={() => void copy(linkedin.text)}>Copy</Button>
            </div>
          </>
        ) : null}
      </section>

      <section className="gr-stack" aria-labelledby="gr-helpers-check">
        <h3 id="gr-helpers-check" className="gr-section-title">Check the writing</h3>
        <p className="gr-hint">Lists what a reader would trip over. It changes nothing in the post.</p>
        <div>
          <Button disabled={working !== null} onClick={() => void ask('proofread')}>{working === 'proofread' ? 'Checking…' : 'Check the writing'}</Button>
        </div>
        {check ? (
          <>
            {check.message ? <p className="gr-notice" role="status">{check.message}</p> : null}
            {check.issues.length > 0 ? (
              <ul className="gr-list" aria-label="What the check found">
                {check.issues.map((issue, i) => (
                  <li key={i} className="gr-list-row">
                    <div className="gr-grow">
                      <p className="gr-row-title"><Pill>{issue.kind}</Pill> &ldquo;{issue.quote}&rdquo;</p>
                      <p className="gr-hint">{issue.say}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
