import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { momentLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { Button, Card, Field, INPUT, Loading, Pill, Refusal } from '../ui/primitives';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'not_configured';

export interface DeliverabilityCheckRow { key: string; label: string; status: CheckStatus; says: string; fix: string | null }

export interface Deliverability {
  domain: string | null;
  overall: 'green' | 'amber' | 'red';
  checked_at: string;
  checks: DeliverabilityCheckRow[];
  settings: { complaint_rate_max_percent: number; bounce_rate_max_percent: number; dkim_selector: string | null };
}

const STATUS_WORDS: Record<CheckStatus, { label: string; tone: 'good' | 'bad' | 'muted' | 'accent' }> = {
  pass: { label: 'Good', tone: 'good' },
  warn: { label: 'Watch', tone: 'accent' },
  fail: { label: 'Fix this', tone: 'bad' },
  not_configured: { label: 'Not set up', tone: 'muted' },
};

const OVERALL_WORDS: Record<Deliverability['overall'], string> = {
  green: 'Everything mailbox providers check is in place.',
  amber: 'Nothing is blocking your email, but some things need a look.',
  red: 'Something here can send your email to spam. Each red line says what to add.',
};

/**
 * Deliverability health (G5i), for Settings: whether mailbox providers will trust this product's email. SPF, DKIM and
 * DMARC at the sending domain, one-click unsubscribe, the last 30 days' spam complaints and bounces against the
 * product's own lines, and warm-up advice. A red line names the exact DNS record to add. Checked daily and again
 * when this opens (if the last check is over an hour old), or on "Check again".
 */
export function DeliverabilityView() {
  const { request, notify, onError, canEdit } = useGrowth();
  const [data, setData] = useState<Deliverability | null>(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState<{ complaint: string; bounce: string; selector: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const adopt = useCallback((d: Deliverability) => {
    setData(d);
    setForm({ complaint: String(d.settings.complaint_rate_max_percent), bounce: String(d.settings.bounce_rate_max_percent), selector: d.settings.dkim_selector ?? '' });
  }, []);

  const load = useCallback(
    async (refresh: boolean) => {
      setChecking(true);
      try {
        adopt(unwrap(await request<Envelope<Deliverability>>('GET', refresh ? 'deliverability?refresh=1' : 'deliverability')));
      } catch (e) {
        onError(e);
      } finally {
        setChecking(false);
      }
    },
    [request, onError, adopt],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setRefused(null);
    try {
      adopt(unwrap(await request<Envelope<Deliverability>>('PUT', 'settings/deliverability', {
        complaint_rate_max_percent: Number(form.complaint), bounce_rate_max_percent: Number(form.bounce), dkim_selector: form.selector.trim() || null,
      })));
      notify('Saved, and checked again.');
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Deliverability</h2>
            <p className="gr-hint">
              Whether mailbox providers trust your newsletters{data?.domain ? ` from ${data.domain}` : ''}.{' '}
              {data ? `${OVERALL_WORDS[data.overall]} Checked ${momentLabel(data.checked_at)}.` : ''}
            </p>
          </div>
          <Button disabled={checking} onClick={() => void load(true)}>{checking ? 'Checking…' : 'Check again'}</Button>
        </div>

        {data === null || form === null ? (
          <Loading label="Checking your sending domain…" />
        ) : (
          <>
            <ul className="gr-list" aria-label="Deliverability checks">
              {data.checks.map((c) => (
                <li key={c.key} className="gr-list-row">
                  <div className="gr-grow gr-stack">
                    <div className="gr-row-between">
                      <span className="gr-row-title">{c.label}</span>
                      <Pill tone={STATUS_WORDS[c.status].tone}>{STATUS_WORDS[c.status].label}</Pill>
                    </div>
                    <span className="gr-hint">{c.says}</span>
                    {c.fix ? <span className="gr-hint"><strong>What to do:</strong> {c.fix}</span> : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="gr-settings-block gr-grid-3">
              <Field label="Spam complaint line (%)" hint="Above this, the complaint line turns red. Gmail and Yahoo filter senders above 0.3.">
                {(id) => <input id={id} type="number" step="0.01" min={0.01} max={5} className={INPUT} value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} disabled={!canEdit} />}
              </Field>
              <Field label="Bounce line (%)" hint="Above this, the bounce line turns red. Example: 2.">
                {(id) => <input id={id} type="number" step="0.1" min={0.1} max={20} className={INPUT} value={form.bounce} onChange={(e) => setForm({ ...form, bounce: e.target.value })} disabled={!canEdit} />}
              </Field>
              <Field label="DKIM selector" hint="As your mail provider shows it. Empty: the usual ones are tried (Google: google).">
                {(id) => <input id={id} className={INPUT} maxLength={63} value={form.selector} onChange={(e) => setForm({ ...form, selector: e.target.value })} disabled={!canEdit} />}
              </Field>
            </div>
            <Refusal message={refused} />
            {canEdit ? <div><Button tone="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save and check again'}</Button></div> : null}
          </>
        )}
      </div>
    </Card>
  );
}
