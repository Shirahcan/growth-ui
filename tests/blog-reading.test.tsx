import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { KeepReading, RememberReading, guestReadingStore, type ReadingHistoryPorts } from '../src';
import type { PublicBlogCard } from '../src/public';

const card = (slug: string, title: string): PublicBlogCard => ({
  slug, title, answer: `${title} in short.`, category: { slug: 'express-entry', name: 'Express Entry' },
  author_name: null, published_at: null, updated_at: null,
});

describe('keep reading (a guest history kept only in the browser)', () => {
  beforeEach(() => window.localStorage.clear());

  it('records this view and moves what the guest already read to the end, marked', () => {
    window.localStorage.setItem('test.read', JSON.stringify([{ slug: 'pnp-basics', title: 'PNP basics', at: '2026-11-01T00:00:00Z' }]));

    render(<KeepReading slug="crs-explained" title="CRS explained" related={[card('pnp-basics', 'PNP basics'), card('study-permits', 'Study permits')]} storageKey="test.read" />);

    const titles = screen.getAllByRole('link').map((a) => a.textContent);
    expect(titles).toEqual(['Study permits', 'PNP basics']);
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getAllByRole('link')[0]?.getAttribute('href')).toBe('/blog/study-permits');
    const kept = JSON.parse(window.localStorage.getItem('test.read') ?? '[]') as { slug: string }[];
    expect(kept.map((e) => e.slug)).toEqual(['crs-explained', 'pnp-basics']);
  });

  it('says so when every related post was read, and draws nothing without related posts', () => {
    window.localStorage.setItem('test.all', JSON.stringify([{ slug: 'pnp-basics', title: 'PNP basics', at: '2026-11-01T00:00:00Z' }]));
    const { unmount } = render(<KeepReading slug="x" title="X" related={[card('pnp-basics', 'PNP basics')]} storageKey="test.all" words={{ allRead: 'All read.', seeAll: 'Every guide' }} />);
    expect(screen.getByText(/All read\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Every guide' }).getAttribute('href')).toBe('/blog');
    unmount();

    const { container } = render(<KeepReading slug="x" title="X" related={[]} storageKey="test.none" />);
    expect(container.innerHTML).toBe('');
  });

  it('reads a blocked or broken store as nothing read, never an error', () => {
    window.localStorage.setItem('test.broken', '{not json');
    expect(guestReadingStore('test.broken').snapshot()).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => guestReadingStore('test.broken').record('a', 'A')).not.toThrow();
    spy.mockRestore();
  });
});

describe('remember what I read (signed-in readers, off until they say yes)', () => {
  let ports: { get: Mock; set: Mock; record: Mock; forYou: Mock };
  const history = () => ports as unknown as ReadingHistoryPorts;
  beforeEach(() => {
    ports = {
      get: vi.fn().mockResolvedValue({ enabled: false }),
      set: vi.fn().mockImplementation(async (enabled: boolean) => ({ enabled })),
      record: vi.fn().mockResolvedValue({ recorded: true }),
      forYou: vi.fn().mockResolvedValue({ posts: [{ slug: 'pnp-basics', title: 'PNP basics' }] }),
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a guest nothing and asks the product nothing', () => {
    const { container } = render(<RememberReading slug="crs-explained" signedIn={false} history={history()} />);
    expect(container.innerHTML).toBe('');
    expect(ports.get).not.toHaveBeenCalled();
  });

  it('sends nothing about what they read until they turn it on, then records and picks', async () => {
    render(<RememberReading slug="crs-explained" signedIn history={history()} />);
    await screen.findByRole('complementary', { name: 'Reading history' });
    expect(ports.record).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remember what I read' })); });

    expect(ports.set).toHaveBeenCalledWith(true);
    expect(ports.record).toHaveBeenCalledWith('crs-explained');
    expect((await screen.findByRole('link', { name: 'PNP basics' })).getAttribute('href')).toBe('/blog/pnp-basics');
  });

  it('turning it off clears the picks; a failure goes to onError and keeps the panel', async () => {
    ports.get.mockResolvedValue({ enabled: true });
    const onError = vi.fn();
    render(<RememberReading slug="crs-explained" signedIn history={history()} onError={onError} />);
    await screen.findByRole('link', { name: 'PNP basics' });

    ports.set.mockRejectedValueOnce(new Error('down'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn it off and delete it' })); });
    expect(onError).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'PNP basics' })).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Turn it off and delete it' })); });
    await waitFor(() => expect(screen.getByRole('complementary', { name: 'Reading history' })).toBeTruthy());
    expect(ports.set).toHaveBeenLastCalledWith(false);
  });
});
