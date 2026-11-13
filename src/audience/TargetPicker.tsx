import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { ChoiceGroup, Field, INPUT, Pill } from '../ui/primitives';
import type { MailingList } from './ListsView';

/**
 * Who a campaign or a saved audience reaches (G4d2's `target`, G4e4b2): the product's own groups and named
 * people, lists, and what subscribers said about themselves. Picks to send to are OR-ed; picks to leave out
 * always subtract. Reach is counted live by the service, with who is left out and why. Each pick keeps
 * its `label` (the service stores it for the pill, and never matches on it).
 *
 * ⚠ UNKNOWN IS NOT ZERO: when the product's groups cannot be read, the picker says so in the product's own
 * words instead of showing 0 people.
 */
export type Pick =
  | { type: 'segment'; segment: string; label?: string }
  | { type: 'user'; user_type: string; user_id: string; label?: string }
  | { type: 'list'; list: string; label?: string }
  | { type: 'audience'; audience: string; label?: string }
  | { type: 'topic'; topic: string; label?: string };

export interface Target {
  mode: 'all' | 'specific';
  include: Pick[];
  exclude: Pick[];
}

interface Group { key: string; label: string; kind: string; count: number }
interface Found { user_type: string; user_id: string; name: string; email_masked: string | null }
interface Estimate { reach: number; left_out: Array<{ reason: string; label: string; count: number }> }

const same = (a: Pick, b: Pick) => JSON.stringify({ ...a, label: undefined }) === JSON.stringify({ ...b, label: undefined });

export function TargetPicker({ value, onChange }: { value: Target; onChange: (t: Target) => void }) {
  const { request, words } = useGrowth();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [groupsDown, setGroupsDown] = useState<string | null>(null);
  const [lists, setLists] = useState<MailingList[]>([]);
  const [side, setSide] = useState<'include' | 'exclude'>('include');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateDown, setEstimateDown] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ groups: Group[] }>>('GET', 'audience/platform-groups')
      .then((res) => live && setGroups(unwrap(res).groups))
      .catch((e) => live && setGroupsDown(e instanceof Error ? e.message : `${words.product}'s groups could not be read just now.`));
    request<Envelope<{ lists: MailingList[] }>>('GET', 'audience/lists')
      .then((res) => live && setLists(unwrap(res).lists))
      .catch(() => live && setLists([]));

    return () => {
      live = false;
    };
  }, [request, words.product]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      request<Envelope<{ people: Found[] }>>('GET', `audience/people?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then((res) => live && setFound(unwrap(res).people))
        .catch(() => live && setFound([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [request, q]);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      request<Envelope<Estimate>>('POST', 'audience/estimate', { definition: { target: value } })
        .then((res) => {
          if (!live) return;
          setEstimate(unwrap(res));
          setEstimateDown(null);
        })
        .catch((e) => live && setEstimateDown(e instanceof Error ? e.message : 'The reach could not be counted just now.'));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [request, value]);

  const has = (p: Pick) => value[side].some((x) => same(x, p));
  const toggle = (p: Pick) => onChange({ ...value, mode: side === 'include' ? 'specific' : value.mode, [side]: has(p) ? value[side].filter((x) => !same(x, p)) : [...value[side], p] });
  const remove = (s: 'include' | 'exclude', p: Pick) => onChange({ ...value, [s]: value[s].filter((x) => !same(x, p)) });
  const pill = (p: Pick) => p.label ?? ('segment' in p ? p.segment : 'list' in p ? p.list : 'audience' in p ? p.audience : 'topic' in p ? p.topic : p.user_id);

  return (
    <div className="gr-stack">
      <ChoiceGroup<'all' | 'specific'>
        label="Who this reaches"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        options={[{ value: 'all', label: 'Everyone subscribed' }, { value: 'specific', label: 'Only the people I pick' }]}
      />

      {(['include', 'exclude'] as const).map((s) =>
        value[s].length > 0 ? (
          <div key={s}>
            <p className="gr-label">{s === 'include' ? 'Send to' : 'Leave out'}</p>
            <div className="gr-pills">
              {value[s].map((p) => (
                <span key={JSON.stringify(p)} className={`gr-pill gr-pill-${s === 'include' ? 'accent' : 'bad'}`}>
                  {pill(p)}
                  <button type="button" className="gr-pill-remove" aria-label={`Remove ${pill(p)}`} onClick={() => remove(s, p)}>×</button>
                </span>
              ))}
            </div>
          </div>
        ) : null,
      )}

      <ChoiceGroup<'include' | 'exclude'> label="What a pick does" value={side} onChange={setSide} options={[{ value: 'include', label: 'Picks add people' }, { value: 'exclude', label: 'Picks leave people out' }]} />

      <div>
        <p className="gr-label">{words.product}&apos;s groups</p>
        {groupsDown ? <p className="gr-warning">{groupsDown} Lists and who people said they are still work.</p> : null}
        <div className="gr-pills">
          {(groups ?? []).map((g) => {
            const p: Pick = { type: 'segment', segment: g.key, label: g.label };
            return (
              <button key={g.key} type="button" aria-pressed={has(p)} className={`gr-choice${has(p) ? ' gr-choice-on' : ''}`} onClick={() => toggle(p)}>
                {g.label} ({g.count})
              </button>
            );
          })}
        </div>
      </div>

      {lists.length > 0 ? (
        <div>
          <p className="gr-label">Lists</p>
          <div className="gr-pills">
            {lists.map((l) => {
              const p: Pick = { type: 'list', list: l.uuid, label: l.name };
              return <button key={l.uuid} type="button" aria-pressed={has(p)} className={`gr-choice${has(p) ? ' gr-choice-on' : ''}`} onClick={() => toggle(p)}>{l.name}</button>;
            })}
          </div>
        </div>
      ) : null}

      {Object.keys(words.audiences).length > 0 ? (
        <div>
          <p className="gr-label">Who they said they are</p>
          <div className="gr-pills">
            {Object.entries(words.audiences).map(([key, label]) => {
              const p: Pick = { type: 'audience', audience: key, label };
              return <button key={key} type="button" aria-pressed={has(p)} className={`gr-choice${has(p) ? ' gr-choice-on' : ''}`} onClick={() => toggle(p)}>{label}</button>;
            })}
          </div>
        </div>
      ) : null}

      <Field label="Find someone by name or email" hint="Only people on the product who have subscribed are reached by a newsletter.">
        {(id) => <input id={id} className={INPUT} value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setFound([]); }} placeholder="At least 2 letters" />}
      </Field>
      {found.length > 0 ? (
        <div className="gr-pills">
          {found.map((f) => {
            const p: Pick = { type: 'user', user_type: f.user_type, user_id: f.user_id, label: f.name };
            return <button key={`${f.user_type}:${f.user_id}`} type="button" aria-pressed={has(p)} className={`gr-choice${has(p) ? ' gr-choice-on' : ''}`} onClick={() => toggle(p)}>{f.name}{f.email_masked ? ` (${f.email_masked})` : ''}</button>;
          })}
        </div>
      ) : null}

      <div className="gr-settings-block" role="status">
        {estimateDown ? (
          <p className="gr-warning">Reach unknown: {estimateDown}</p>
        ) : estimate === null ? (
          <p className="gr-hint">Counting…</p>
        ) : (
          <>
            <p className="gr-row-title">Reaches {estimate.reach} {estimate.reach === 1 ? 'person' : 'people'} today</p>
            {estimate.left_out.length > 0 ? (
              <ul className="gr-list">
                {estimate.left_out.map((o) => (
                  <li key={o.reason} className="gr-hint">
                    <Pill>{o.count}</Pill> {o.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
