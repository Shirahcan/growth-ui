import { useEffect, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, Card, Dialog, Field, INPUT, Kebab, Loading, Pill, copyText } from '../ui/primitives';
import { fromNow } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { SourceDialog, fieldError } from './SourceDialog';
import type { RadarCountry, RadarSettings, WatchedSource } from './types';

/**
 * Settings > Growth > Watched sources and "What counts as worth posting about", on growth-service
 * (source: Portify `GrowthWatchedSourcesSection`, G3e5). A moved page or a new provincial stream is an
 * edit, and "Check now" proves the service can read it straight away.
 *
 * `countries` is the host's list for the processing-times scope (its own reference data). Without it,
 * the country picker is not shown.
 */
export interface RadarSettingsViewProps {
  countries?: RadarCountry[];
}

const lastChecked = (s: WatchedSource) => (s.last_checked_at ? `Checked ${fromNow(s.last_checked_at)}` : 'Not checked yet');

export function RadarSettingsView({ countries }: RadarSettingsViewProps) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [sources, setSources] = useState<WatchedSource[] | null>(null);
  const [radar, setRadar] = useState<RadarSettings | null>(null);
  const [draft, setDraft] = useState<RadarSettings | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checking, setChecking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ source: WatchedSource | null } | null>(null);
  const [deleting, setDeleting] = useState<WatchedSource | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      request<Envelope<{ sources: WatchedSource[] }>>('GET', 'watched-sources'),
      request<Envelope<{ radar: RadarSettings }>>('GET', 'settings/radar'),
    ])
      .then(([s, r]) => {
        if (!live) return;
        setSources(unwrap(s).sources);
        setRadar(unwrap(r).radar);
        setDraft(unwrap(r).radar);
      })
      .catch((e) => live && onError(e));

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  async function act(method: 'POST' | 'PUT' | 'DELETE', path: string, body: Record<string, unknown>, done: string) {
    try {
      const res = await request<Envelope<unknown>>(method, path, body);
      notify((res as { message?: string })?.message || done);
      reload();
    } catch (e) {
      onError(e);
    }
  }

  async function check(source: WatchedSource) {
    setChecking(source.id);
    await act('POST', `watched-sources/${source.id}/check`, {}, 'Checked.');
    setChecking(null);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setRefused(null);
    try {
      const res = await request<Envelope<{ radar: RadarSettings }>>('PUT', 'settings/radar', { ...draft });
      setRadar(unwrap(res).radar);
      setDraft(unwrap(res).radar);
      notify('Radar settings saved.');
    } catch (e) {
      const field = fieldError(e);
      if (field) setRefused(field);
      else onError(e);
    } finally {
      setSaving(false);
    }
  }

  const nameOf = (code: string) => countries?.find((c) => c.code === code)?.name ?? code;
  const available = (countries ?? []).filter((c) => !draft?.tracked_countries.includes(c.code));

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Watched sources</h2>
            <p className="gr-hint">The official pages checked for you. When one changes, it appears on the Growth radar so the team can post about it quickly.</p>
          </div>
          {canEdit ? (
            <Button tone="primary" onClick={() => setDialog({ source: null })}>
              Add a source
            </Button>
          ) : null}
        </div>

        {radar && !radar.enabled ? <p className="gr-warning">The updates radar is switched off, so these are not being checked on a schedule.</p> : null}

        {sources === null ? (
          <Loading />
        ) : sources.length === 0 ? (
          <p className="gr-hint">No sources yet. Add the first official page to watch.</p>
        ) : (
          <ul className="gr-list">
            {sources.map((s) => (
              <li key={s.id} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">
                    {s.name} {!s.is_active ? <Pill>Paused</Pill> : null}
                  </p>
                  <p className="gr-hint">
                    {lastChecked(s)}
                    {s.section_heading ? `, watching "${s.section_heading}"` : ''}
                  </p>
                  {s.last_error ? <p className="gr-field-error">{s.last_error}</p> : null}
                </div>
                {checking === s.id ? (
                  <span className="gr-hint">Checking…</span>
                ) : (
                  <Kebab
                    label={`Actions for ${s.name}`}
                    items={[
                      { label: 'Check now', hidden: !canEdit, onSelect: () => void check(s) },
                      { label: 'Copy link', onSelect: () => void copyText(s.public_url).then((ok) => (ok ? notify('Link copied.') : onError(new Error('Could not copy the link to your clipboard.')))) },
                      { label: 'Edit', hidden: !canEdit || s.is_built_in, onSelect: () => setDialog({ source: s }) },
                      { label: s.is_active ? 'Pause' : 'Resume', hidden: !canEdit, onSelect: () => void act('PUT', `watched-sources/${s.id}`, { is_active: !s.is_active }, s.is_active ? 'Paused.' : 'Watching this source again.') },
                      { label: 'Delete', danger: true, hidden: !canEdit || s.is_built_in, onSelect: () => setDeleting(s) },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {draft ? (
          <div className="gr-stack gr-settings-block">
            <h3 className="gr-row-title">What counts as worth posting about</h3>
            <label className="gr-check">
              <input type="checkbox" checked={draft.enabled} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              <span>Check the sources on a schedule</span>
            </label>
            {countries ? (
              <div className="gr-field">
                <span className="gr-label">Countries for processing times</span>
                <p className="gr-hint">The government moves figures for many countries at each update, so only these reach the radar.</p>
                <div className="gr-pills">
                  {draft.tracked_countries.map((code) => (
                    <span key={code} className="gr-pill">
                      {nameOf(code)}
                      {canEdit ? (
                        <button type="button" aria-label={`Remove ${nameOf(code)}`} className="gr-pill-remove" onClick={() => setDraft({ ...draft, tracked_countries: draft.tracked_countries.filter((c) => c !== code) })}>
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {canEdit && available.length > 0 ? (
                    <select
                      aria-label="Add a country"
                      className={INPUT}
                      style={{ width: 'auto' }}
                      value=""
                      onChange={(e) => e.target.value && setDraft({ ...draft, tracked_countries: [...draft.tracked_countries, e.target.value] })}
                    >
                      <option value="">Add a country</option>
                      {available.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                {draft.tracked_countries.length === 0 ? <p className="gr-field-error">With no countries, processing-time changes never reach the radar.</p> : null}
              </div>
            ) : null}
            <div className="gr-grid-3">
              <Field label="A processing time must move by at least (days)">
                {(id) => <input id={id} type="number" min={1} max={365} disabled={!canEdit} className={INPUT} value={draft.min_change_days} onChange={(e) => setDraft({ ...draft, min_change_days: Number(e.target.value) })} />}
              </Field>
              <Field label="Aim to post within (hours)">
                {(id) => <input id={id} type="number" min={1} max={720} disabled={!canEdit} className={INPUT} value={draft.post_within_hours} onChange={(e) => setDraft({ ...draft, post_within_hours: Number(e.target.value) })} />}
              </Field>
              <Field label="Plan content every (days)">
                {(id) => <input id={id} type="number" min={1} max={90} disabled={!canEdit} className={INPUT} value={draft.plan_cadence_days} onChange={(e) => setDraft({ ...draft, plan_cadence_days: Number(e.target.value) })} />}
              </Field>
            </div>
            {refused ? (
              <p role="alert" className="gr-field-error">
                {refused}
              </p>
            ) : null}
            {canEdit ? (
              <div>
                <Button tone="primary" disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save radar settings'}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {dialog ? (
        <SourceDialog
          key={dialog.source?.id ?? 'new'}
          source={dialog.source}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            reload();
          }}
        />
      ) : null}

      {deleting ? (
        <Dialog
          title={`Stop watching ${deleting.name}?`}
          description="It is no longer checked. Anything it already caught stays on the radar."
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                tone="danger"
                onClick={() => {
                  const id = deleting.id;
                  setDeleting(null);
                  void act('DELETE', `watched-sources/${id}`, {}, 'Source removed.');
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="gr-hint">{deleting.public_url}</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
