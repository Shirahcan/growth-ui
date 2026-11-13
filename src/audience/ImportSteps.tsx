import { useState, type ReactNode } from 'react';
import { useGrowth } from '../GrowthProvider';
import { Button, ChoiceGroup, Field, INPUT, Notice, Pill } from '../ui/primitives';
import type { ImportFlow } from './useImportFlow';

/**
 * The import's steps (G4e4b3), for the HOST's wizard shell: `importSteps(flow)` returns one entry per
 * decision, `{ id, title, validate, render }`; the host adds its icons and draws them in its own shell.
 * Every step says what it decides, the consequence, a worked example and the way out (the wizard standard).
 *
 * `uploadProof` is the host's: written-consent proof is a file the PRODUCT keeps; it returns a reference
 * the service stores. Without it, the written-consent choice explains why it is unavailable.
 */
export interface ImportStep {
  id: 'file' | 'columns' | 'consent' | 'preview' | 'start';
  title: string;
  validate: () => string | null;
  render: () => ReactNode;
}

export interface ImportStepsOptions {
  uploadProof?: (file: File) => Promise<string>;
}

function Lead({ decides, children }: { decides: string; children?: ReactNode }) {
  return (
    <div className="gr-stack">
      <p className="gr-row-title">{decides}</p>
      {children}
    </div>
  );
}

function FileStep({ flow }: { flow: ImportFlow }) {
  return (
    <div className="gr-stack">
      <Lead decides="Which list you are bringing in.">
        <p className="gr-hint">The file stays on this computer. Only the columns you choose next are sent, and only people you may legally ask are kept.</p>
        <p className="gr-hint">Example: clients_2024.csv with the columns Email, Name, Type, Date.</p>
      </Lead>
      <Field label="CSV file" error={flow.fileError}>
        {(id) => <input id={id} type="file" accept=".csv,text/csv" className={INPUT} onChange={(e) => e.target.files?.[0] && flow.loadFile(e.target.files[0])} />}
      </Field>
      {flow.csv ? <Notice>{flow.fileName}: {flow.csv.rows.length.toLocaleString()} rows, columns {flow.csv.header.join(', ')}.</Notice> : null}
      <Field label="Name this list" hint="Campaigns can target it by this name. You can rename it later.">
        {(id) => <input id={id} className={INPUT} maxLength={120} value={flow.label} onChange={(e) => flow.setLabel(e.target.value)} />}
      </Field>
      <p className="gr-hint">Picked the wrong file? Choose another one; nothing is sent until the last step.</p>
    </div>
  );
}

