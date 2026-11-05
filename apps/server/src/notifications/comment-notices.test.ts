/** How a comment names an account: `@` and its full or given name, not the start of a longer word. */
import { describe, expect, it } from 'vitest';
import { callNames, mentions } from './comment-notices';

describe('mentions', () => {
  it('finds @Name in any case, at a word’s end only', () => {
    expect(mentions('@Linh xem giúp nhé', 'Linh')).toBe(true);
    expect(mentions('nhờ @linh, cảm ơn', 'Linh')).toBe(true);
    expect(mentions('@Linhxinh xem giúp', 'Linh')).toBe(false);
    expect(mentions('Linh xem giúp', 'Linh')).toBe(false);
    expect(mentions('@Trần Linh ơi', 'Trần Linh')).toBe(true);
  });

  it('calls an account by its full name or its given name', () => {
    expect(callNames('Trần  Thị Linh')).toEqual(['Trần Thị Linh', 'Linh']);
    expect(callNames('Đạt')).toEqual(['Đạt']);
  });
});
