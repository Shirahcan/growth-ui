import { useCallback, useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Card, ChoiceGroup, Empty, LoadError, Loading } from '../ui/primitives';
import { AttributionView } from './AttributionView';
import type { ResultsData, ResultsPeriod } from './types';

/**
 * Growth > Results (shared program G6a4, source: Portify's Results page): who subscribed and from where, where blog
 * readers came from, and which posts' readers went on to become customers. Counted on the service from views the
 * product forwards (a visitor hash, never an IP), with no outside tracker.
 *
 * `load` is a host hook while some sources are still the product's own records (Portify's landing pages and keyword
 * links until G7b): the host answers from its own endpoint, which names them. Without it the view reads the kit's
 * `results` row directly.
 */
export interface ResultsViewProps {
  load?: (period: ResultsPeriod) => Promise<ResultsData>;
  /** What a booking is, in the product's words (Portify: "opened a case"). */
  bookedMeans?: string;
  /**
   * A host that draws the period in its own top bar (it shows a value, so it belongs there) passes it here; the view
   * then draws no picker of its own. Without it the view keeps its own.
   */
  period?: ResultsPeriod;
  /**
   * G6c4: the "What led to paid work" card (first and last touch). On by default; a host that supplies its own `load`
   * owns the data, so the card shows only when it also supplies `loadAttribution`.
   */
  attribution?: boolean;
  loadAttribution?: (period: ResultsPeriod) => Promise<import('./AttributionView').AttributionData>;
}

export const RESULTS_PERIODS: ReadonlyArray<{ value: ResultsPeriod; label: string }> = [
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
];

const SOURCE_WORDS: Record<string, string> = {
  search: 'Search engines',
  newsletter: 'Newsletter',
  social: 'Social media',
  ai_assistant: 'AI assistants',
  direct: 'Direct',
  other: 'Other sites',
};

interface Bar {
  key: string;
  label: string;
  note?: string;
  total: number;
}

function Bars({ rows, unit }: { rows: Bar[]; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <ul className="gr-bars" aria-label={`Counted in ${unit}`}>
      {rows.map((r) => (
        <li key={r.key} className="gr-bar-row">
          <div className="gr-bar-label">
            <span className="gr-bar-name">{r.label}</span>
            {r.note && <span className="gr-hint">{r.note}</span>}
            <span className="gr-bar-total">{r.total.toLocaleString()}</span>
          </div>
          <div className="gr-bar-track" aria-hidden="true">
            <div className="gr-bar-fill" style={{ width: `${Math.max(4, Math.round((r.total / max) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ResultsView({ load, bookedMeans = 'became a customer', period: hostPeriod, attribution = true, loadAttribution }: ResultsViewProps) {
  const { request, onError } = useGrowth();
  const [ownPeriod, setPeriod] = useState<ResultsPeriod>('30d');
  const period = hostPeriod ?? ownPeriod;
  const [loaded, setLoaded] = useState<ResultsData | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const read = useCallback(
    (p: ResultsPeriod): Promise<ResultsData> =>
      load
        ? load(p)
        : request<{ data?: ResultsData } & Partial<ResultsData>>('GET', `results?period=${p}`).then((b) => (b.data ?? b) as ResultsData),
    [load, request],
  );

  useEffect(() => {
    let live = true;
    read(period)
      .then((data) => {
        if (live) setLoaded(data);
      })
      .catch((e) => {
        if (!live) return;
        setFailedFor(`${period}:${reloadKey}`);
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [period, read, onError, reloadKey]);

  const results = loaded?.period === period ? loaded : null;
  const failed = failedFor === `${period}:${reloadKey}`;

  return (
    <div className="gr-stack">
      {hostPeriod === undefined && <ChoiceGroup label="Period" value={period} options={[...RESULTS_PERIODS]} onChange={setPeriod} />}

      {failed && !results ? (
        <LoadError message="The results could not be loaded." onRetry={() => setReloadKey((k) => k + 1)} />
      ) : !results ? (
        <Loading label="Loading the results…" />
      ) : (
        <>
          <div className="gr-grid-2">
            <Card>
              <h2 className="gr-section-title">New subscribers, by what brought them</h2>
              {results.new_subscribers.length === 0 ? (
                <Empty>Nobody confirmed in this period yet. People appear here once they confirm by email.</Empty>
              ) : (
                <Bars unit="subscribers" rows={results.new_subscribers.map((r) => ({ key: `${r.kind}:${r.label}`, label: r.label, note: r.kind, total: r.total }))} />
              )}
            </Card>
            <Card>
              <h2 className="gr-section-title">Where blog readers came from</h2>
              {results.reader_sources.length === 0 ? (
                <Empty>No readers counted in this period yet. Views are counted once a post is live.</Empty>
              ) : (
                <Bars unit="readers" rows={results.reader_sources.map((r) => ({ key: r.source, label: SOURCE_WORDS[r.source] ?? r.source, total: r.total }))} />
              )}
              <p className="gr-hint gr-results-note">AI assistants rarely say where a visitor came from, so this counts only known AI sites. The real number is higher.</p>
            </Card>
          </div>

          <Card>
            <h2 className="gr-section-title">From reader to booking</h2>
            <p className="gr-hint">Booked means someone who subscribed from the post, then {bookedMeans} afterwards.</p>
            {results.conversions_known === false && (
              <p className="gr-warning" role="status">Bookings could not be read just now, so Booked shows Unknown. Reload to try again.</p>
            )}
            {results.reader_to_booking.length === 0 ? (
              <Empty>Nothing to show yet. Posts appear here once they have readers or subscribers.</Empty>
            ) : (
              <div className="gr-table-wrap">
                <table className="gr-table">
                  <thead>
                    <tr>
                      <th className="gr-table-main">Post</th>
                      <th className="gr-num">Readers</th>
                      <th className="gr-num">Subscribed</th>
                      <th className="gr-num">Booked</th>
                      <th className="gr-num">Booking rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.reader_to_booking.map((row) => (
                      <tr key={row.slug}>
                        <td className="gr-table-main">{row.title}</td>
                        <td className="gr-num">{row.readers.toLocaleString()}</td>
                        <td className="gr-num">{row.subscribed.toLocaleString()}</td>
                        <td className="gr-num">{row.booked === null ? 'Unknown' : row.booked.toLocaleString()}</td>
                        <td className="gr-num">{row.rate === null ? '-' : `${row.rate}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {attribution && (load === undefined || loadAttribution !== undefined) ? <AttributionView period={period} bookedMeans={bookedMeans} load={loadAttribution} /> : null}
        </>
      )}
    </div>
  );
}
