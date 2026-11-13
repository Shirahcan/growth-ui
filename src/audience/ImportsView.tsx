import { useEffect, useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { dayLabel } from '../plan/dates';
import { unwrap, type Envelope } from '../plan/types';
import { Button, Card, Dialog, Empty, Kebab, LoadError, Loading, Pill, copyText } from '../ui/primitives';

/**
 * Growth > Audience > Imported lists (G4e4b3): every uploaded list, what happened to its rows, and Stop.
 * `newImport` is the host's way into its import wizard (the steps from `importSteps()` in its own shell).
 */
export interface ImportBatch {
  uuid: string;
  label: string;
  consent_mode: 'repermission' | 'express_written';
  status: 'draft' | 'sending' | 'done' | 'stopped';
  row_count: number;
  imported_count: number;
  skipped: { existing: number; suppressed: number; duplicates: number; no_consent: number };
  confirmed_count: number;
  purged_count: number;
  /** When the first ask email went out; null until the service's sender has really sent one. */
  first_sent_at: string | null;
  created_at: string | null;
}

const STATUS_WORDS: Record<ImportBatch['status'], string> = { draft: 'Not started', sending: 'Asking', done: 'Everyone asked', stopped: 'Stopped' };

/**
 * A started list is "Asking" only once an ask email has really gone out. Until the service's sender sends
 * the first one (`first_sent_at`), the list is started but nobody has been asked, and saying "Asking" would
 * tell the admin their old clients have been written to when they have not.
 */
function statusWords(b: ImportBatch): string {
  return b.status === 'sending' && !b.first_sent_at ? 'Not asked yet' : STATUS_WORDS[b.status];
}

export function ImportsView({ newImport }: { newImport?: ReactNode }) {
  const { request, notify, onError, canEdit } = useGrowth();
  const [items, setItems] = useState<ImportBatch[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [stopping, setStopping] = useState<ImportBatch | null>(null);

  useEffect(() => {
    let live = true;
    request<Envelope<{ imports: ImportBatch[] }>>('GET', 'audience/imports')
      .then((res) => {
        if (!live) return;
        setItems(unwrap(res).imports);
        setFailed(null);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(e instanceof Error ? e.message : 'The imported lists could not be loaded.');
        onError(e);
      });

    return () => {
      live = false;
    };
  }, [request, onError, reloadKey]);

  async function stop(b: ImportBatch) {
    try {
      await request('POST', `audience/imports/${b.uuid}/stop`, {});
      notify('List stopped. Nobody else on it will be asked.');
      setStopping(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      onError(e);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) notify('Reference copied.');
    else onError(new Error('Copying was blocked by the browser. Select the reference and copy it instead.'));
  }

  return (
    <Card>
      <div className="gr-stack">
        <div className="gr-row-between">
          <div>
            <h2 className="gr-section-title">Imported lists</h2>
            <p className="gr-hint">Old contact lists brought in to be asked again. Only people you may legally ask are kept.</p>
          </div>
          {canEdit ? newImport ?? null : null}
        </div>

        {failed ? (
          <LoadError message={failed} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : items === null ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>No lists imported yet. Bring in past clients or enquiries, and we ask each person before they hear from you.</Empty>
        ) : (
          <ul className="gr-list">
            {items.map((b) => (
              <li key={b.uuid} className="gr-list-row">
                <div className="gr-grow">
                  <p className="gr-row-title">{b.label}</p>
                  <div className="gr-pills">
                    <Pill tone={b.status === 'sending' ? 'accent' : b.status === 'stopped' ? 'bad' : 'muted'}>{statusWords(b)}</Pill>
                    <span className="gr-hint">
                      {b.imported_count} of {b.row_count} kept, {b.confirmed_count} said yes{b.purged_count > 0 ? `, ${b.purged_count} deleted after no answer` : ''}
                      {b.created_at ? `. Imported ${dayLabel(b.created_at)}` : ''}
                    </span>
                  </div>
                </div>
                <Kebab
                  label={`Actions for ${b.label}`}
                  items={[
                    { label: 'Copy reference', onSelect: () => copy(b.uuid) },
                    { label: 'Stop asking', danger: true, hidden: !canEdit || b.status === 'stopped' || b.status === 'done', onSelect: () => setStopping(b) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {stopping ? (
        <Dialog
          title={`Stop asking "${stopping.label}"?`}
          description="Nobody else on this list is asked. People who already said yes stay subscribed; people still waiting are deleted after your waiting period."
          onClose={() => setStopping(null)}
          footer={
            <>
              <Button onClick={() => setStopping(null)}>Keep asking</Button>
              <Button tone="danger" onClick={() => stop(stopping)}>Stop asking</Button>
            </>
          }
        >
          <p className="gr-hint">{stopping.imported_count - stopping.confirmed_count} people on it have not answered yet.</p>
        </Dialog>
      ) : null}
    </Card>
  );
}
