import { describe, expect, it } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

import { GrowthShareCard, growthCardStyle, readableOn } from '../src/cards/GrowthShareCard';

describe('growth share card (G7e3)', () => {
  it('maps the brand kit onto the PML theme variables and derives readable text', () => {
    const style = growthCardStyle({ accent: '#4361EE', surface: '#111827', 'font-heading': 'Fraunces' }) as Record<string, string>;

    expect(style['--site-accent']).toBe('#4361EE');
    expect(style['--site-accent-text']).toBe('#ffffff');
    expect(style['--site-bg']).toBe('#111827');
    expect(style['--site-text']).toBe('#ffffff');
    expect(style['--site-font-heading']).toBe('Fraunces');
    expect(style['--site-strong']).toBeUndefined();
  });

  it('never invents a brand colour: an unset or malformed kit falls back to neutral', () => {
    const style = growthCardStyle({ accent: 'red', text: undefined }) as Record<string, string>;

    expect(style['--site-accent']).toBe('#334155');
    expect(style['--site-bg']).toBe('#ffffff');
    expect(style['--site-text']).toBe('#0f172a');
    expect(readableOn('#ffffff')).toBe('#0f172a');
  });

  it('draws the nodes through the product renderer at 1200x630 with the alt text', () => {
    const seen: unknown[] = [];
    const Card = ({ nodes, site }: { nodes: never[]; site: object }) => {
      seen.push({ nodes, site });
      return <div data-testid="card">drawn</div>;
    };
    const { getByRole, getByTestId } = render(
      <GrowthShareCard payload={{ card: { nodes: [{ primitive: 'heading' }], alt: 'Proof of funds' }, theme: { accent: '#4361EE' } }} Card={Card} />,
    );

    expect(getByRole('main').getAttribute('aria-label')).toBe('Proof of funds');
    expect(getByRole('main').style.width).toBe('1200px');
    expect(getByTestId('card').textContent).toBe('drawn');
    expect(seen[0]).toEqual({ nodes: [{ primitive: 'heading' }], site: { theme: { accent: '#4361EE' } } });
  });
});
