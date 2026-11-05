/**
 * The Markdown of a journey, made from its steps on every save of the builder (C07): what search indexes, what the
 * review queue and the history show, and what makes a journey with no step impossible to send for review (the body is
 * empty). Never edited by hand: the editor (C02) refuses journeys. Once published it is read by everyone, so the caller
 * gives a step whose document is not public, and whose title is that document's, PRIVATE_STEP_TITLE instead.
 */
import type { JourneyStepKind } from '../access/journeys';

export interface JourneyTextStep {
  kind: JourneyStepKind;
  title: string;
  minutes: number;
  note: string | null;
}

const KIND_WORDS: Record<'vi' | 'en', Record<JourneyStepKind, string>> = {
  vi: { read: 'Đọc', lab: 'Thử lab', quiz: 'Câu hỏi kiểm tra', note: 'Ghi chú' },
  en: { read: 'Read', lab: 'Lab', quiz: 'Quiz', note: 'Note' },
};

const MINUTES: Record<'vi' | 'en', string> = { vi: 'phút', en: 'min' };

/** What a step reads as where its document's own title may not show (a text not everyone may open). */
export const PRIVATE_STEP_TITLE: Record<'vi' | 'en', string> = { vi: 'Tài liệu riêng tư', en: 'Private document' };

/** Characters Markdown would read as formatting in a step's title or note. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/([\\`*_[\]#<>|])/g, '\\$1');
}

/** One numbered line per step ("1. **ARP tìm MAC router** · Đọc · 6 phút"), its note indented under it. */
export function journeyBody(steps: readonly JourneyTextStep[], lang: 'vi' | 'en'): string {
  return steps
    .map((step, i) => {
      const line = `${i + 1}. **${plain(step.title)}** · ${KIND_WORDS[lang][step.kind]} · ${step.minutes} ${MINUTES[lang]}`;
      const note = step.note ? plain(step.note) : '';
      return note ? `${line}\n   ${note}` : line;
    })
    .join('\n');
}