function ColumnsStep({ flow }: { flow: ImportFlow }) {
  const { words } = useGrowth();
  const header = flow.csv?.header ?? [];
  const sample = flow.csv?.rows[0] ?? [];
  const pick = (labelText: string, key: 'email' | 'name' | 'type' | 'date' | 'audience', hint: string) => (
    <Field label={labelText} hint={hint}>
      {(id) => (
        <select id={id} className={INPUT} value={flow.mapping[key]} onChange={(e) => flow.setMapping({ [key]: e.target.value })}>
          <option value="">{key === 'email' ? 'Choose a column' : 'Not in this file'}</option>
          {header.map((h, i) => (
            <option key={h} value={h}>
              {h}
              {sample[i] ? ` (e.g. ${sample[i]})` : ''}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <div className="gr-stack">
      <Lead decides="Which column holds what.">
        <p className="gr-hint">Without a reason for contact and a date, nobody can be asked: the law only lets you write to people who bought from you or asked you something recently, or who said yes.</p>
      </Lead>
      {pick('Email address', 'email', 'Required.')}
      {pick('Reason for contact', 'type', 'Example: "client", "paid", "enquiry", "lead".')}
      {pick('Date of that purchase or enquiry', 'date', 'Example: 2025-06-01.')}
      {pick('Name', 'name', 'Optional.')}
      {pick('Who they are', 'audience', 'Optional. Example: a column saying "study" or "work".')}
      {flow.audienceValues.length > 0 && Object.keys(words.audiences).length > 0 ? (
        <div className="gr-settings-block gr-stack">
          <p className="gr-hint">Match each value in that column to one of your audiences. Leave one unmatched to file those people under none.</p>
          {flow.audienceValues.map((v) => (
            <Field key={v} label={`"${v}" means`}>
              {(id) => (
                <select id={id} className={INPUT} value={flow.mapping.audienceMap[v] ?? ''} onChange={(e) => flow.setMapping({ audienceMap: { ...flow.mapping.audienceMap, [v]: e.target.value } })}>
                  <option value="">No audience</option>
                  {Object.entries(words.audiences).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}
            </Field>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConsentStep({ flow, uploadProof }: { flow: ImportFlow } & ImportStepsOptions) {
  const { onError } = useGrowth();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!uploadProof) return;
    setUploading(true);
    try {
      flow.setProofRef(await uploadProof(file));
    } catch (e) {
      onError(e);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="gr-stack">
      <Lead decides="Why you may write to these people.">
        <p className="gr-hint">
          If they bought from you or asked you something, we ask them first (&quot;still want to hear from us?&quot;) and only keep the ones who are still inside the legal window. If they said yes in writing, keep the proof.
        </p>
        <p className="gr-hint">Example: a client who paid on 2025-06-01 may be asked until 2027-06-01 (two years); an enquiry from 2026-01-01 could be asked until 2026-07-01 (six months).</p>
      </Lead>
      <ChoiceGroup
        label="Why you may write to them"
        value={flow.mode}
        onChange={flow.setMode}
        options={[
          { value: 'repermission', label: 'They bought or asked: ask them first' },
          { value: 'express_written', label: 'They said yes in writing' },
        ]}
      />
      {flow.mode === 'express_written' ? (
        uploadProof ? (
          <Field label="Proof of their written yes" hint="A signed form or an export from the tool that collected it. Kept with the product, linked to this list.">
            {(id) => <input id={id} type="file" className={INPUT} disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />}
          </Field>
        ) : (
          <p className="gr-warning">This product does not take a proof upload yet, so a written-consent list cannot be imported here. Choose the first option instead.</p>
        )
      ) : null}
      {flow.proofRef ? <Notice>Proof attached.</Notice> : null}
      <p className="gr-hint">Not sure? Choose &quot;ask them first&quot;: it is always allowed and nobody is emailed without their answer.</p>
    </div>
  );
}

const OUTCOME_WORDS: Array<[keyof NonNullable<ImportFlow['preview']>['counts'], string]> = [
  ['can_ask', 'Can be asked'],
  ['already_subscribed', 'Already on your list'],
  ['suppressed', 'Unsubscribed or blocked before'],
  ['duplicates', 'Listed twice'],
  ['invalid_email', 'Not a valid email address'],
  ['no_consent', 'No reason we may write to them'],
];

function PreviewStep({ flow }: { flow: ImportFlow }) {
  return (
    <div className="gr-stack">
      <Lead decides="Who on this list may be asked.">
        <p className="gr-hint">Only the people under &quot;Can be asked&quot; are kept. Everyone else is counted here and forgotten: we do not store details of people we may not contact.</p>
      </Lead>
      <Button tone="primary" disabled={flow.previewing} onClick={flow.runPreview}>{flow.previewing ? 'Checking…' : flow.preview ? 'Check again' : 'Check the list'}</Button>
      {flow.preview ? (
        <>
          <ul className="gr-list">
            {OUTCOME_WORDS.map(([key, words]) => (
              <li key={key} className="gr-list-row">
                <span className="gr-grow">{words}</span>
                <Pill tone={key === 'can_ask' ? 'good' : 'muted'}>{flow.preview?.counts[key] ?? 0}</Pill>
              </li>
            ))}
          </ul>
          {Object.keys(flow.preview.reasons).length > 0 ? (
            <p className="gr-hint">Why some have no reason: {Object.entries(flow.preview.reasons).map(([r, n]) => `${r} (${n})`).join(', ')}.</p>
          ) : null}
        </>
      ) : null}
      <p className="gr-hint">Numbers look wrong? Go back and check the columns: a missing date is the usual cause.</p>
    </div>
  );
}

function StartStep({ flow }: { flow: ImportFlow }) {
  const can = flow.preview?.counts.can_ask ?? 0;

  if (flow.started) {
    return (
      <div className="gr-stack" role="status">
        <p className="gr-row-title">{flow.started.imported.toLocaleString()} people are waiting to be asked.</p>
        <p className="gr-hint">Nobody on this list is emailed until they are asked and say yes. People who never answer are deleted after your settings&apos; waiting period.</p>
      </div>
    );
  }

  return (
    <div className="gr-stack">
      <Lead decides="Start the list.">
        <p className="gr-hint">
          {can.toLocaleString()} people are kept as &quot;waiting to be asked&quot; on the list &quot;{flow.label || 'Imported list'}&quot;. No campaign reaches them until they say yes. You can stop the list later; people already asked keep their answer.
        </p>
      </Lead>
      {flow.progress ? <Notice>Sent {flow.progress.sent.toLocaleString()} of {flow.progress.total.toLocaleString()} rows.</Notice> : null}
      <Button tone="primary" disabled={can === 0 || flow.sending} onClick={flow.start}>
        {flow.sending ? 'Sending rows…' : `Start asking ${can.toLocaleString()} ${can === 1 ? 'person' : 'people'}`}
      </Button>
      <p className="gr-hint">If sending stops part way, press the button again: it carries on where it stopped.</p>
    </div>
  );
}

export function importSteps(flow: ImportFlow, options: ImportStepsOptions = {}): ImportStep[] {
  return [
    { id: 'file', title: 'Choose the list', validate: () => (flow.csv ? null : 'Choose a CSV file first.'), render: () => <FileStep flow={flow} /> },
    { id: 'columns', title: 'Match the columns', validate: () => (flow.mapping.email ? null : 'Choose the column that holds the email address.'), render: () => <ColumnsStep flow={flow} /> },
    {
      id: 'consent',
      title: 'Say why you may write',
      validate: () => (flow.mode === null ? 'Choose why you may write to them.' : flow.mode === 'express_written' && flow.proofRef === null ? 'Attach the proof of their written yes.' : null),
      render: () => <ConsentStep flow={flow} uploadProof={options.uploadProof} />,
    },
    {
      id: 'preview',
      title: 'Check who can be asked',
      validate: () => (flow.preview === null ? 'Check the list first.' : flow.preview.counts.can_ask === 0 ? 'Nobody on this list can be asked, so there is nothing to start.' : null),
      render: () => <PreviewStep flow={flow} />,
    },
    { id: 'start', title: 'Start the list', validate: () => null, render: () => <StartStep flow={flow} /> },
  ];
}
