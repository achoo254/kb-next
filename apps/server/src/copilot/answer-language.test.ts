import { describe, expect, it } from 'vitest';
import { answerPrompt } from './answer-prompt';
import { guessLanguage } from './passages';

const SOURCES = [{ n: 1, title: 'Giao thức DHCP', section: null, text: 'Máy mới xin IP qua 4 bước DORA.' }];

describe('answer language', () => {
  it('reads Vietnamese from its letters, else English (Jev decides when it is on)', () => {
    expect(guessLanguage('Giải thích “TCP và UDP”')).toBe('vi');
    expect(guessLanguage('how does DHCP assign an IP?')).toBe('en');
  });

  it('names the language in the prompt, so Vietnamese sources do not pull an English question into Vietnamese', () => {
    // Seen on prod 05/11/2026: "how does DHCP assign an IP?" answered in Vietnamese from the Vietnamese lab.
    expect(answerPrompt('answer', 'how does DHCP assign an IP?', null, SOURCES, 'en').system).toContain('Write the whole answer in English');
    expect(answerPrompt('explain', '', 'Máy mới xin IP qua 4 bước.', SOURCES, 'vi').system).toContain('Write the whole answer in Vietnamese');
  });
});
