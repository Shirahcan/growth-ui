import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Card, Loading } from '../ui/primitives';
import { calendarDays, localDay } from './dates';
import { MonthNav } from './PlanIdeasView';
import { unwrap, type Envelope, type PlanCalendarItem } from './types';

/**
 * Plan > Calendar (source: Portify `PlanCalendar`, G3e2): planned ideas and official changes from the
 * service, plus what the host still owns (scheduled posts and newsletters, until G7a/G5) through
 * `loadMoreItems`. Timed items land on the viewer's own day.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND_WORDS: Record<PlanCalendarItem['kind'], string> = { idea: 'Planned idea', post: 'Scheduled post', campaign: 'Scheduled newsletter', signal: 'Official change' };

const dayOf = (item: PlanCalendarItem) => item.date ?? (item.at ? localDay(new Date(item.at)) : '');

export interface PlanCalendarProps {
  month: string;
  onMonth: (month: string) => void;
  /** Host items until their slices move: already carrying the host's own hrefs. */
  loadMoreItems?: (month: string) => Promise<PlanCalendarItem[]>;
}

export function PlanCalendar({ month, onMonth, loadMoreItems }: PlanCalendarProps) {
  const { request, onError, Link, areaHref } = useGrowth();
  const [loaded, setLoaded] = useState<{ month: string; items: PlanCalendarItem[] } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      request<Envelope<{ items: PlanCalendarItem[] }>>('GET', `plan/calendar?month=${encodeURIComponent(month)}`).then((b) =>
        unwrap(b).items.map((i) => ({ ...i, href: areaHref(i.href) })),
      ),
      loadMoreItems ? loadMoreItems(month) : Promise.resolve([] as PlanCalendarItem[]),
    ])
      .then(([theirs, ours]) => live && setLoaded({ month, items: [...theirs, ...ours] }))
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError, areaHref, loadMoreItems, month]);

  const items = loaded?.month === month ? loaded.items : null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="gr-stack">
      <MonthNav month={month} onMonth={onMonth} />
      <Card>
        {items === null ? (
          <Loading />
        ) : (
          <div className="gr-calendar-scroll">
            <div className="gr-calendar">
              {WEEKDAYS.map((d) => (
                <div key={d} className="gr-calendar-head">
                  {d}
                </div>
              ))}
              {calendarDays(month).map((day) => (
                <div key={day.key} className={`gr-calendar-day${day.inMonth ? '' : ' gr-calendar-out'}`}>
                  <p className="gr-calendar-date">{day.day}</p>
                  {items
                    .filter((i) => dayOf(i) === day.key)
                    .map((item, i) => (
                      <Link key={`${item.href}-${i}`} href={item.href} title={`${KIND_WORDS[item.kind]}: ${item.title}`} className={`gr-chip gr-chip-${item.kind}`}>
                        {item.title}
                      </Link>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      <p className="gr-hint">
        {(Object.keys(KIND_WORDS) as PlanCalendarItem['kind'][]).map((k) => KIND_WORDS[k]).join(', ')}. Days follow your device clock ({zone}).
      </p>
    </div>
  );
}
