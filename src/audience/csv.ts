/**
 * A small RFC 4180 reader for uploaded contact lists (G4e4b3): quoted fields, "" inside quotes, commas and
 * line breaks inside quotes, CRLF or LF, a leading byte-order mark, and a semicolon file (Excel in many
 * locales) told apart by its header line. The file never leaves the browser: only the mapped rows do.
 */
export interface Csv {
  header: string[];
  rows: string[][];
}

export const MAX_ROWS = 50000;

export class CsvError extends Error {}

export function parseCsv(text: string): Csv {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.slice(0, body.search(/\r?\n/) === -1 ? body.length : body.search(/\r?\n/));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((v) => v.trim() !== ''));
  const header = (nonEmpty.shift() ?? []).map((h) => h.trim());
  if (header.length === 0 || header.every((h) => h === '')) {
    throw new CsvError('The first row must name the columns (for example Email, Name, Type, Date).');
  }
  if (nonEmpty.length > MAX_ROWS) {
    throw new CsvError(`The list has more than ${MAX_ROWS.toLocaleString()} rows. Split it into smaller files.`);
  }

  return { header, rows: nonEmpty.map((r) => header.map((_, i) => (r[i] ?? '').trim())) };
}
