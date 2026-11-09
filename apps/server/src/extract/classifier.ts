/**
 * The "Jev phân loại" step of C16: where an uploaded file probably belongs, for its owner to accept or not. One Jev
 * call: a `choice` of Collection among those of the owner's visible Spaces (or none), and one `noul` per candidate
 * tag. Candidate tags come from the text itself: the technical terms it keeps using (acronyms such as DNS, names such
 * as Kubernetes written mid-sentence), since Knowledge Base has no tag vocabulary of its own. Runs for everyone on the
 * server's Jev key; the owner's own AI key is never involved.
 */
import type { CollectionOption } from '../access/extraction';
import type { ExtractSuggestions } from '../db/schema';
import { JEV_MAX_CHOICE_OPTIONS, type JevJudge, type JevQuestion } from '../jev/jev-client';
import { JEV_EXTRACT_TIMEOUT_MS, sampleOf } from './quality-validator';

export const MAX_TAG_CANDIDATES = 8;
/** A tag Jev judges at least this likely is suggested. */
export const MIN_TAG_NOUL = 0.5;
const SAMPLE_CHARS = 3_000;
const NONE = 'none';
const ACRONYM = /^(?=.*[A-Z])[A-Z0-9][A-Z0-9.+#/-]{1,14}$/;
const NAME = /^[A-Z][a-z0-9]+(?:[A-Z.+#-][A-Za-z0-9]*)*$/;
const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu;
/** Words that look like terms but say nothing about a topic (page headings, Roman numerals, units). */
const NOT_TAGS = new Set(['Trang', 'Page', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'OK', 'MB', 'KB', 'GB']);

/** Terms the text uses at least twice, most used first (ties: first seen), at most MAX_TAG_CANDIDATES. */
export function candidateTags(text: string): string[] {
  const counts = new Map<string, { term: string; n: number; first: number }>();
  let seen = 0;
  for (const sentence of text.split(/[.!?:;\n]+\s*/)) {
    const words = sentence.split(/\s+/).map((w) => w.replace(EDGE_PUNCTUATION, ''));
    words.forEach((word, i) => {
      // A capitalised word opening a sentence is just a sentence start; an acronym counts anywhere.
      const term = ACRONYM.test(word) || (i > 0 && NAME.test(word)) ? word : null;
      if (!term || NOT_TAGS.has(term) || /^[\d.+#/-]+$/.test(term)) return;
      const key = term.toLowerCase();
      const entry = counts.get(key) ?? { term, n: 0, first: seen++ };
      entry.n += 1;
      counts.set(key, entry);
    });
  }
  return [...counts.values()]
    .filter((e) => e.n >= 2)
    .sort((a, b) => b.n - a.n || a.first - b.first)
    .slice(0, MAX_TAG_CANDIDATES)
    .map((e) => e.term);
}

function collectionLabel(option: CollectionOption): string {
  const vi = `${option.spaceNameVi} › ${option.nameVi}`;
  const en = `${option.spaceNameEn} › ${option.nameEn}`;
  return vi === en ? vi : `${vi} (${en})`;
}

/**
 * Jev's suggestions for a document titled `title` with this text; rejects when Jev fails (the step is then skipped,
 * the file is still indexed).
 */
export async function classify(jev: JevJudge, title: string, text: string, options: readonly CollectionOption[], tags: readonly string[]): Promise<ExtractSuggestions> {
  const offered = options.slice(0, JEV_MAX_CHOICE_OPTIONS - 1);
  const optionId = (i: number): string => `c${i}`;
  const tagId = (i: number): string => `t${i}`;
  const questions: Record<string, JevQuestion> = {};
  if (offered.length > 0) {
    questions.collection = {
      type: 'choice',
      instructions: 'Which Collection of a knowledge base does the uploaded `document` belong in? Each option is "Space › Collection".',
      criteria: {
        ...Object.fromEntries(offered.map((option, i) => [optionId(i), collectionLabel(option)])),
        [NONE]: 'None of these Collections is about what the document covers',
      },
    };
  }
  tags.forEach((tag, i) => {
    questions[tagId(i)] = {
      type: 'noul',
      instructions: `Is "${tag}" a fitting tag for the uploaded \`document\`, i.e. one of the topics it is about?`,
      criteria: { true: 'The document is substantially about this topic', false: 'The term is only mentioned in passing, or unrelated' },
    };
  });
  if (Object.keys(questions).length === 0) return { status: 'pending', collection: null, tags: [] };

  const state = { document: { title, text: sampleOf(text, SAMPLE_CHARS) } };
  const { answers } = await jev.ask('extract-classify', state, questions, { timeoutMs: JEV_EXTRACT_TIMEOUT_MS });
  let collection: ExtractSuggestions['collection'] = null;
  const chosen = answers.collection;
  if (chosen?.type === 'choice' && chosen.choice !== NONE) {
    const index = Number(chosen.choice.slice(1));
    const option = chosen.choice.startsWith('c') && Number.isInteger(index) ? offered[index] : undefined;
    if (option) {
      const probability = chosen.probabilities[chosen.choice] ?? chosen.confidence;
      collection = { collectionId: option.collectionId, spaceId: option.spaceId, probability: Math.round(probability * 100) / 100 };
    }
  }
  const suggestedTags = tags
    .flatMap((tag, i) => {
      const answer = answers[tagId(i)];
      return answer?.type === 'noul' && answer.noul >= MIN_TAG_NOUL ? [{ tag, probability: Math.round(answer.noul * 100) / 100 }] : [];
    })
    .sort((a, b) => b.probability - a.probability);
  return { status: 'pending', collection, tags: suggestedTags };
}
