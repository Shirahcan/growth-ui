import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { FilePicker, accepts } from '../src/ui/FilePicker';

/** The one file picker (owner 2026-11-17: the browser's own "Choose File" looked out of place). */
function Harness({ removable }: { removable?: boolean }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <>
      <label htmlFor="doc">The document</label>
      <FilePicker id="doc" accept=".pdf,.md" kinds="a PDF or a Markdown file" file={file} onPick={setFile} removable={removable} />
    </>
  );
}

const md = () => new File(['# Hello'], 'post.md', { type: 'text/markdown' });

describe('FilePicker', () => {
  it('reads the accept list as the browser does', () => {
    expect(accepts('.pdf,.md', md())).toBe(true);
    expect(accepts('.pdf', md())).toBe(false);
    expect(accepts('image/*', new File([''], 'a.png', { type: 'image/png' }))).toBe(true);
    expect(accepts('image/png', new File([''], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
    expect(accepts('', md())).toBe(true);
  });

  it('offers one button, then the chosen file with Change and Remove', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('The document'), { target: { files: [md()] } });
    expect(screen.getByText('post.md')).toBeTruthy();
    expect(screen.getByText('7 bytes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove post.md' }));
    expect(screen.queryByText('post.md')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeTruthy();
  });

  it('takes a dropped file and refuses a kind it does not list, saying which kinds it takes', () => {
    const { container } = render(<Harness />);
    const area = container.querySelector('.gr-file') as HTMLElement;

    fireEvent.drop(area, { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } });
    expect(screen.getByRole('alert').textContent).toBe('photo.png cannot be used here. Choose a PDF or a Markdown file.');
    expect(screen.queryByText('photo.png', { selector: '.gr-file-name' })).toBeNull();

    fireEvent.drop(area, { dataTransfer: { files: [md()] } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('post.md')).toBeTruthy();
  });

  it('leaves Remove out where the flow cannot drop the file', () => {
    render(<Harness removable={false} />);
    fireEvent.change(screen.getByLabelText('The document'), { target: { files: [md()] } });

    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});
