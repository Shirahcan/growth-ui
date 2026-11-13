import { useCallback, useMemo, useState } from 'react';
import { useGrowth } from '../GrowthProvider';
import { unwrap, type Envelope } from '../plan/types';
import { fieldError } from '../settings/SourceDialog';
import { CsvError, parseCsv, type Csv } from './csv';

/**
 * The import, headless (G4e4b3): every decision and every call, with no layout. growth-ui ships the steps;
 * the HOST renders them inside its own wizard shell (Portify allows exactly one shell, which a shared
 * package cannot import). The file is read in the browser and never uploaded; only mapped rows are sent.
 *
 * Calls (growth-service G4c2): `audience/imports/preview` per chunk (stores nothing, counts summed), then
 * `audience/imports` (open), `imports/{uuid}/rows` per numbered chunk (a retry of a chunk is a no-op, so
 * `start()` can be run again after a failure and resumes), `imports/{uuid}/start`.
 */
export const CHUNK = 5000;

export type ConsentMode = 'repermission' | 'express_written';

export interface Mapping {
  email: string;
  name: string;
  type: string;
  date: string;
  audience: string;
  /** A value in the audience column => one of the product's audiences ("study" => "applicants"). */
  audienceMap: Record<string, string>;
}

export interface Preview {
  counts: Record<'can_ask' | 'already_subscribed' | 'suppressed' | 'duplicates' | 'invalid_email' | 'no_consent', number>;
  reasons: Record<string, number>;
}

export interface ImportFlow {
  fileName: string | null;
  csv: Csv | null;
  fileError: string | null;
  mapping: Mapping;
  mode: ConsentMode | null;
  proofRef: string | null;
  label: string;
  preview: Preview | null;
  previewing: boolean;
  progress: { sent: number; total: number } | null;
  /** Rows are going out now (the start button waits). */
  sending: boolean;
  started: { uuid: string; imported: number } | null;
  /** Why growth-service refused the last check or start, in its own words (a setting not chosen yet, a list
   *  too long). Drawn on the step itself: a host's error surface may stay out of a 422, believing a form shows it. */
  refusal: { step: 'preview' | 'start'; message: string } | null;
  loadFile: (file: File) => Promise<void>;
  setMapping: (m: Partial<Mapping>) => void;
  setMode: (m: ConsentMode) => void;
  setProofRef: (ref: string | null) => void;
  setLabel: (l: string) => void;
  runPreview: () => Promise<void>;
  start: () => Promise<void>;
  /** Distinct values of the chosen audience column (at most 20), for mapping to the product's audiences. */
  audienceValues: string[];
}

/** The file as text: `File.text()` where the browser has it, else a FileReader (older browsers, jsdom). */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

const EMPTY_MAPPING: Mapping = { email: '', name: '', type: '', date: '', audience: '', audienceMap: {} };

/** A best guess from the header, so the common file needs no mapping at all. */
function guess(header: string[]): Mapping {
  const find = (...words: string[]) => header.find((h) => words.some((w) => h.toLowerCase().includes(w))) ?? '';

  return { ...EMPTY_MAPPING, email: find('mail'), name: find('name'), type: find('type', 'reason', 'relationship'), date: find('date', 'when', 'last'), audience: find('interest', 'audience', 'segment') };
}

