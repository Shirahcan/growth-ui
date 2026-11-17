import { useEffect, useRef, useState, type DragEvent } from 'react';

/**
 * One file, picked or dropped (owner 2026-11-17: the browser's own "Choose File / No file chosen" looked out of place).
 * A dashed drop area with one pill button; once chosen, the file's row with its name and size, and Change / Remove.
 * Every look is a --gr-* value through styles.css, as with the other primitives.
 *
 * The browser's input stays (hidden, out of the tab order) so the field's label still opens the chooser; the button is
 * the one place a keyboard lands. A dropped file of a kind `accept` does not list is refused here, with `kinds` as why.
 */
export interface FilePickerProps {
  /** The Field's id, for its label. */
  id: string;
  /** As the input's `accept`: extensions (".pdf") and types ("image/png", "image/*"). */
  accept: string;
  /** The file as chosen; a step that keeps only a name (an upload already sent) passes `{ name }`. */
  file: File | PickedFile | null;
  onPick: (file: File | null) => void;
  /** What may be dropped, in words ("a PDF, a Word document, or a text or Markdown file"), for a refused drop. */
  kinds: string;
  disabled?: boolean;
  /** The field's own problem (too big, refused upstream): drawn as the area's danger border. */
  invalid?: boolean;
  /** Offer Remove once chosen (default). Off where the flow keeps a file it cannot drop, which is then Changed. */
  removable?: boolean;
}

/** A file already chosen and handed on, known by its name (and size when kept). */
export interface PickedFile {
  name: string;
  size?: number;
}

export function FilePicker({ id, accept, file, onPick, kinds, disabled = false, invalid = false, removable = true }: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const choose = () => input.current?.click();
  const take = (picked: File | null) => {
    if (picked && !accepts(accept, picked)) {
      setRefused(`${picked.name} cannot be used here. Choose ${kinds}.`);
      return;
    }
    setRefused(null);
    onPick(picked);
    // The same file chosen again after Remove still fires a change.
    if (input.current) input.current.value = '';
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div className="gr-stack-tight">
      <div
        className={`gr-file${file ? ' gr-file-chosen' : ''}`}
        data-over={over ? 'true' : undefined}
        data-invalid={invalid || refused ? 'true' : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          tabIndex={-1}
          className="gr-visually-hidden"
          disabled={disabled}
          onChange={(e) => take(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            {file instanceof File && file.type.startsWith('image/') ? <Thumb key={`${file.name}:${file.size}:${file.lastModified}`} file={file} /> : <span className="gr-file-icon" aria-hidden="true"><DocumentIcon /></span>}
            <span className="gr-file-text">
              <span className="gr-file-name" title={file.name}>{file.name}</span>
              {typeof file.size === 'number' ? <span className="gr-file-meta">{sizeOf(file.size)}</span> : null}
            </span>
            <span className="gr-file-actions">
              <button type="button" className="gr-button gr-button-quiet" onClick={choose} disabled={disabled}>
                Change
              </button>
              {removable ? (
                <button type="button" className="gr-button gr-button-quiet" onClick={() => take(null)} disabled={disabled} aria-label={`Remove ${file.name}`}>
                  Remove
                </button>
              ) : null}
            </span>
          </>
        ) : (
          <>
            <span className="gr-file-icon" aria-hidden="true"><UploadIcon /></span>
            <span className="gr-file-text">Drop the file here, or choose it from your computer.</span>
            <span className="gr-file-actions">
              <button type="button" className="gr-button gr-button-quiet" onClick={choose} disabled={disabled}>
                Choose a file
              </button>
            </span>
          </>
        )}
      </div>
      {refused ? <p className="gr-field-error" role="alert">{refused}</p> : null}
    </div>
  );
}

/** Whether `accept` lists the file, as the browser's chooser would. Exported for the tests. */
export function accepts(accept: string, file: File): boolean {
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return tokens.some((t) => (t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}

function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Thumb({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return <img src={url} alt="" className="gr-file-thumb" />;
}

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
