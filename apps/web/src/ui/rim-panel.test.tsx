import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RimPanel } from './rim-panel';

describe('RimPanel', () => {
  it('renders a named section with its look', () => {
    render(
      <RimPanel label="AI Knowledge Assistant" variant="soft" radius="card" tone="warn">
        nội dung
      </RimPanel>,
    );
    const panel = screen.getByRole('region', { name: 'AI Knowledge Assistant' });
    expect(panel.dataset.variant).toBe('soft');
    expect(panel.dataset.radius).toBe('card');
    expect(panel.dataset.tone).toBe('warn');
  });
});
