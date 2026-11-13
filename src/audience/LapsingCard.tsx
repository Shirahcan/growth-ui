import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { dayLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { Card } from '../ui/primitives';
import type { Lapsing } from './types';

/**
 * "Consent runs out soon" (G4c3, idea G-T1-01). People who are on the list because of a purchase or an
 * enquiry may only be emailed for a while (CASL: two years, six months); after that, only people who said
 * yes may be. This card says how many, and when, while there is still time to ask them. Renders nothing
 * when nobody is affected, or when the read fails (the warning is a nudge, the list still works).
 */
export function LapsingCard() {
  const { request, words } = useGrowth();
  const [data, setData] = useState<Lapsing | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ lapsing: Lapsing }>>('GET', 'audience/lapsing')
      .then((res) => live && setData(unwrap(res).lapsing))
      .catch(() => live && setData(null));

    return () => {
      live = false;
    };
  }, [request]);

  if (data === null || data.total === 0) return null;
  const first = data.by_date[0];

  return (
    <Card>
      <div className="gr-stack" role="status">
        <div>
          <h2 className="gr-section-title">
            {data.total} {data.total === 1 ? "person's" : "people's"} consent runs out in the next {data.window_days} days
          </h2>
          <p className="gr-hint">
            They are on {words.product}&apos;s list because they bought something or asked a question. After the date, the law only lets you email
            people who said yes. Send them a short &quot;still want to hear from us?&quot; campaign before then.
          </p>
        </div>
        <ul className="gr-list">
          {data.by_date.slice(0, 6).map((d) => (
            <li key={d.date} className="gr-list-row">
              <span className="gr-row-title gr-grow">{dayLabel(d.date)}</span>
              <span className="gr-hint">
                {d.subscribed > 0 ? `${d.subscribed} subscribed` : null}
                {d.subscribed > 0 && d.pending > 0 ? ', ' : null}
                {d.pending > 0 ? `${d.pending} not asked yet` : null}
              </span>
            </li>
          ))}
        </ul>
        {first ? <p className="gr-hint">Example: the {first.subscribed + first.pending} on {dayLabel(first.date)} stop receiving your newsletter that day unless they confirm.</p> : null}
      </div>
    </Card>
  );
}
