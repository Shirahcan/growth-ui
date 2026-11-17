import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlogCategories, GrowthProvider, categoryBodyFrom, categoryDraftFrom, slugFrom, type BlogCategory } from '../src';

const hrefFor = (tab: string) => `/admin/growth/${tab}`;

function mount(request: ReturnType<typeof vi.fn>, opts: { onNotice?: ReturnType<typeof vi.fn>; onError?: ReturnType<typeof vi.fn> } = {}) {
  return render(
    <GrowthProvider
      product="portify"
      request={request as never}
      hrefFor={hrefFor as never}
      onError={opts.onError ?? vi.fn()}
      onNotice={opts.onNotice ?? vi.fn()}
      words={{ audiences: { applicants: 'Applicants', employers: 'Employers' }, product: 'Portify' }}
    >
      <BlogCategories onClose={vi.fn()} />
    </GrowthProvider>,
  );
}

const refusal = (errors: Record<string, string[]>) => Object.assign(new Error('refused'), { response: { status: 422, data: { errors } } });

const ee: BlogCategory = { id: 4, slug: 'express-entry', name: 'Express Entry', description: 'Points, draws and profiles.', audience: 'applicants', sort: 1, is_active: true, posts: 12, updated_at: null };
const old: BlogCategory = { id: 9, slug: 'old-news', name: 'Old news', description: null, audience: null, sort: 5, is_active: false, updated_at: null };

/** Growth > Blog > Categories (blog on growth-service S5): one dialog for the list, the editor and the delete question. */
describe('the blog categories manager', () => {
  it('lists each category with its address, audience, post count and state, and every change sits behind the row menu', async () => {
    const request = vi.fn(async () => ({ data: { categories: [ee, old] } }));
    mount(request);

    expect(await screen.findByText('Express Entry')).toBeTruthy();
    // The provider always passes a body argument (undefined for a read), so compare the method and the address.
    expect(request.mock.calls[0].slice(0, 2)).toEqual(['GET', 'blog/categories']);
    expect(screen.getByText('/express-entry')).toBeTruthy();
    expect(screen.getByText('Applicants')).toBeTruthy();
    expect(screen.getByText('12 posts')).toBeTruthy();
    expect(screen.getByText('Every reader')).toBeTruthy();
    expect(screen.getByText('Switched off')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Actions for Old news'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Edit', 'Copy web address part', 'Switch on', 'Delete']);
  });

  it('adds a category: the web address part follows the name until it is typed, and the service gets clean values', async () => {
    const onNotice = vi.fn();
    const request = vi.fn(async (method: string) => (method === 'GET' ? { data: { categories: [] } } : { data: { category: {} } }));
    mount(request, { onNotice });

    expect(await screen.findByText(/No categories yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add a category' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Study Permits & PGWP' } });
    expect((screen.getByLabelText('Web address part') as HTMLInputElement).value).toBe('study-permits-pgwp');
    fireEvent.change(screen.getByLabelText('Who it is for'), { target: { value: 'applicants' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('POST', 'blog/categories', {
        name: 'Study Permits & PGWP', slug: 'study-permits-pgwp', description: null, audience: 'applicants', sort: 0, is_active: true,
      }),
    );
    await waitFor(() => expect(onNotice).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Add a category' })).toBeTruthy(); // back on the list
  });

  it('warns before a saved category moves to a new address, and a refused address is shown in place', async () => {
    const onError = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === 'GET') return { data: { categories: [ee] } };
      throw refusal({ slug: ['Another category already uses that web address part.'] });
    });
    mount(request, { onError });

    fireEvent.click(await screen.findByLabelText('Actions for Express Entry'));
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Express Entry draws' } });
    expect((screen.getByLabelText('Web address part') as HTMLInputElement).value).toBe('express-entry'); // a saved address never follows the name
    fireEvent.change(screen.getByLabelText('Web address part'), { target: { value: 'ee' } });
    expect(screen.getByText(/links to the old one stop working/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toBe('Another category already uses that web address part.');
    expect(screen.getByRole('button', { name: 'Save category' })).toBeTruthy(); // still editing
    expect(onError).not.toHaveBeenCalled();
  });

  it('a category still used by posts is not deleted, and the service says why in its own words', async () => {
    const onNotice = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === 'GET') return { data: { categories: [ee] } };
      throw refusal({ category: ['12 posts use this category. Move them first, or switch the category off.'] });
    });
    mount(request, { onNotice });

    fireEvent.click(await screen.findByLabelText('Actions for Express Entry'));
    fireEvent.click(screen.getByText('Delete'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Express Entry"?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('DELETE', 'blog/categories/4', {}));
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toBe('12 posts use this category. Move them first, or switch the category off.');
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('switching a category off sends only that', async () => {
    const request = vi.fn(async (method: string) => (method === 'GET' ? { data: { categories: [ee] } } : { data: {} }));
    mount(request);

    fireEvent.click(await screen.findByLabelText('Actions for Express Entry'));
    fireEvent.click(screen.getByText('Switch off'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('PUT', 'blog/categories/4', { is_active: false }));
  });

  it('read across every product (the estate portal), nothing offered changes anything', async () => {
    const request = vi.fn(async () => ({ data: { categories: [ee] } }));
    render(
      <GrowthProvider estate={{ products: [{ key: 'portify', label: 'Portify' }] }} request={request as never} hrefFor={hrefFor as never} onError={vi.fn()}>
        <BlogCategories onClose={vi.fn()} />
      </GrowthProvider>,
    );

    fireEvent.click(await screen.findByLabelText('Actions for Express Entry'));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Copy web address part']);
    expect(screen.queryByRole('button', { name: 'Add a category' })).toBeNull();
  });

  it('turns a name into a web address part and a draft into the body the service takes', () => {
    expect(slugFrom('Études & Permis (Québec)')).toBe('etudes-permis-quebec');
    expect(slugFrom('  --Work   permits--  ')).toBe('work-permits');
    expect(slugFrom('a'.repeat(90))).toHaveLength(80);

    const draft = { ...categoryDraftFrom(old), description: '  ', sort: 'x', audience: '' };
    expect(categoryBodyFrom(draft)).toEqual({ name: 'Old news', slug: 'old-news', description: null, audience: null, sort: 0, is_active: false });
  });
});
