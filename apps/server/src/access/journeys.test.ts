import { describe, expect, it } from 'vitest';
import { isCopiedTitle } from './journeys';

describe('a step title copied from its document', () => {
  it('is the document’s title, or its start cut to one line, case and diacritics aside', () => {
    expect(isCopiedTitle('DHCP trên router nhà', 'DHCP trên router nhà')).toBe(true);
    expect(isCopiedTitle('dhcp tren router…', 'DHCP trên router nhà')).toBe(true);
    // A short label the title starts with is hidden too (the safe side); a label of the author's own is not.
    expect(isCopiedTitle('DHCP', 'DHCP trên router nhà')).toBe(true);
    expect(isCopiedTitle('Thử ở nhà', 'DHCP trên router nhà')).toBe(false);
    expect(isCopiedTitle('  ', 'DHCP trên router nhà')).toBe(false);
  });
});
