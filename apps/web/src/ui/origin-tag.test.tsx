import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { OriginTag } from './origin-tag';

describe('OriginTag', () => {
  it.each([
    ['official', 'Official'],
    ['community', 'Community'],
    ['private', 'Yours · private'],
    ['pending', 'Awaiting review'],
  ] as const)('labels %s content in words', (origin, label) => {
    renderWithI18n(<OriginTag origin={origin} />);
    expect(screen.getByText(label).dataset.origin).toBe(origin);
  });
});
