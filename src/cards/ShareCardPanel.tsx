import React, { useCallback, useEffect, useState } from 'react';

import { useGrowth } from '../GrowthProvider';

/** growth-service `GET cards/{kind}/{uuid}` (G7e4): the card as the admin sees it, with the reason in plain words. */
export interface ShareCardState {
  enabled: boolean;
  status: 'off' | 'unpublished' | 'none' | 'rendered' | 'pending' | 'failed' | 'refused' | string;
  url: string | null;
  alt: string | null;
  reason: string | null;
}

interface Envelope<T> {
  data: T;
  message?: string;
}

/**
 * The share card growth-service drew for a published post or landing page (G7e4): the picture a shared link shows,
 * why it is missing when it is, and "Draw it again", which queues the drawing (the card is never drawn inside the
 * request). The card is made from the title, the description, the picture and the brand kit, so changing any of those
 * and publishing again redraws it on its own.
 */
export function ShareCardPanel({ kind, uuid }: { kind: 'post' | 'landing'; uuid: string }): React.JSX.Element | null {
  const { request, onError, notify, canEdit } = useGrowth();
  const [card, setCard] = useState<ShareCardState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (): Promise<ShareCardState | null> => {
    try {
      const res = await request<Envelope<{ card: ShareCardState }>>('GET', `cards/${kind}/${uuid}`);

      return res.data.card;
    } catch (error) {
      onError(error);

      return null;
    }
  }, [request, onError, kind, uuid]);

  useEffect(() => {
    let live = true;
    void load().then((next) => {
      if (live) setCard(next);
    });

    return () => {
      live = false;
    };
  }, [load]);

  const redraw = async () => {
    setBusy(true);
    try {
      const res = await request<Envelope<{ card: ShareCardState }>>('POST', `cards/${kind}/${uuid}/redraw`, {});
      setCard({ ...res.data.card, status: 'pending', reason: 'The card is being drawn. It is usually ready within a few minutes.' });
      notify(res.message ?? 'Drawing the card.');
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };

  if (card === null) return null;

  const canRedraw = canEdit && card.enabled && card.status !== 'unpublished' && card.status !== 'pending';

  return (
    <section className="gr-stack" aria-label="Share card" style={{ gap: 8 }}>
      <b style={{ fontSize: 13.5 }}>Share card</b>
      {card.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a package, not a Next app: the stored card, exactly as shared.
        <img src={card.url} alt={card.alt ?? ''} style={{ display: 'block', width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', borderRadius: 8, border: '1px solid #E4E4EF' }} />
      ) : null}
      <p className="gr-hint" style={{ margin: 0 }}>
        {card.reason ?? 'This is the picture a shared link shows. It is drawn again by itself when you change the title, description or picture and publish.'}
      </p>
      {canRedraw ? (
        <div>
          <button type="button" className="gr-button" disabled={busy} onClick={() => void redraw()} style={{ whiteSpace: 'nowrap', outline: 'none' }}>
            {busy ? 'Asking…' : 'Draw it again'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
