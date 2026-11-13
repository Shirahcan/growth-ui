import { useEffect, useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { dayLabel, momentLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Dialog, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';
import type { PersonSheet as Sheet } from './types';

/**
 * One person, centred on WHY we may write to them: the dated consent trail (G4e4b1). The same trail is the
 * "consent receipt" an admin hands over for an access request (Law 25, PIPEDA), copied as plain text.
 *
 * `extras` is the host's slot for facts only the product knows (an account, enquiries, opens): they come
 * from the product's own API and never pass through growth-service.
 */
export interface PersonSheetProps {
  uuid: string;
  onClose: () => void;
  /** Called after "Stop emailing" so the list can refresh. */
  onChanged?: () => void;
  extras?: (person: Sheet) => ReactNode;
}

const STATUS_WORDS: Record<string, string> = { pending: 'Waiting to confirm', subscribed: 'Subscribed', unsubscribed: 'Unsubscribed' };

export function receiptText(p: Sheet, productName: string): string {
  const lines = [
    `Consent record for ${p.email} (${productName})`,
    `Status: ${STATUS_WORDS[p.status] ?? p.status}`,
    `Basis: ${p.consent.basis_words}${p.consent.expires_at ? `, until ${dayLabel(p.consent.expires_at)}` : ''}`,
    p.consent.import_list
      ? `Came from the imported list: ${p.consent.import_list}`
      : `First recorded at: ${p.consent.where ?? 'not recorded'}${p.consent.ip_recorded ? ' (IP address kept as evidence)' : ''}`,
    p.blocked ? `Blocked from email: ${p.blocked}` : 'Not blocked from email',
    '',
    'History, newest first:',
    ...p.trail.flatMap((t) => [`- ${t.at ? momentLabel(t.at) : 'Date not recorded'}: ${t.what}`, ...evidenceLines(t)]),
  ];

  return lines.join('\n');
}

/** What a record kept as proof, one indented line each; nothing when the read carried no evidence. */
function evidenceLines(t: Sheet['trail'][number]): string[] {
  const e = t.evidence;
  if (!e) return [];

  return [
    e.ip ? `    IP address: ${e.ip}` : null,
    e.user_agent ? `    Browser: ${e.user_agent}` : null,
    e.wording_version ? `    Wording shown: ${e.wording_version}` : null,
  ].filter((l): l is string => l !== null);
}

/**
 * The receipt as a file name a person can tell apart in a folder: whose, and the day it was made, in THEIR
 * calendar. (`toISOString` gave the UTC day: just after midnight in Lagos a receipt made on the 14th was
 * named the 13th.)
 */
export function receiptFileName(email: string, today: Date = new Date()): string {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return `consent-receipt-${email.replace(/[^a-z0-9@._-]+/gi, '_')}-${day}.txt`;
}

export function PersonSheet({ uuid, onClose, onChanged, extras }: PersonSheetProps) {
  const { request, notify, onError, canEdit, words } = useGrowth();
  const [person, setPerson] = useState<Sheet | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    request<Envelope<{ person: Sheet }>>('GET', `audience/subscribers/${uuid}`)
      .then((res) => live && setPerson(unwrap(res).person))
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'This person could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, uuid, reloadKey]);

  /** The receipt read: the same person plus what each record kept as proof (IP, browser, wording shown). */
  async function receipt(): Promise<string | null> {
    try {
      const full = unwrap(await request<Envelope<{ person: Sheet }>>('GET', `audience/subscribers/${uuid}?with=evidence`)).person;
      return receiptText(full, productName);
    } catch (e) {
      onError(e);
      return null;
    }
  }

  async function downloadReceipt(email: string) {
    const text = await receipt();
    if (text === null) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = receiptFileName(email);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify('Consent receipt downloaded.');
  }

  async function copyReceipt() {
    const text = await receipt();
    if (text !== null) await copy(text, 'Consent receipt copied.');
  }

  async function copy(text: string, done: string) {
    if (await copyText(text)) notify(done);
    else onError(new Error('Copying was blocked by the browser. Select the text and copy it instead.'));
  }

  async function stopEmailing() {
    setStopping(true);
    try {
      await request('POST', `audience/subscribers/${uuid}/suppress`, {});
      notify('This person will not be emailed.');
      setConfirming(false);
      setReloadKey((k) => k + 1);
      onChanged?.();
    } catch (e) {
      onError(e);
    } finally {
      setStopping(false);
    }
  }

  const productName = words.product;

  return (
    <Dialog
      title={person?.email ?? 'Person'}
      description="Why we may write to this person, and everything that changed it."
      onClose={onClose}
      wide
      footer={
        <div className="gr-row-between gr-grow">
          {person ? (
            <Kebab
              label={`Actions for ${person.email}`}
              items={[
                { label: 'Copy address', onSelect: () => copy(person.email, 'Address copied.') },
                { label: 'Copy consent receipt', onSelect: () => void copyReceipt() },
                { label: 'Download consent receipt', onSelect: () => void downloadReceipt(person.email) },
                { label: 'Stop emailing', danger: true, hidden: !canEdit || person.status === 'unsubscribed', onSelect: () => setConfirming(true) },
              ]}
            />
          ) : (
            <span />
          )}
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      {failed ? (
        <LoadError message={failed} onRetry={() => { setFailed(null); setReloadKey((k) => k + 1); }} />
      ) : person === null ? (
        <Loading />
      ) : (
        <div className="gr-stack">
          <div className="gr-pills">
            <Pill tone={person.status === 'subscribed' ? 'good' : person.status === 'pending' ? 'accent' : 'muted'}>{STATUS_WORDS[person.status] ?? person.status}</Pill>
            {person.blocked ? <Pill tone="bad">Blocked: {person.blocked}</Pill> : null}
            {!person.consent.current && person.status !== 'unsubscribed' ? <Pill tone="bad">No current consent</Pill> : null}
          </div>

          <div className="gr-settings-block">
            <p className="gr-row-title">{person.consent.basis_words}</p>
            <p className="gr-hint">
              {person.consent.import_list
                ? `Came from the imported list "${person.consent.import_list}".`
                : person.consent.where
                  ? `First recorded at "${person.consent.where}".`
                  : 'Where they signed up was not recorded.'}{' '}
              {person.consent.expires_at ? `This consent runs out on ${dayLabel(person.consent.expires_at)} unless they confirm.` : 'This consent does not run out.'}
            </p>
          </div>

          <ol className="gr-trail" aria-label="Consent history, newest first">
            {person.trail.map((t, i) => (
              <li key={`${t.at}-${i}`} className="gr-trail-entry">
                <span className="gr-trail-when">{t.at ? momentLabel(t.at) : 'Date not recorded'}</span>
                <span className="gr-trail-what">{t.what}</span>
              </li>
            ))}
          </ol>

          {extras ? extras(person) : null}
        </div>
      )}

      {confirming && person ? (
        <Dialog
          title="Stop emailing this person?"
          description={`${person.email} is unsubscribed and blocked here, so no campaign reaches them. They can sign up again themselves; an import cannot add them back.`}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button onClick={() => setConfirming(false)}>Keep them</Button>
              <Button tone="danger" disabled={stopping} onClick={stopEmailing}>
                {stopping ? 'Stopping…' : 'Stop emailing'}
              </Button>
            </>
          }
        >
          <p className="gr-hint">The change also reaches {productName}&apos;s own copy of the list.</p>
        </Dialog>
      ) : null}
    </Dialog>
  );
}
