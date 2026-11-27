import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Card, ChoiceGroup, Empty, LoadError, Loading } from '../ui/primitives';
import type { ResultsPeriod } from './types';

export interface AttributionRow { kind: 'post' | 'landing' | 'campaign'; ref: string; title: string; people: number; cases: number; paid: Record<string, number> }

export interface AttributionData {
  period: ResultsPeriod;
  from: string;
  known: boolean;
  unknown_because: string | null;
  first_touch: AttributionRow[];
  last_touch: AttributionRow[];
  credited: number;
  without_reading: number;
}

type Touch = 'first' | 'last';

const KIND_WORDS: Record<AttributionRow['kind'], string> = { post: 'Post', landing: 'Landing page', campaign: 'Newsletter' };

/** "CAD 1,250" and "USD 80", one per currency: amounts in different currencies are never added together. */
export function paidWords(paid: Record<string, number>): string {
  const parts = Object.entries(paid).filter(([, n]) => n > 0).map(([cur, n]) => `${cur} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

  return parts.length === 0 ? '-' : parts.join(', ');
}

/**
 * Results' "What led to paid work" (shared program G6c4): for people who became customers in the period, the post,
 * landing page or newsletter that FIRST brought them and the one they saw LAST before their first case, side by side.
 * Counts and totals per item only, never a person. The limits are said on the card, not hidden.
 */
export function AttributionView({ period, bookedMeans = 'became a customer', load }: { period: ResultsPeriod; bookedMeans?: string; load?: (period: ResultsPeriod) => Promise<AttributionData> }) {
  const { request, onError } = useGrowth();
  const [data, setData] = useState<AttributionData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [touch, setTouch] = useState<Touch>('first');

  useEffect(() => {
    let live = true;
    (load ? load(period).then((d) => ({ data: d })) : request<{ data?: AttributionData } & Partial<AttributionData>>('GET', `results/attribution?period=${period}`))
      .then((b) => {
        if (!live) return;
        const d = (b.data ?? b) as Partial<AttributionData>;
        // An answer without the lists (an older service) is a failed load, never a crash of the whole Results tab.
        if (!Array.isArray(d.first_touch) || !Array.isArray(d.last_touch) || typeof d.known !== 'boolean') {
          setFailed(true);
          return;
        }
        setData(d as AttributionData);
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
  }, [request, onError, period, reloadKey, load]);

  const shown = data?.period === period ? data : null;
  const rows = shown ? (touch === 'first' ? shown.first_touch : shown.last_touch) : [];

  return (
    <Card>
      <div className="gr-stack">
        <div>
          <h2 className="gr-section-title">What led to paid work</h2>
          <p className="gr-hint">
            People who {bookedMeans} in this period, credited to the post, landing page or newsletter that first brought them, or the one they saw
            last before. Only people who subscribed can be followed, and a phone that changes network loses its earlier reading, so these are the
            least it led to, never the most.
          </p>
        </div>
        <ChoiceGroup<Touch> label="Credit" value={touch} onChange={setTouch} options={[{ value: 'first', label: 'First touch' }, { value: 'last', label: 'Last touch' }]} />

        {failed && !shown ? (
          <LoadError message="What led to paid work could not be loaded." onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !shown ? (
          <Loading />
        ) : !shown.known ? (
          <p className="gr-warning" role="status">Paid work could not be read just now{shown.unknown_because ? `: ${shown.unknown_because}` : '.'}</p>
        ) : rows.length === 0 ? (
          <Empty>
            {shown.without_reading > 0
              ? `${shown.without_reading} ${shown.without_reading === 1 ? 'subscriber' : 'subscribers'} became customers in this period, but none had read anything first that we could see.`
              : 'Nobody who subscribed became a customer in this period yet.'}
          </Empty>
        ) : (
          <div className="gr-table-wrap">
            <table className="gr-table">
              <thead>
                <tr>
                  <th className="gr-table-main">{touch === 'first' ? 'First brought them' : 'Last before they booked'}</th>
                  <th className="gr-num">People</th>
                  <th className="gr-num">Cases</th>
                  <th className="gr-num">Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}:${r.ref}`}>
                    <td className="gr-table-main">{r.title} <span className="gr-hint">({KIND_WORDS[r.kind]})</span></td>
                    <td className="gr-num">{r.people.toLocaleString()}</td>
                    <td className="gr-num">{r.cases.toLocaleString()}</td>
                    <td className="gr-num">{paidWords(r.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
