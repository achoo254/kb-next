/**
 * Jev's pre-review of a text sent for review (A01 "Jev sơ duyệt"): four judgments for the admin to weigh, never a
 * verdict. `onTopic` (Score, fits the Space it is in), `hasSources` (Noul, says where it comes from), `duplicate`
 * (Noul, repeats one of the closest published texts the search finds, `duplicateOf` naming the likeliest) and
 * `inappropriate` (Noul, language unfit to publish). Without Jev, or when it fails, the submission stands without
 * scores (null); a judgment Jev did not answer is left out.
 */
import { listChunks } from '../access/content';
import type { DocumentRow } from '../access/content';
import { findDocumentsByIds, spacesById } from '../access/reading';
import { firstPassages, listSearchableDocuments, searchChunks } from '../access/search';
import { GUEST, type Viewer } from '../access/viewer';
import type { Db } from '../db/client';
import type { JevPreReview } from '../db/schema';
import type { JevJudge, JevQuestion } from '../jev/jev-client';
import { safeErrorText } from '../log-error';
import type { MeiliClient } from '../search/meili-client';

export const PRE_REVIEW_PURPOSE = 'pre-review';
export const PRE_REVIEW_TIMEOUT_MS = 6_000;
/** Characters of the text Jev reads, and of each candidate it compares with. */
const TEXT_CHARS = 4_000;
const CANDIDATE_CHARS = 400;
/** Published texts the duplicate check compares with. */
export const DUPLICATE_CANDIDATES = 5;

const ON_TOPIC_LEVELS = [
  'The text has nothing to do with the topic of the Space',
  'The text touches the Space’s field only in passing',
  'The text is about a neighbouring topic a reader of the Space might still want',
  'The text clearly belongs in the Space',
  'The text is squarely about the Space’s core topic',
];

export interface PreReviewDeps {
  db: Db;
  jev: JevJudge | null;
  /** The search index (null without Meilisearch: the candidates are then the Space's latest published texts). */
  meili: MeiliClient | null;
}

/** The published texts closest to `doc`: the search's top hits on its title, else its Space's texts. */
async function duplicateCandidates(db: Db, meili: MeiliClient | null, doc: DocumentRow): Promise<DocumentRow[]> {
  if (meili) {
    const hits = await searchChunks(db, meili, GUEST, doc.title, { limit: 20 });
    const ids = [...new Set(hits.map((h) => h.documentId))].filter((id) => id !== doc.id).slice(0, DUPLICATE_CANDIDATES);
    if (ids.length > 0) {
      const found = new Map((await findDocumentsByIds(db, GUEST, ids)).map((d) => [d.id, d]));
      return ids.flatMap((id) => found.get(id) ?? []);
    }
  }
  const sameSpace = await listSearchableDocuments(db, GUEST, { spaceIds: [doc.spaceId] });
  return sameSpace
    .filter((d) => d.id !== doc.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, DUPLICATE_CANDIDATES);
}

const candidateId = (i: number): string => `D${i + 1}`;

/** Asks Jev the four questions about `doc` (read as `reader`: its author); null when Jev is off or failed. */
export async function preReview({ db, jev, meili }: PreReviewDeps, reader: Viewer, doc: DocumentRow): Promise<JevPreReview | null> {
  if (!jev) return null;
  try {
    const passages = (await listChunks(db, reader, doc.id)) ?? [];
    const text = passages
      .map((p) => (p.heading ? `## ${p.heading}\n${p.text}` : p.text))
      .join('\n\n')
      .slice(0, TEXT_CHARS);
    const [space] = await spacesById(db, [doc.spaceId]);
    const candidates = await duplicateCandidates(db, meili, doc);
    const firsts = await firstPassages(
      db,
      GUEST,
      candidates.map((c) => c.id),
    );
    const state = {
      text: { title: doc.title, language: doc.lang, body: text },
      space: { name: space?.nameEn ?? '', nameVi: space?.nameVi ?? '', description: space?.descriptionEn ?? space?.descriptionVi ?? '' },
      published: Object.fromEntries(candidates.map((c, i) => [candidateId(i), { title: c.title, start: (firsts.get(c.id)?.text ?? '').slice(0, CANDIDATE_CHARS) }])),
    };
    const questions: Record<string, JevQuestion> = {
      onTopic: { type: 'score', instructions: 'How well does `text` fit the topic of `space`? Either may be in English or Vietnamese.', criteria: ON_TOPIC_LEVELS },
      hasSources: {
        type: 'noul',
        instructions: 'Does `text` say where its knowledge comes from (links, references, a cited standard, a lab or document it builds on)?',
        criteria: { true: 'It cites or links at least one source', false: 'It gives no source at all' },
      },
      inappropriate: {
        type: 'noul',
        instructions: 'Does `text` contain language unfit for a public knowledge base (insults, slurs, harassment, explicit content)?',
        criteria: { true: 'It contains such language', false: 'Its language is fit to publish' },
      },
    };
    for (let i = 0; i < candidates.length; i += 1) {
      questions[`dup${candidateId(i)}`] = {
        type: 'noul',
        instructions: `Does \`text\` repeat what \`published.${candidateId(i)}\` already covers, so that publishing it would add little?`,
        criteria: { true: 'Mostly the same knowledge', false: 'Different, or adds substantially' },
      };
    }
    const { answers } = await jev.ask(PRE_REVIEW_PURPOSE, state, questions, { timeoutMs: PRE_REVIEW_TIMEOUT_MS });
    const scores: JevPreReview = {};
    const onTopic = answers.onTopic;
    if (onTopic?.type === 'score') scores.onTopic = round(onTopic.score / (ON_TOPIC_LEVELS.length - 1));
    const sources = answers.hasSources;
    if (sources?.type === 'noul') scores.hasSources = round(sources.noul);
    const unfit = answers.inappropriate;
    if (unfit?.type === 'noul') scores.inappropriate = round(unfit.noul);
    let top: { id: string; p: number } | null = null;
    for (const [i, c] of candidates.entries()) {
      const answer = answers[`dup${candidateId(i)}`];
      if (answer?.type === 'noul' && (!top || answer.noul > top.p)) top = { id: c.id, p: answer.noul };
    }
    if (top) {
      scores.duplicate = round(top.p);
      scores.duplicateOf = top.id;
    } else if (candidates.length === 0) {
      // Nothing published to repeat.
      scores.duplicate = 0;
      scores.duplicateOf = null;
    }
    return scores;
  } catch (error) {
    console.error('pre-review failed', safeErrorText(error));
    return null;
  }
}

function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
