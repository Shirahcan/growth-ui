import React, { useEffect, useState } from 'react';

import { useGrowth } from '../GrowthProvider';

/** growth-service `GET plan/refresh-queue` (G7f): one published post that needs a refresh, and why, in words. */
export interface RefreshQueueItem {
  uuid: string;
  title: string;
  slug: string;
  score: number;
  reasons: string[];
  facts: string | null;
  dead: { url: string }[];
  moved: { url: string; to: string | null }[];
  views: { recent: number; before: number };
}

interface Envelope<T> {
  data: T;
}

/**
 * Plan > Needs a refresh (G7f): the published posts most in need of a refresh, ranked by figures that changed, links
 * that are dead or moved, and views that fell over 8 weeks. Nothing here ran AI: the links are checked once a week and
 * the ranking is a sum anyone can read. Opening a post is where a refresh is drafted, on request.
 */
export function RefreshQueueView({ postHref }: { postHref: (uuid: string) => string }): React.JSX.Element {
  const { request, onError, Link } = useGrowth();
  const [items, setItems] = useState<RefreshQueueItem[] | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ items: RefreshQueueItem[] }>>('GET', 'plan/refresh-queue')
      .then((res) => {
        if (live) setItems(res.data.items);
      })
      .catch((error: unknown) => {
        onError(error);
        if (live) setItems([]);
      });

    return () => {
      live = false;
    };
  }, [request, onError]);

  if (items === null) return <p className="gr-hint">Reading your published posts…</p>;

  if (items.length === 0) {
    return (
      <div className="gr-card">
        <p style={{ margin: 0 }}>Nothing needs a refresh. Every published post has current figures, working links and steady views.</p>
        <p className="gr-hint" style={{ margin: '6px 0 0' }}>Links are checked once a week; figures are checked every day.</p>
      </div>
    );
  }

  return (
    <div className="gr-stack">
      <p className="gr-hint" style={{ margin: 0 }}>
        Most in need first. Figures that changed count most, then dead links, falling views and moved links. Links are checked once a week.
      </p>
      <ol className="gr-stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.uuid} className="gr-card" style={{ display: 'grid', gap: 6 }}>
            <Link href={postHref(item.uuid)} className="gr-table-link">{item.title}</Link>
            <span style={{ fontSize: 13 }}>{item.reasons.join(', ')}</span>
            {item.facts ? <span className="gr-hint">{item.facts}</span> : null}
            {item.dead.length > 0 ? (
              <details>
                <summary className="gr-hint" style={{ cursor: 'pointer' }}>Dead links</summary>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {item.dead.map((l) => <li key={l.url} style={{ wordBreak: 'break-all', fontSize: 12.5 }}>{l.url}</li>)}
                </ul>
              </details>
            ) : null}
            {item.moved.length > 0 ? (
              <details>
                <summary className="gr-hint" style={{ cursor: 'pointer' }}>Moved links</summary>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {item.moved.map((l) => (
                    <li key={l.url} style={{ wordBreak: 'break-all', fontSize: 12.5 }}>
                      {l.url}
                      {l.to ? <> now at {l.to}</> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
