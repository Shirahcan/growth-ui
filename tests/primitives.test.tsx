import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, GrowthProvider, Kebab, useGrowth } from '../src';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function Wrap({ children, onNotice, onError = vi.fn() }: { children: React.ReactNode; onNotice?: (m: string) => void; onError?: (e: unknown) => void }) {
  return (
    <GrowthProvider product="portify" request={vi.fn()} hrefFor={hrefFor} onError={onError} onNotice={onNotice} theme={{ accent: '#123456' }}>
      {children}
    </GrowthProvider>
  );
}

describe('primitives', () => {
  it('the kebab puts a destructive item last, apart, and hides hidden items', () => {
    render(
      <Wrap>
        <Kebab label="Idea actions" items={[{ label: 'Remove', danger: true, onSelect: vi.fn() }, { label: 'Copy', onSelect: vi.fn() }, { label: 'Secret', hidden: true, onSelect: vi.fn() }]} />
      </Wrap>,
    );
    fireEvent.click(screen.getByLabelText('Idea actions'));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Copy', 'Remove']);
    expect(items[1]?.className).toContain('gr-menu-item-apart');
  });

  it('a menu stacks above a dialog backdrop, so a kebab inside a dialog opens in front of it', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
    const z = (selector: string) => Number(new RegExp(`\\${selector} \\{[^}]*?z-index: (\\d+)`).exec(css)?.[1]);
    expect(z('.gr-menu')).toBeGreaterThan(z('.gr-scrim'));
  });

  it('a kebab on the left half opens rightward, one on the right half leftward', () => {
    Object.assign(window, { innerWidth: 1200, innerHeight: 800 });
    const at = (left: number) => ({ left, right: left + 32, top: 700, bottom: 732, width: 32, height: 32, x: left, y: 700, toJSON: () => ({}) }) as DOMRect;
    render(
      <Wrap>
        <Kebab label="Left" items={[{ label: 'Copy', onSelect: vi.fn() }]} />
        <Kebab label="Right" items={[{ label: 'Copy', onSelect: vi.fn() }]} />
      </Wrap>,
    );
    vi.spyOn(screen.getByLabelText('Left'), 'getBoundingClientRect').mockReturnValue(at(360));
    vi.spyOn(screen.getByLabelText('Right'), 'getBoundingClientRect').mockReturnValue(at(1000));

    fireEvent.click(screen.getByLabelText('Left'));
    const left = screen.getByRole('menu');
    expect(left.style.left).toBe('360px');
    expect(left.style.right).toBe('');
    fireEvent.click(screen.getByLabelText('Left'));

    fireEvent.click(screen.getByLabelText('Right'));
    const right = screen.getByRole('menu');
    expect(right.style.right).toBe('168px'); // 1200 - 1032
    expect(right.style.left).toBe('');
  });

  it('a dialog is drawn on the body with the theme, its body scrolls and its footer stays pinned', () => {
    render(
      <Wrap>
        <Dialog title="Skip this idea" onClose={vi.fn()} footer={<button>Skip</button>}>
          <p>Why?</p>
        </Dialog>
      </Wrap>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Skip this idea' });
    expect(dialog.className).toContain('gr-dialog');
    expect(dialog.querySelector('.gr-dialog-body')).not.toBeNull();
    expect(dialog.querySelector('.gr-dialog-foot')?.textContent).toBe('Skip');
    const portal = dialog.closest('[data-growth-portal]') as HTMLElement;
    expect(portal.parentElement).toBe(document.body);
    expect(portal.style.getPropertyValue('--gr-accent')).toBe('#123456');
  });

  it('notify and onError reach the host', () => {
    const onNotice = vi.fn();
    const onError = vi.fn();
    let growth: ReturnType<typeof useGrowth> | null = null;
    function Probe() {
      growth = useGrowth();
      return null;
    }
    render(
      <Wrap onNotice={onNotice} onError={onError}>
        <Probe />
      </Wrap>,
    );
    act(() => {
      growth!.notify('Added to the plan.');
      growth!.onError(new Error('x'));
    });
    expect(onNotice).toHaveBeenCalledWith('Added to the plan.');
    expect(onError).toHaveBeenCalled();
  });
});
