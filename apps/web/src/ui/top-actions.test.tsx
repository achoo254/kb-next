import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { TopActions } from './top-actions';

describe('TopActions', () => {
  it('shows the bell with the unread count in its name and the command link', () => {
    renderWithI18n(<TopActions inboxHref="/inbox" unread={3} searchHref="/search" />);
    expect(screen.getByRole('link', { name: 'Notifications, 3 unread' }).getAttribute('href')).toBe('/inbox');
    expect(screen.getByRole('link', { name: 'Quick search and commands (⌘K)' }).getAttribute('href')).toBe('/search');
  });

  it('drops the count when everything is read', () => {
    renderWithI18n(<TopActions inboxHref="/inbox" unread={0} searchHref="/search" />);
    expect(screen.getByRole('link', { name: 'Notifications' })).toBeTruthy();
  });
});
