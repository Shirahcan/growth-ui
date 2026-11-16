import { useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Notice } from '../ui/primitives';
import type { CampaignFlow } from './useCampaignFlow';

/**
 * "Draft it from the subject" on the content step (G5d5): the service writes a body from the subject with the
 * product's own facts, on THIS click only (never ahead of time). The words on the button are the host's, because
 * they name its assistant ("Ask Porter to draft it from the subject").
 *
 * ⚠ A draft REPLACES the body, so what the admin had written is kept and "Put back what I wrote" restores it. A
 * refusal (no subject, no AI connected, the writer down) is said here, next to the button that caused it.
 */
export function DraftFromSubject({ flow, label }: { flow: CampaignFlow; label: string }) {
  const { request, onError } = useGrowth();
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const d = flow.draft;
  const hasBody = d.bodyHtml.replace(/<[^>]+>/g, '').trim() !== '';

  async function draft() {
    if (d.subject.trim() === '') {
      setRefusal('Write the subject first; the draft is written from it.');

      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const out = unwrap(await request<Envelope<{ draft: { body_html: string; preheader: string } }>>('POST', 'campaigns/draft', {
        subject: d.subject.trim(), kind: d.kind, topic: flow.topics.find((t) => t.key === d.topic)?.label ?? null, preheader: d.preheader.trim() || null,
      })).draft;
      setPrevious(hasBody ? d.bodyHtml : null);
      flow.set({ bodyHtml: out.body_html, preheader: out.preheader ?? d.preheader });
    } catch (e) {
      const why = fieldError(e);
      if (why) setRefusal(why);
      else onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gr-stack">
      <div className="gr-pills">
        <Button disabled={busy} onClick={() => void draft()}>{busy ? 'Drafting…' : label}</Button>
        {previous !== null ? (
          <Button onClick={() => { flow.set({ bodyHtml: previous }); setPrevious(null); }}>Put back what I wrote</Button>
        ) : null}
      </div>
      {hasBody && previous === null && !busy ? <p className="gr-hint">A draft replaces the email below; you can put yours back afterwards.</p> : null}
      {refusal ? <Notice>{refusal}</Notice> : null}
    </div>
  );
}
