import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Card, Empty, LoadError, Loading } from '../ui/primitives';
import type { ResultsPeriod } from './types';

export interface AiVisibilityCheckRow {
  question: string;
  cited: boolean;
  position: number | null;
  sources: Array<{ title: string; url: string; host: string; own: boolean }>;
  checked_at: string;
}

export interface AiVisibilityData {
  period: ResultsPeriod;
  own_hosts: string[];
  /** the sites added here, apart from the blog's own address */
  domains?: string[];
  visits: Array<{ kind: 'post' | 'landing'; ref: string; title: string; visits: number }>;
  questions: Array<{ question: string; last_check: AiVisibilityCheckRow | null }>;
  cost: { web_searches: number };
}

/** "Nov 27, 2026" in the reader's own locale. */
function day(iso: string): string {
  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Results' "AI assistants" panel (shared program G6d). Visits from AI assistants per page are counted for free; a
 * check of the saved questions runs ONLY when the admin presses it, says what it costs first (one web search per
 * question), and keeps its answer with the date. Honest about what it measures: whether the product's own site is
 * among the web results that searching assistants answer from, not what one assistant said.
 */
export function AiVisibilityPanel({ period }: { period: ResultsPeriod }) {
  const { request, onError, notify } = useGrowth();
  const [data, setData] = useState<AiVisibilityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sites, setSites] = useState('');
  const [busy, setBusy] = useState<'save' | 'check' | null>(null);

  useEffect(() => {
    let live = true;
    request<{ data?: AiVisibilityData } & Partial<AiVisibilityData>>('GET', `results/ai-visibility?period=${period}`)
      .then((b) => {
        if (!live) return;
        const d = (b.data ?? b) as Partial<AiVisibilityData>;
        if (!Array.isArray(d.questions) || !Array.isArray(d.visits)) {
          setFailed(true);
          return;
        }
        setData(d as AiVisibilityData);
        setFailed(false);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(true);
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, period, reloadKey]);

  const startEditing = () => {
    setDraft((data?.questions ?? []).map((q) => q.question).join('\n'));
    setSites((data?.domains ?? []).join('\n'));
    setEditing(true);
  };

  const save = async () => {
    setBusy('save');
    try {
      await request('PUT', 'settings/ai-visibility', {
        questions: draft.split('\n').map((s) => s.trim()).filter(Boolean),
        domains: sites.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      notify('Questions saved.');
      setEditing(false);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy('check');
    try {
      await request('POST', 'results/ai-visibility/check', {});
      notify('Checked.');
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  const shown = data?.period === period ? data : null;
  const searches = shown?.cost.web_searches ?? 0;

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">AI assistants</h2>
          <p className="gr-hint">
            Visits that came from an AI assistant, and whether your site is among the web results assistants that search the web answer from.
            It does not read what one particular assistant said.
          </p>
        </div>

        {failed && !shown ? (
          <LoadError message="AI assistant results could not be loaded." onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !shown ? (
          <Loading />
        ) : (
          <>
            <div>
              <h3 className="gr-label">Visits from AI assistants</h3>
              {shown.visits.length === 0 ? (
                <Empty>No visits from an AI assistant in this period yet.</Empty>
              ) : (
                <div className="gr-table-wrap">
                  <table className="gr-table">
                    <thead>
                      <tr>
                        <th className="gr-table-main">Page</th>
                        <th className="gr-num">Visits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.visits.map((v) => (
                        <tr key={`${v.kind}:${v.ref}`}>
                          <td className="gr-table-main">{v.title}</td>
                          <td className="gr-num">{v.visits.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="gr-stack">
              <h3 className="gr-label">Questions people ask</h3>
              {editing ? (
                <>
                  <label className="gr-field">
                    <span className="gr-label">Questions, one per line (up to 10)</span>
                    <textarea className="gr-input" rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <span className="gr-hint">Write each as someone would ask it. Example: How long does a work permit extension take in Canada?</span>
                  </label>
                  <label className="gr-field">
                    <span className="gr-label">What counts as your site, one per line</span>
                    <textarea className="gr-input" rows={2} value={sites} onChange={(e) => setSites(e.target.value)} />
                    <span className="gr-hint">Host names only, for example portify.shirah.co. Your blog&apos;s address is always included, so add only other sites.</span>
                  </label>
                  <div className="gr-row">
                    <button type="button" className="gr-button gr-button-primary" disabled={busy !== null} onClick={() => void save()}>
                      {busy === 'save' ? 'Saving…' : 'Save questions'}
                    </button>
                    <button type="button" className="gr-button" disabled={busy !== null} onClick={() => setEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : shown.questions.length === 0 ? (
                <Empty>No questions saved. Add the questions your clients ask, then check whether your site comes up for them.</Empty>
              ) : (
                <ul className="gr-list">
                  {shown.questions.map((q) => (
                    <li key={q.question} className="gr-list-row">
                      <span className="gr-table-main">{q.question}</span>
                      <span className="gr-hint">
                        {q.last_check === null
                          ? 'Not checked yet'
                          : q.last_check.cited
                            ? `Your site is result ${q.last_check.position} (checked ${day(q.last_check.checked_at)})`
                            : `Your site is not in the top results (checked ${day(q.last_check.checked_at)})${q.last_check.sources[0] ? `; first is ${q.last_check.sources[0].host}` : ''}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!editing ? (
                <div className="gr-row">
                  <button type="button" className="gr-button" disabled={busy !== null} onClick={startEditing}>
                    {shown.questions.length === 0 ? 'Add questions' : 'Edit questions'}
                  </button>
                  {searches > 0 ? (
                    <button type="button" className="gr-button gr-button-primary" disabled={busy !== null || shown.own_hosts.length === 0} onClick={() => void check()}>
                      {busy === 'check' ? 'Checking…' : `Check now (${searches} web ${searches === 1 ? 'search' : 'searches'})`}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {shown.own_hosts.length === 0 && !editing ? (
                <p className="gr-warning" role="status">Your site&apos;s address is not set, so there is nothing to look for. Add it under Edit questions.</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
