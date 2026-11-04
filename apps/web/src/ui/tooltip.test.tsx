import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from './icon-button';
import { Tooltip } from './tooltip';

describe('Tooltip and IconButton', () => {
  it('describes its trigger and names the icon button', () => {
    render(<Tooltip text="Canvas · C">{(describedBy) => <IconButton label="Canvas" icon="graph-tree" aria-describedby={describedBy} />}</Tooltip>);
    const button = screen.getByRole('button', { name: 'Canvas' });
    expect(screen.getByRole('tooltip').id).toBe(button.getAttribute('aria-describedby'));
  });
});
