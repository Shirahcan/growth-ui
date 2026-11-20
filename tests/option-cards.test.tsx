import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emailCanvasFrame } from '../src/campaigns/emailCanvas';
import { OptionCards } from '../src/ui/primitives';

/** Owner 2026-11-20: a wizard step's 2-3 options are cards, one per row, each saying what it means. */
describe('option cards', () => {
  it('draws each option as a radio card with its line, and says which is chosen', () => {
    const onChange = vi.fn();
    render(
      <OptionCards<'post' | 'email'>
        label="What it is for"
        value="post"
        options={[
          { value: 'post', label: 'A blog post template', hint: 'What new blog posts start from.' },
          { value: 'email', label: 'A newsletter template', hint: 'What new newsletters start from.' },
        ]}
        onChange={onChange}
      />,
    );

    const cards = screen.getAllByRole('radio');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'A newsletter template' })).toBeTruthy();
    expect(screen.getByText('What new newsletters start from.')).toBeTruthy();
    fireEvent.click(cards[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('email');
  });
});

describe('the email canvas frame', () => {
  it('sets the renderer variables from the sent email palette, with pill buttons', () => {
    const frame = emailCanvasFrame({ colors: { accent: '#4361EE', on_accent: '#FFFFFF', text: '#1F2937', muted: '#6B7280', surface: '#F3F4F6', card: '#FFFFFF' }, font: 'Arial, sans-serif' });
    const style = frame?.style as Record<string, string>;

    expect(style['--site-accent']).toBe('#4361EE');
    expect(style['--site-accent-text']).toBe('#FFFFFF');
    expect(style['--site-button-radius']).toBe('9999px');
    expect(emailCanvasFrame(null)).toBeUndefined();
  });
});