export function useImportFlow(): ImportFlow {
  const { request, onError } = useGrowth();
  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState<Csv | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMappingState] = useState<Mapping>(EMPTY_MAPPING);
  const [mode, setMode] = useState<ConsentMode | null>(null);
  const [proofRef, setProofRef] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [batch, setBatch] = useState<{ uuid: string; nextChunk: number } | null>(null);
  const [started, setStarted] = useState<{ uuid: string; imported: number } | null>(null);
  const [refusal, setRefusal] = useState<ImportFlow['refusal']>(null);

  /** A refusal is said on the step; anything else goes to the host's error surface. */
  const fail = useCallback((step: 'preview' | 'start', e: unknown) => {
    const message = fieldError(e);
    if (message) setRefusal({ step, message });
    else onError(e);
  }, [onError]);

  const loadFile = useCallback(async (file: File) => {
    setFileError(null);
    setRefusal(null);
    setPreview(null);
    setBatch(null);
    try {
      const parsed = parseCsv(await readText(file));
      setCsv(parsed);
      setFileName(file.name);
      setMappingState(guess(parsed.header));
      setLabel((l) => l || file.name.replace(/\.[^.]+$/, ''));
    } catch (e) {
      setCsv(null);
      setFileError(e instanceof CsvError ? e.message : 'This file could not be read. Save it as CSV and try again.');
    }
  }, []);

  const setMapping = useCallback((m: Partial<Mapping>) => {
    setMappingState((cur) => ({ ...cur, ...m }));
    setPreview(null);
    setRefusal(null);
  }, []);

  const rows = useMemo(() => {
    if (!csv) return [];
    const col = (name: string) => (name === '' ? -1 : csv.header.indexOf(name));
    const [e, n, t, d, a] = [col(mapping.email), col(mapping.name), col(mapping.type), col(mapping.date), col(mapping.audience)];

    return csv.rows.map((r) => ({
      email: e >= 0 ? r[e] : '',
      name: n >= 0 ? r[n] || null : null,
      type: t >= 0 ? r[t] || null : null,
      date: d >= 0 ? r[d] || null : null,
      audience: a >= 0 ? mapping.audienceMap[r[a] ?? ''] ?? null : null,
    }));
  }, [csv, mapping]);

  const audienceValues = useMemo(() => {
    if (!csv || mapping.audience === '') return [];
    const i = csv.header.indexOf(mapping.audience);

    return [...new Set(csv.rows.map((r) => r[i] ?? '').filter((v) => v !== ''))].slice(0, 20);
  }, [csv, mapping.audience]);

  const chunks = useMemo(() => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK)), [rows]);

  const runPreview = useCallback(async () => {
    if (!mode) return;
    setPreviewing(true);
    setRefusal(null);
    try {
      const sum: Preview = { counts: { can_ask: 0, already_subscribed: 0, suppressed: 0, duplicates: 0, invalid_email: 0, no_consent: 0 }, reasons: {} };
      for (const part of chunks) {
        const p = unwrap(await request<Envelope<Preview>>('POST', 'audience/imports/preview', { rows: part, consent_mode: mode, has_proof: proofRef !== null }));
        (Object.keys(sum.counts) as Array<keyof Preview['counts']>).forEach((k) => (sum.counts[k] += p.counts[k] ?? 0));
        Object.entries(p.reasons).forEach(([k, v]) => (sum.reasons[k] = (sum.reasons[k] ?? 0) + v));
      }
      setPreview(sum);
    } catch (e) {
      fail('preview', e);
    } finally {
      setPreviewing(false);
    }
  }, [chunks, mode, proofRef, request, fail]);

  const start = useCallback(async () => {
    if (!mode || sending) return;
    setSending(true);
    setRefusal(null);
    try {
      let current = batch;
      if (!current) {
        const opened = unwrap(await request<Envelope<{ import: { uuid: string } }>>('POST', 'audience/imports', { label: label.trim() || 'Imported list', consent_mode: mode, has_proof: proofRef !== null, proof_ref: proofRef }));
        current = { uuid: opened.import.uuid, nextChunk: 1 };
        setBatch(current);
      }
      setProgress({ sent: (current.nextChunk - 1) * CHUNK, total: rows.length });
      for (let i = current.nextChunk; i <= chunks.length; i++) {
        await request('POST', `audience/imports/${current.uuid}/rows`, { chunk: i, rows: chunks[i - 1] });
        current = { uuid: current.uuid, nextChunk: i + 1 };
        setBatch(current);
        setProgress({ sent: Math.min(i * CHUNK, rows.length), total: rows.length });
      }
      const done = unwrap(await request<Envelope<{ import: { uuid: string; imported_count: number } }>>('POST', `audience/imports/${current.uuid}/start`, {}));
      setStarted({ uuid: done.import.uuid, imported: done.import.imported_count });
    } catch (e) {
      fail('start', e); // the batch and the next chunk are kept: running start() again resumes
    } finally {
      setSending(false);
    }
  }, [batch, chunks, label, mode, proofRef, request, rows.length, fail, sending]);

  return { fileName, csv, fileError, mapping, mode, proofRef, label, preview, previewing, progress, sending, started, refusal, loadFile, setMapping, setMode, setProofRef, setLabel, runPreview, start, audienceValues };
}
