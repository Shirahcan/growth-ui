import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Dialog, Field, INPUT, Pill } from '../ui/primitives';
import type { BlogPostDetail } from './types';

/** When a post goes live, said plainly ("Thu 4 Dec, 09:00"), in the viewer's own time. */
function when(iso: string): string {
  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The refusal of a publish that is not ready: the service's sentence and the checks it named. */
function readinessRefusal(e: unknown): { message: string; checks: string[] } | null {
  const res = (e as { response?: { status?: number; data?: { message?: string; errors?: { readiness?: string[] } } } })?.response;
  if (res?.status !== 422 || !res.data?.errors?.readiness) return null;

  return { message: res.data.message ?? 'This post is not ready to publish.', checks: res.data.errors.readiness };
}

type Asking = null | 'publish' | 'schedule' | 'unpublish';

/**
 * Publishing a post (blog on growth-service S5, step 2): its state, and Publish / Publish the changes / Publish now,
 * Schedule, Unpublish (or take a scheduled post back to a draft), each asking first. A waiting field change is sent
 * before anything goes live, so what is published is what is on screen. The service decides readiness: a refusal names
 * the checks that failed and nothing changes.
 */
export function PostPublishBar({ post, flush, onPost }: { post: BlogPostDetail; flush: () => Promise<boolean>; onPost: (next: BlogPostDetail) => void }) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [asking, setAsking] = useState<Asking>(null);
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; checks: string[] } | null>(null);

  const scheduled = post.status === 'scheduled';
  const showPublish = !post.live || post.has_unpublished_changes;
  const publishLabel = post.live ? 'Publish the changes' : scheduled ? 'Publish now' : 'Publish';
  const state = post.live
    ? post.has_unpublished_changes ? 'Live, with changes not published yet' : 'Live on the blog'
    : scheduled && post.scheduled_for ? `Scheduled for ${when(post.scheduled_for)}` : post.status === 'unpublished' ? 'Taken off the blog' : 'Draft';

  function ask(what: Asking) {
    setRefusal(null);
    setAt('');
    setAsking(what);
  }

  async function act(what: 'publish' | 'schedule' | 'unpublish') {
    setBusy(true);
    setRefusal(null);
    try {
      // What goes live is what is on screen: a field change still waiting is stored first, or nothing is published.
      if (what !== 'unpublish' && !(await flush())) {
        setRefusal({ message: 'Your last change is not saved yet, so nothing was published. Save it (see the notice above), then publish.', checks: [] });

        return;
      }
      const path = `blog/posts/${post.uuid}/${what === 'unpublish' ? 'unpublish' : 'publish'}`;
      const body = what === 'schedule' ? { at: new Date(at).toISOString() } : {};
      const res = await request<Envelope<{ post: BlogPostDetail }>>('POST', path, body);
      onPost(unwrap(res).post);
      notify(res.message || (what === 'unpublish' ? 'Unpublished.' : what === 'schedule' ? 'Scheduled.' : 'Published.'));
      setAsking(null);
    } catch (e) {
      const r = readinessRefusal(e);
      if (r) setRefusal(r);
      else onError(e);
    } finally {
      setBusy(false);
    }
  }

  const minAt = new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16);

  return (
    <div className="gr-row-between">
      <span className="gr-pills">
        <Pill tone={post.live ? 'good' : scheduled ? 'accent' : 'muted'}>{state}</Pill>
      </span>
      {canEdit ? (
        <span className="gr-pills">
          {showPublish ? <Button tone="primary" onClick={() => ask('publish')}>{publishLabel}</Button> : null}
          {!post.live && !scheduled ? <Button onClick={() => ask('schedule')}>Schedule</Button> : null}
          {post.live || scheduled ? <Button onClick={() => ask('unpublish')}>{scheduled ? 'Back to draft' : 'Unpublish'}</Button> : null}
        </span>
      ) : null}

      {asking ? (
        <Dialog
          title={asking === 'unpublish' ? (scheduled ? 'Take this post back to a draft?' : 'Take this post off the blog?') : asking === 'schedule' ? 'Schedule this post' : post.live ? 'Publish your changes?' : 'Publish this post?'}
          description={
            asking === 'unpublish'
              ? 'Readers stop seeing it. It stays here as a draft, and you can publish it again.'
              : asking === 'schedule'
                ? 'It goes live on its own at this time, if it is still ready then.'
                : 'Readers see it on the blog straight away.'
          }
          onClose={() => setAsking(null)}
          footer={
            <>
              <Button onClick={() => setAsking(null)}>Cancel</Button>
              <Button
                tone={asking === 'unpublish' ? 'danger' : 'primary'}
                disabled={busy || (asking === 'schedule' && at === '')}
                onClick={() => void act(asking)}
              >
                {busy ? 'Working…' : asking === 'unpublish' ? (scheduled ? 'Back to draft' : 'Unpublish') : asking === 'schedule' ? 'Schedule' : publishLabel}
              </Button>
            </>
          }
        >
          <div className="gr-stack">
            {asking === 'schedule' ? (
              <Field label="Goes live at" hint="In your own time zone.">
                {(id) => <input id={id} className={INPUT} type="datetime-local" min={minAt} value={at} onChange={(e) => setAt(e.target.value)} />}
              </Field>
            ) : null}
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
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
